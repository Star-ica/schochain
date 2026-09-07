"""Proposals API — create, sign, execute governance proposals."""

from fastapi import APIRouter, Depends, HTTPException
from decimal import Decimal

from ..models.schemas import (
    CreatePaymentProposalRequest, CreateProposalResponse,
    ProposalResponse, SignProposalRequest,
    ExecutionMode, RiskLevel,
)
from ..services.web3_service import Web3Service, get_web3_service
from ..services.db_service import TreasuryDB, get_db

router = APIRouter()

# Fallback policy constants (used only when DB policy row is missing)
_FALLBACK_PER_TX_LIMIT_USD  = Decimal("100")
_FALLBACK_LARGE_AMOUNT_USD  = Decimal("1000")
_FALLBACK_MEDIUM_WEIGHT_BPS = 5_000
_FALLBACK_LARGE_WEIGHT_BPS  = 7_000


def _get_db_service() -> TreasuryDB:
    return TreasuryDB(get_db())


def _load_policy(treasury_id: str, db: TreasuryDB) -> dict:
    """Read policy limits from the DB policies table.
    Falls back to constants if no row exists yet (e.g. before first deploy)."""
    try:
        r = db.db.table("policies").select("*").eq("treasury_id", treasury_id).single().execute()
        if r.data:
            return r.data
    except Exception:
        pass
    return {
        "per_transaction_limit_usd": float(_FALLBACK_PER_TX_LIMIT_USD),
        "large_payment_amount_usd": float(_FALLBACK_LARGE_AMOUNT_USD),
        "medium_threshold_bps": _FALLBACK_MEDIUM_WEIGHT_BPS,
        "large_threshold_bps": _FALLBACK_LARGE_WEIGHT_BPS,
    }


def _check_policy(amount: Decimal, policy: dict) -> tuple[ExecutionMode, int]:
    per_tx  = Decimal(str(policy.get("per_transaction_limit_usd", 100)))
    large   = Decimal(str(policy.get("large_payment_amount_usd", 1000)))
    medium_w = int(policy.get("medium_threshold_bps", 5000))
    large_w  = int(policy.get("large_threshold_bps", 7000))

    if amount <= per_tx:
        return ExecutionMode.AUTO_EXECUTE, 0
    if amount >= large:
        return ExecutionMode.MULTISIG_REQUIRED, large_w
    return ExecutionMode.MULTISIG_REQUIRED, medium_w


def _assess_risk(
    recipient: str,
    amount: Decimal,
    category: str,
    treasury_id: str,
    db: TreasuryDB,
) -> tuple[RiskLevel, list[str]]:
    """Full risk assessment — new recipient, duplicate, amount, budget."""
    from datetime import datetime, timedelta

    concerns: list[str] = []
    score = 0.0

    # 1. New recipient?
    txs = db.get_transactions(treasury_id, limit=500, direction="out")
    known = {t["to_address"].lower() for t in txs if t.get("to_address")}
    if recipient.lower() not in known:
        concerns.append("New recipient — no prior payment history")
        score += 0.3

    # 2. Duplicate in last 7 days?
    cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
    duplicates = [
        t for t in txs
        if t.get("to_address", "").lower() == recipient.lower()
        and t.get("timestamp", "") >= cutoff
        and Decimal(str(t.get("amount_usd") or 0)) == amount
    ]
    if duplicates:
        concerns.append("Possible duplicate — same amount paid to this recipient in last 7 days")
        score += 0.4

    # 3. Amount deviation vs vendor history
    vendor_txs = [t for t in txs if t.get("to_address", "").lower() == recipient.lower()]
    if vendor_txs:
        avg = sum(Decimal(str(t.get("amount_usd") or 0)) for t in vendor_txs) / len(vendor_txs)
        if avg > 0:
            deviation = float((amount - avg) / avg * 100)
            if deviation > 100:
                concerns.append(f"Amount is {deviation:.0f}% above this vendor's average")
                score += 0.2

    # 4. Large absolute amount
    if amount > Decimal("5000"):
        concerns.append(f"Large payment: ${amount:,.2f}")
        score += 0.15
    elif amount > Decimal("1000"):
        score += 0.05

    # 5. Budget overrun risk
    try:
        budgets = db.get_budgets(treasury_id, "current_month")
        for b in budgets:
            if b.get("category") == category:
                new_util = (b.get("spent_usd", 0) + float(amount)) / b["amount_usd"] * 100
                if new_util > 100:
                    concerns.append(f"{category} budget would be {new_util:.0f}% utilized (over budget)")
                    score += 0.2
                elif new_util > 90:
                    concerns.append(f"{category} budget would reach {new_util:.0f}%")
                    score += 0.1
    except Exception:
        pass

    if score >= 0.7:
        return RiskLevel.CRITICAL, concerns
    if score >= 0.4:
        return RiskLevel.HIGH, concerns
    if score >= 0.2:
        return RiskLevel.MEDIUM, concerns
    return RiskLevel.LOW, concerns


@router.post("/payment", response_model=CreateProposalResponse)
async def create_payment_proposal(
    request: CreatePaymentProposalRequest,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    # Validate treasury exists
    treasury = db.get_treasury(request.treasury_id)
    if not treasury:
        raise HTTPException(404, f"Treasury {request.treasury_id} not found")

    # Token allowed?
    token_upper = request.token.upper()
    if token_upper not in web3.tokens and token_upper not in ("CELO", "BOT"):
        raise HTTPException(400, f"Token {request.token} not allowed")

    # Load policy from DB (reflects onchain policy after governance changes it)
    policy = _load_policy(request.treasury_id, db)
    execution_mode, required_weight = _check_policy(request.amount, policy)

    # Full risk assessment
    risk_level, concerns = _assess_risk(
        request.recipient, request.amount, request.category, request.treasury_id, db
    )

    # Submit to blockchain via agent wallet
    try:
        result = web3.create_payment_proposal(
            token_symbol=token_upper,
            recipient=request.recipient,
            amount_human=request.amount,
            description=request.description,
        )
    except NotImplementedError:
        result = {"tx_hash": "0x" + "0" * 64, "proposal_id": 0}

    auto_executed = execution_mode == ExecutionMode.AUTO_EXECUTE

    # Persist proposal to DB (only if it requires multisig — AUTO_EXECUTE has no proposal)
    db_proposal_id = None
    if not auto_executed and result.get("proposal_id"):
        row = db.create_proposal({
            "treasury_id": request.treasury_id,          # ← FIXED: was request.recipient
            "proposal_id_onchain": result["proposal_id"],
            "type": "PAYMENT",
            "status": "PENDING",
            "title": request.description[:80],
            "description": request.description,
            "token": token_upper,
            "value": str(request.amount),
            "target": request.recipient,
            "required_weight": required_weight,
            "approved_weight": 0,
            "created_by": None,   # agent wallet; frontend sets this if desired
        })
        db_proposal_id = row["id"]

    # Log the agent action for audit trail
    db.log_agent_action(request.treasury_id, {
        "action_type": "CREATE_PAYMENT_PROPOSAL",
        "input": {
            "token": token_upper,
            "recipient": request.recipient,
            "amount": str(request.amount),
            "description": request.description,
            "category": request.category,
        },
        "decision": "AUTO_EXECUTE" if auto_executed else f"MULTISIG_REQUIRED (weight={required_weight})",
        "risk_score": {"LOW": 0.1, "MEDIUM": 0.35, "HIGH": 0.65, "CRITICAL": 0.9}.get(risk_level.value, 0.5),
        "policy_result": execution_mode.value,
        "proposal_id": db_proposal_id,
        "executed": auto_executed,
    })

    return CreateProposalResponse(
        proposal_id=db_proposal_id,
        onchain_id=result.get("proposal_id"),
        execution_mode=execution_mode,
        required_weight=required_weight,
        risk_level=risk_level,
        risk_concerns=concerns,
        auto_executed=auto_executed,
        tx_hash=result.get("tx_hash"),
    )


@router.get("/{proposal_id}", response_model=dict)
async def get_proposal(
    proposal_id: str,
    db: TreasuryDB = Depends(_get_db_service),
):
    p = db.get_proposal(proposal_id)
    if not p:
        raise HTTPException(404, "Proposal not found")
    return p


@router.post("/{proposal_id}/sign")
async def sign_proposal(
    proposal_id: str,
    request: SignProposalRequest,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    """Record a member's approval after they have called governance.approve() onchain.

    Flow:
      1. Frontend calls governance.approve(onchain_id) via the user's wallet
      2. Frontend (or indexer) then calls this endpoint to sync the weight to DB
         so the UI updates immediately without waiting for the indexer
    """
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] not in ("PENDING",):
        raise HTTPException(400, f"Proposal is {proposal['status']}, cannot sign")

    signer_lower = request.signer.lower()

    # Verify signer is an active member onchain
    try:
        member = web3.governance.functions.getMember(
            web3.w3.to_checksum_address(request.signer)
        ).call()
        if not member[2]:  # active bool
            raise HTTPException(403, "Signer is not an active member")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Could not verify member onchain: {e}")

    onchain_id = proposal.get("proposal_id_onchain")

    # Get snapshot weight for this proposal (what they were worth when proposal was created)
    weight = member[1]  # current weight as fallback
    if onchain_id:
        try:
            snapshot = web3.get_snapshot_weight(onchain_id, request.signer)
            if snapshot == 0:
                raise HTTPException(403, "Signer has zero weight in this proposal's snapshot")
            weight = snapshot
        except HTTPException:
            raise
        except Exception:
            pass  # RPC unavailable — use current weight as best-effort

        # Confirm they haven't already signed (onchain is authoritative)
        try:
            if web3.has_signed(onchain_id, request.signer):
                # Check DB too — might just be a re-sync call
                existing = [s for s in (proposal.get("proposal_signatures") or [])
                            if s.get("signer", "").lower() == signer_lower]
                if existing:
                    return {"status": proposal["status"], "already_signed": True,
                            "approved_weight": proposal["approved_weight"]}
        except Exception:
            pass

    # Check not already recorded in DB
    existing_sigs = proposal.get("proposal_signatures") or []
    if any(s.get("signer", "").lower() == signer_lower for s in existing_sigs):
        return {"status": proposal["status"], "already_signed": True,
                "approved_weight": proposal["approved_weight"]}

    # Record signature in DB
    db.add_signature(proposal_id, request.signer, weight, request.signature)

    # Re-fetch to get updated approved_weight
    updated = db.get_proposal(proposal_id)
    new_weight = updated["approved_weight"]
    required   = updated["required_weight"]

    threshold_reached = new_weight >= required
    if threshold_reached and updated["status"] == "PENDING":
        db.update_proposal_status(proposal_id, "APPROVED")

    return {
        "status": "APPROVED" if threshold_reached else "PENDING",
        "threshold_reached": threshold_reached,
        "approved_weight": new_weight,
        "required_weight": required,
    }


@router.post("/{proposal_id}/execute")
async def execute_proposal(
    proposal_id: str,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    """Execute an approved proposal onchain. Agent wallet submits the tx."""
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] == "EXECUTED":
        raise HTTPException(400, "Already executed")
    if proposal["approved_weight"] < proposal["required_weight"]:
        raise HTTPException(
            400,
            f"Threshold not met: {proposal['approved_weight']}/{proposal['required_weight']} bps"
        )

    onchain_id = proposal.get("proposal_id_onchain")
    if not onchain_id:
        raise HTTPException(400, "No onchain proposal ID recorded — cannot execute")

    try:
        tx_hash = web3.execute_proposal(onchain_id)
    except Exception as e:
        raise HTTPException(500, f"Execution failed: {e}")

    db.update_proposal_status(proposal_id, "EXECUTED")
    return {"tx_hash": tx_hash, "status": "EXECUTED"}


@router.post("/{proposal_id}/cancel")
async def cancel_proposal(
    proposal_id: str,
    db: TreasuryDB = Depends(_get_db_service),
):
    proposal = db.get_proposal(proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    if proposal["status"] not in ("PENDING",):
        raise HTTPException(400, f"Cannot cancel a {proposal['status']} proposal")
    db.update_proposal_status(proposal_id, "CANCELLED")
    return {"status": "CANCELLED"}
