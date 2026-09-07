"""
Subscription API — AI usage quota and subscription management.

Free tier : 5 AI chat calls per 28-day period (reset automatically).
Paid tier : $5 / 28 days, paid on-chain via factory.paySubscription().
            Backend verifies the on-chain tx and activates the period.

Only two endpoints the rest of the app needs:
  GET  /api/subscription/{treasury_id}/status   → current quota / sub state
  POST /api/subscription/{treasury_id}/activate → verify on-chain tx, activate
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.db_service import TreasuryDB, get_db
from ..services.web3_service import get_web3_service

log = logging.getLogger(__name__)
router = APIRouter()

FREE_CALLS_PER_PERIOD = 5
PERIOD_DAYS = 28


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_sub(db: TreasuryDB, treasury_id: str) -> dict:
    """Return the subscription row, creating it if missing."""
    row = db.get_subscription(treasury_id)
    if row is None:
        row = db.create_subscription(treasury_id)
    return row


def _maybe_reset_period(db: TreasuryDB, treasury_id: str, sub: dict) -> dict:
    """If 28 days have passed since period_start, reset free call counter."""
    period_start = sub["period_start"]
    if isinstance(period_start, str):
        period_start = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    if (now - period_start) >= timedelta(days=PERIOD_DAYS):
        sub = db.reset_subscription_period(treasury_id)
    return sub


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SubscriptionStatus(BaseModel):
    treasury_id: str
    is_subscribed: bool
    free_calls_used: int
    free_calls_remaining: int
    period_start: str
    period_end: str
    # True when the caller may use the AI this request
    ai_allowed: bool


class ActivateRequest(BaseModel):
    tx_hash: str          # hash of the paySubscription() call
    founder_address: str  # must match factory instance


class ActivateResponse(BaseModel):
    success: bool
    period_start: str
    period_end: str
    message: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/{treasury_id}/status", response_model=SubscriptionStatus)
async def get_status(treasury_id: str):
    db = TreasuryDB(get_db())
    treasury = db.get_treasury(treasury_id)
    if not treasury:
        raise HTTPException(404, "Treasury not found")

    sub = _get_or_create_sub(db, treasury_id)
    sub = _maybe_reset_period(db, treasury_id, sub)

    period_start = sub["period_start"]
    if isinstance(period_start, str):
        period_start = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
    period_end = period_start + timedelta(days=PERIOD_DAYS)

    free_remaining = max(0, FREE_CALLS_PER_PERIOD - sub["free_calls_used"])
    ai_allowed = sub["is_subscribed"] or free_remaining > 0

    return SubscriptionStatus(
        treasury_id=treasury_id,
        is_subscribed=sub["is_subscribed"],
        free_calls_used=sub["free_calls_used"],
        free_calls_remaining=free_remaining,
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        ai_allowed=ai_allowed,
    )


@router.post("/{treasury_id}/activate", response_model=ActivateResponse)
async def activate_subscription(treasury_id: str, body: ActivateRequest):
    """
    Verify an on-chain paySubscription() tx and activate the subscription.
    The tx must:
      - be from body.founder_address
      - emit SubscriptionPaid with the correct treasury address
    """
    db = TreasuryDB(get_db())
    treasury = db.get_treasury(treasury_id)
    if not treasury:
        raise HTTPException(404, "Treasury not found")

    # Verify on-chain
    web3 = get_web3_service()
    try:
        verified = web3.verify_subscription_tx(
            tx_hash=body.tx_hash,
            founder_address=body.founder_address,
            treasury_address=treasury["address"],
        )
    except Exception as exc:
        log.warning("Subscription tx verification failed: %s", exc)
        raise HTTPException(400, f"Could not verify tx: {exc}")

    if not verified:
        raise HTTPException(400, "Transaction does not match expected subscription payment")

    now = datetime.now(timezone.utc)
    sub = db.activate_subscription(
        treasury_id=treasury_id,
        tx_hash=body.tx_hash,
        paid_at=now,
    )

    period_start = sub["period_start"]
    if isinstance(period_start, str):
        period_start = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
    period_end = period_start + timedelta(days=PERIOD_DAYS)

    return ActivateResponse(
        success=True,
        period_start=period_start.isoformat(),
        period_end=period_end.isoformat(),
        message="Subscription activated for 28 days.",
    )


@router.post("/{treasury_id}/consume_free_call")
async def consume_free_call(treasury_id: str):
    """
    Called internally by the agent endpoint after confirming a free call is
    available. Increments the usage counter.
    Not exposed in docs — internal use only.
    """
    db = TreasuryDB(get_db())
    sub = _get_or_create_sub(db, treasury_id)
    sub = _maybe_reset_period(db, treasury_id, sub)

    if sub["is_subscribed"]:
        return {"consumed": False, "reason": "subscribed"}

    if sub["free_calls_used"] >= FREE_CALLS_PER_PERIOD:
        raise HTTPException(402, "Free tier exhausted. Please subscribe to continue.")

    db.increment_free_calls(treasury_id)
    return {"consumed": True, "calls_used": sub["free_calls_used"] + 1}