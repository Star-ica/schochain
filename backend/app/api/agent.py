"""
Agent API — AI CFO chat interface.
Supports both standard and streaming (SSE) responses.

Quota gate: each treasury gets 5 free AI calls per 28-day period.
After that, the founder must pay the on-chain subscription to continue.
Subscribed treasuries are unlimited; the AI wallet is funded by the sub fee.
"""

import json
import os
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
from datetime import datetime, timedelta, timezone

from ..models.schemas import AgentChatRequest, AgentChatResponse
from ..agents.cfo_agent import CFOAgent
from ..services.db_service import TreasuryDB, get_db

log = logging.getLogger(__name__)
router = APIRouter()

FREE_CALLS_PER_PERIOD = 5
PERIOD_DAYS = 28


# ─── Quota helpers ────────────────────────────────────────────────────────────

def _get_or_create_sub(db: TreasuryDB, treasury_id: str) -> dict:
    row = db.get_subscription(treasury_id)
    if row is None:
        row = db.create_subscription(treasury_id)
    return row


def _check_and_consume_quota(treasury_id: str) -> None:
    """
    Raises HTTP 402 if the treasury has exhausted its free tier and has no
    active subscription. Otherwise increments the free call counter (if not
    subscribed) and returns normally.
    """
    db = TreasuryDB(get_db())
    sub = _get_or_create_sub(db, treasury_id)

    # Reset period if expired
    period_start = sub["period_start"]
    if isinstance(period_start, str):
        period_start = datetime.fromisoformat(period_start.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    if (now - period_start) >= timedelta(days=PERIOD_DAYS):
        sub = db.reset_subscription_period(treasury_id)

    if sub["is_subscribed"]:
        return  # unlimited for paid users

    if sub["free_calls_used"] >= FREE_CALLS_PER_PERIOD:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "free_tier_exhausted",
                "message": (
                    f"You have used all {FREE_CALLS_PER_PERIOD} free AI calls "
                    f"for this 28-day period. Pay the on-chain subscription to continue."
                ),
                "free_calls_used": sub["free_calls_used"],
                "free_calls_limit": FREE_CALLS_PER_PERIOD,
            },
        )

    db.increment_free_calls(treasury_id)


# ─── Agent factory ────────────────────────────────────────────────────────────

def _get_agent(treasury_id: str) -> CFOAgent:
    return CFOAgent(
        backend_url=os.getenv("BACKEND_URL", "http://localhost:8000"),
        backend_api_key=os.getenv("BACKEND_API_KEY", ""),
        treasury_id=treasury_id,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=AgentChatResponse)
async def chat(request: AgentChatRequest):
    """Non-streaming chat."""
    _check_and_consume_quota(request.treasury_id)
    agent = _get_agent(request.treasury_id)
    response = await agent.chat(request.message, request.history)
    return AgentChatResponse(
        message=response.text,
        proposals_created=response.proposals_created,
        risk_flags=response.risk_flags,
        tool_calls_made=len(response.tool_calls),
    )


@router.post("/chat/stream")
async def chat_stream(request: AgentChatRequest):
    """Streaming SSE chat."""
    _check_and_consume_quota(request.treasury_id)
    agent = _get_agent(request.treasury_id)

    async def event_stream() -> AsyncGenerator[str, None]:
        async for chunk in agent.stream_chat(request.message, request.history):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )