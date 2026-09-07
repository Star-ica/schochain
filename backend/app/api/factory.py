"""
Factory API — registers a CFOx suite that was deployed on-chain by the
founder's wallet, and looks up existing instances.

Deployment flow
───────────────
1. Frontend (useFactory.ts) calls factory.deploy() directly from the
   founder's wallet via wagmi.  msg.sender = founder → correct equity mint.
2. Frontend parses the CFOxDeployed event from the receipt.
3. Frontend POSTs /api/factory/register with the tx hash + addresses.
4. This backend records the treasury in the DB and returns the treasury_id.

The old /deploy endpoint (agent wallet calling the factory) is gone.
It was broken because msg.sender would be the agent, not the founder.
"""

import os
import logging
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator

from ..services.web3_service import get_web3_service, Web3Service
from ..services.db_service import get_db, TreasuryDB

log = logging.getLogger(__name__)
router = APIRouter()

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_address(v: str, field: str = "address") -> str:
    v = v.strip()
    if not v.startswith("0x") or len(v) != 42:
        raise ValueError(f"Invalid {field}: {v!r}")
    return v.lower()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """
    Posted by the frontend after factory.deploy() confirms on-chain.
    All addresses come from the CFOxDeployed event parsed by the frontend.
    """
    tx_hash: str
    founder_address: str
    founder_name: str
    org_name: str
    governance_address: str
    treasury_address: str
    policy_address: str
    per_tx_limit: Decimal = Decimal("100")    # USD — stored in DB policy row
    daily_limit: Decimal = Decimal("500")
    weekly_limit: Decimal = Decimal("2000")

    @field_validator("founder_address", "governance_address",
                     "treasury_address", "policy_address", mode="before")
    @classmethod
    def validate_addresses(cls, v: str) -> str:
        return _validate_address(v)


class RegisterResponse(BaseModel):
    treasury_id: str        # DB UUID — set as NEXT_PUBLIC_TREASURY_ID


class InstanceResponse(BaseModel):
    has_instance: bool
    governance_address: str | None = None
    treasury_address: str | None = None
    policy_address: str | None = None
    treasury_id: str | None = None  # None if deployed on-chain but not yet registered


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse)
async def register_instance(body: RegisterRequest):
    """
    Record a freshly deployed CFOx instance in the database.

    Called by the frontend immediately after the on-chain deploy tx confirms.
    Does NOT submit any blockchain transaction — that already happened in the
    user's wallet.  This endpoint only writes to Postgres.
    """
    db = TreasuryDB(get_db())

    # Idempotency: if the treasury address is already registered return its id.
    existing = db.get_treasury_by_address(body.treasury_address)
    if existing:
        log.info("register_instance: treasury %s already registered, returning existing id",
                 body.treasury_address)
        return RegisterResponse(treasury_id=existing["id"])

    factory_address = os.getenv("FACTORY_CONTRACT", "")
    chain_id = int(os.getenv("CHAIN_ID", "677"))

    # Upsert org (creates if new, returns existing row otherwise)
    org = db.get_or_create_org(body.founder_address, body.org_name)

    treasury_row = db.create_treasury(
        org_id=org["id"],
        address=body.treasury_address,
        chain_id=chain_id,
        name=f"{body.org_name} Treasury",
        governance_address=body.governance_address,
        policy_address=body.policy_address,
        factory_address=factory_address,
    )

    # Seed founder as first member with 100 % equity weight
    db.upsert_member(treasury_row["id"], body.founder_address, {
        "name": body.founder_name,
        "role": "Founder",
        "equity_weight": 10000,
        "active": True,
    })

    # Seed policy limits (mirrors what was set on-chain)
    db.upsert_policy(treasury_row["id"], {
        "per_transaction_limit_usd": float(body.per_tx_limit),
        "daily_limit_usd": float(body.daily_limit),
        "weekly_limit_usd": float(body.weekly_limit),
    })

    log.info("register_instance: registered treasury %s (id=%s) for founder %s",
             body.treasury_address, treasury_row["id"], body.founder_address)

    return RegisterResponse(treasury_id=treasury_row["id"])


@router.get("/instance/{founder_address}", response_model=InstanceResponse)
async def get_instance(
    founder_address: str,
    web3: Web3Service = Depends(get_web3_service),
):
    """
    Check whether a founder already has a deployed CFOx instance.

    Queries the on-chain factory mapping first, then enriches with the DB
    treasury_id so the frontend can restore its session.
    """
    try:
        founder_address = _validate_address(founder_address, "founder_address")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        data = web3.get_instance(founder_address)
    except Exception as exc:
        log.warning("get_instance chain call failed for %s: %s", founder_address, exc)
        raise HTTPException(status_code=400, detail=str(exc))

    if not data or data.get("governance", ZERO_ADDRESS) == ZERO_ADDRESS:
        return InstanceResponse(has_instance=False)

    # Enrich with DB treasury_id (may be None if registered before this backend)
    db = TreasuryDB(get_db())
    treasury_row = db.get_treasury_by_address(data["treasury"])

    return InstanceResponse(
        has_instance=True,
        governance_address=data["governance"],
        treasury_address=data["treasury"],
        policy_address=data["policy"],
        treasury_id=treasury_row["id"] if treasury_row else None,
    )