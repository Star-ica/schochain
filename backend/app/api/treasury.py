"""Treasury API — balances, transactions, analytics, anomaly detection."""

from fastapi import APIRouter, Depends, HTTPException
from decimal import Decimal
from datetime import datetime, timedelta

from ..models.schemas import (
    TreasuryBalanceResponse, TokenBalance,
    MemberResponse, AnomalyResponse,
    RunwayForecastResponse, SpendingAnalyticsResponse,
    RiskLevel,
)
from ..services.web3_service import Web3Service, get_web3_service
from ..services.db_service import TreasuryDB, get_db

router = APIRouter()

TOKEN_USD_PRICE: dict[str, float] = {"USDC": 1.0, "USDT": 1.0}


def _get_db_service() -> TreasuryDB:
    return TreasuryDB(get_db())


def _get_treasury_or_404(treasury_id: str, db: TreasuryDB) -> dict:
    treasury = db.get_treasury(treasury_id)
    if not treasury:
        raise HTTPException(404, "Treasury not found")
    return treasury


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/{treasury_id}/balances", response_model=TreasuryBalanceResponse)
async def get_balances(
    treasury_id: str,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    treasury = _get_treasury_or_404(treasury_id, db)
    tw = web3.for_treasury(treasury)

    raw_balances = tw.get_all_balances()
    token_balances = []
    total_usd = Decimal("0")

    for b in raw_balances:
        decimals = b["decimals"]
        human_amount = Decimal(str(b["raw_balance"])) / Decimal(10 ** decimals)
        price = TOKEN_USD_PRICE.get(b["symbol"], 0.0)
        usd_value = human_amount * Decimal(str(price))
        total_usd += usd_value
        token_balances.append(TokenBalance(
            token=b["symbol"], symbol=b["symbol"], address=b["address"],
            balance=human_amount, balance_usd=usd_value, decimals=decimals,
        ))

    return TreasuryBalanceResponse(
        treasury_id=treasury_id,
        address=treasury["address"],
        chain_id=treasury["chain_id"],
        balances=token_balances,
        total_usd=total_usd,
        is_paused=tw.is_treasury_paused(),
    )


@router.get("/{treasury_id}/transactions")
async def get_transactions(
    treasury_id: str,
    limit: int = 20,
    direction: str = "all",
    db: TreasuryDB = Depends(_get_db_service),
):
    return {"transactions": db.get_transactions(treasury_id, limit, direction)}


@router.get("/{treasury_id}/members", response_model=list[MemberResponse])
async def get_members(
    treasury_id: str,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    treasury = _get_treasury_or_404(treasury_id, db)
    tw = web3.for_treasury(treasury)

    try:
        onchain = tw.get_all_members()
        db_members = {m["wallet_address"]: m for m in db.get_members(treasury_id)}
        result = []
        for m in onchain:
            db_m = db_members.get(m["address"].lower(), {})
            result.append(MemberResponse(
                address=m["address"],
                name=db_m.get("name", "Unknown"),
                role=db_m.get("role", "Member"),
                equity_weight=m["weight"],
                equity_percent=m["weight"] / 100,
                active=m["active"],
                created_at=datetime.utcfromtimestamp(m["created_at"]),
            ))
        return result
    except Exception:
        db_members = db.get_members(treasury_id)
        return [
            MemberResponse(
                address=m["wallet_address"],
                name=m.get("name", "Unknown"),
                role=m.get("role", "Member"),
                equity_weight=m["equity_weight"],
                equity_percent=m["equity_weight"] / 100,
                active=m.get("active", True),
                created_at=m["created_at"],
            )
            for m in db_members
        ]


@router.get("/{treasury_id}/proposals")
async def get_proposals(
    treasury_id: str,
    status: str = "PENDING",
    db: TreasuryDB = Depends(_get_db_service),
):
    return {"proposals": db.get_proposals(treasury_id, status)}


@router.get("/{treasury_id}/budgets")
async def get_budget_status(
    treasury_id: str,
    period: str = "current_month",
    db: TreasuryDB = Depends(_get_db_service),
):
    return {"budgets": db.get_budgets(treasury_id, period)}


@router.get("/{treasury_id}/analytics", response_model=SpendingAnalyticsResponse)
async def get_analytics(
    treasury_id: str,
    months_back: int = 3,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    treasury = _get_treasury_or_404(treasury_id, db)
    tw = web3.for_treasury(treasury)

    monthly = db.get_monthly_burn(treasury_id, months_back)
    categories = db.get_top_categories(treasury_id, months_back)
    vendors = db.get_top_vendors(treasury_id, months_back)

    avg_burn = Decimal(str(sum(m["amount_usd"] for m in monthly))) / len(monthly) \
        if monthly else Decimal("0")

    raw = tw.get_all_balances()
    total_usd = sum(
        Decimal(str(b["raw_balance"])) / Decimal(10 ** b["decimals"])
        * Decimal(str(TOKEN_USD_PRICE.get(b["symbol"], 0)))
        for b in raw
    )

    runway = float(total_usd / avg_burn) if avg_burn > 0 else float("inf")

    return SpendingAnalyticsResponse(
        monthly_burn_usd=avg_burn,
        monthly_burn_trend=monthly,
        top_categories=categories,
        top_vendors=vendors,
        runway_months=round(runway, 1),
        budget_utilization={c["category"]: c["pct"] for c in categories},
    )


@router.post("/{treasury_id}/forecast", response_model=RunwayForecastResponse)
async def forecast_runway(
    treasury_id: str,
    additional_monthly_burn: Decimal = Decimal("0"),
    one_time_payment: Decimal = Decimal("0"),
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    treasury = _get_treasury_or_404(treasury_id, db)
    tw = web3.for_treasury(treasury)

    monthly = db.get_monthly_burn(treasury_id, 3)
    avg_burn = Decimal(str(sum(m["amount_usd"] for m in monthly) / max(len(monthly), 1)))

    raw = tw.get_all_balances()
    total_usd = sum(
        Decimal(str(b["raw_balance"])) / Decimal(10 ** b["decimals"])
        * Decimal(str(TOKEN_USD_PRICE.get(b["symbol"], 0)))
        for b in raw
    )

    effective_treasury = total_usd - one_time_payment
    effective_burn = avg_burn + additional_monthly_burn
    runway_months = float(effective_treasury / effective_burn) if effective_burn > 0 else float("inf")
    runway_date = datetime.utcnow() + timedelta(days=runway_months * 30)

    scenario = None
    if additional_monthly_burn > 0 or one_time_payment > 0:
        base = float(total_usd / avg_burn) if avg_burn > 0 else float("inf")
        scenario = {
            "base_runway_months": round(base, 1),
            "scenario_runway_months": round(runway_months, 1),
            "impact_months": round(base - runway_months, 1),
        }

    return RunwayForecastResponse(
        treasury_usd=effective_treasury,
        monthly_burn_usd=effective_burn,
        runway_months=round(runway_months, 1),
        runway_date=runway_date,
        scenario=scenario,
    )


@router.post("/{treasury_id}/anomaly", response_model=AnomalyResponse)
async def detect_anomaly(
    treasury_id: str,
    recipient: str,
    amount: Decimal,
    token: str,
    category: str = "Other",
    db: TreasuryDB = Depends(_get_db_service),
):
    concerns = []
    risk_score = 0.0

    txs = db.get_transactions(treasury_id, limit=500, direction="out")
    known_recipients = {t["to_address"].lower() for t in txs if t.get("to_address")}
    is_new = recipient.lower() not in known_recipients
    if is_new:
        concerns.append("New recipient — no prior payment history")
        risk_score += 0.3

    cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
    recent = [
        t for t in txs
        if t.get("to_address", "").lower() == recipient.lower()
        and t.get("timestamp", "") >= cutoff
        and Decimal(str(t.get("amount_usd", 0))) == amount
    ]
    is_duplicate = len(recent) > 0
    if is_duplicate:
        concerns.append("Possible duplicate — same amount paid to this recipient in last 7 days")
        risk_score += 0.4

    vendor_txs = [t for t in txs if t.get("to_address", "").lower() == recipient.lower()]
    amount_deviation = None
    if vendor_txs:
        avg = sum(Decimal(str(t.get("amount_usd", 0))) for t in vendor_txs) / len(vendor_txs)
        if avg > 0:
            amount_deviation = float((amount - avg) / avg * 100)
            if amount_deviation > 100:
                concerns.append(f"Amount is {amount_deviation:.0f}% above this vendor's average")
                risk_score += 0.2

    if amount > Decimal("5000"):
        concerns.append(f"Large payment: ${amount:,.2f}")
        risk_score += 0.15
    elif amount > Decimal("1000"):
        risk_score += 0.05

    budgets = db.get_budgets(treasury_id, "current_month")
    budget_after = None
    for b in budgets:
        if b.get("category") == category:
            new_util = (b.get("spent_usd", 0) + float(amount)) / b["amount_usd"] * 100
            budget_after = new_util
            if new_util > 100:
                concerns.append(f"{category} budget would be {new_util:.0f}% utilized (over budget)")
                risk_score += 0.2
            elif new_util > 90:
                concerns.append(f"{category} budget would be {new_util:.0f}% utilized")
                risk_score += 0.1

    if risk_score >= 0.7:
        level = RiskLevel.CRITICAL
    elif risk_score >= 0.4:
        level = RiskLevel.HIGH
    elif risk_score >= 0.2:
        level = RiskLevel.MEDIUM
    else:
        level = RiskLevel.LOW

    return AnomalyResponse(
        risk_level=level, risk_score=min(risk_score, 1.0), concerns=concerns,
        is_new_recipient=is_new, is_duplicate=is_duplicate,
        amount_deviation_pct=amount_deviation, budget_utilization_after=budget_after,
    )


@router.get("/{treasury_id}/policy")
async def get_policy(
    treasury_id: str,
    web3: Web3Service = Depends(get_web3_service),
    db: TreasuryDB = Depends(_get_db_service),
):
    treasury = _get_treasury_or_404(treasury_id, db)
    return web3.for_treasury(treasury).get_policy()


@router.post("/{treasury_id}/escalate")
async def escalate(
    treasury_id: str,
    reason: str,
    risk_level: str,
    context: dict = None,
    db: TreasuryDB = Depends(_get_db_service),
):
    action = db.log_agent_action(treasury_id, {
        "action_type": "ESCALATION",
        "decision": f"ESCALATED: {reason}",
        "risk_score": {"LOW": 0.1, "MEDIUM": 0.4, "HIGH": 0.7, "CRITICAL": 0.9}.get(risk_level, 0.5),
        "input": context or {},
    })
    return {"escalation_id": action["id"], "status": "sent"}