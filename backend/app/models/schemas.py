"""Pydantic models for CFOx CFO API."""

from pydantic import BaseModel, field_validator
from typing import Optional
from decimal import Decimal
from datetime import datetime
from enum import Enum


class ProposalType(str, Enum):
    PAYMENT = "PAYMENT"
    BATCH_PAYMENT = "BATCH_PAYMENT"
    ADD_MEMBER = "ADD_MEMBER"
    REMOVE_MEMBER = "REMOVE_MEMBER"
    TRANSFER_EQUITY = "TRANSFER_EQUITY"
    CHANGE_THRESHOLD = "CHANGE_THRESHOLD"
    CHANGE_POLICY = "CHANGE_POLICY"
    EMERGENCY_ACTION = "EMERGENCY_ACTION"


class ProposalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ExecutionMode(str, Enum):
    AUTO_EXECUTE = "AUTO_EXECUTE"
    MULTISIG_REQUIRED = "MULTISIG_REQUIRED"
    BLOCKED = "BLOCKED"


# ─── Requests ─────────────────────────────────────────────────────────────────

class CreatePaymentProposalRequest(BaseModel):
    treasury_id: str              # DB UUID of the treasury
    token: str                    # "USDC", "CELO", etc.
    recipient: str                # 0x address
    amount: Decimal               # human-readable (e.g. 500.00 for $500)
    description: str
    category: str = "Other"

    @field_validator("recipient")
    @classmethod
    def validate_address(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("0x") or len(v) != 42:
            raise ValueError(f"Invalid Ethereum address: {v}")
        return v.lower()

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be positive")
        if v > Decimal("10_000_000"):
            raise ValueError("Amount exceeds maximum (sanity check)")
        return v


class SignProposalRequest(BaseModel):
    signature: str       # EIP-712 signature hex
    signer: str          # 0x address of signer


class AddMemberRequest(BaseModel):
    wallet_address: str
    name: str
    role: str
    equity_weight: int   # basis points (0–10000)

    @field_validator("equity_weight")
    @classmethod
    def validate_weight(cls, v: int) -> int:
        if v <= 0 or v >= 10_000:
            raise ValueError("Equity weight must be between 1 and 9999 basis points")
        return v


class TransferEquityRequest(BaseModel):
    from_address: str
    to_address: str
    weight: int          # basis points


class AgentChatRequest(BaseModel):
    message: str
    treasury_id: str
    history: list[dict] = []


# ─── Responses ────────────────────────────────────────────────────────────────

class TokenBalance(BaseModel):
    token: str
    symbol: str
    address: str
    balance: Decimal
    balance_usd: Decimal
    decimals: int


class TreasuryBalanceResponse(BaseModel):
    treasury_id: str
    address: str
    chain_id: int
    balances: list[TokenBalance]
    total_usd: Decimal
    is_paused: bool


class MemberResponse(BaseModel):
    address: str
    name: str
    role: str
    equity_weight: int       # basis points
    equity_percent: float    # human-readable percentage
    active: bool
    created_at: datetime


class ProposalSignature(BaseModel):
    signer: str
    weight: int
    signed_at: datetime


class ProposalResponse(BaseModel):
    id: str
    onchain_id: int
    type: ProposalType
    status: ProposalStatus
    title: str
    description: str
    token: Optional[str]
    amount: Optional[Decimal]
    recipient: Optional[str]
    required_weight: int
    approved_weight: int
    approval_percent: float
    operation_hash: str
    risk_level: RiskLevel
    execution_mode: ExecutionMode
    signatures: list[ProposalSignature]
    proposer: str
    created_at: datetime
    expires_at: datetime
    executed_at: Optional[datetime]


class CreateProposalResponse(BaseModel):
    proposal_id: Optional[str]   # None if auto-executed
    onchain_id: Optional[int]
    execution_mode: ExecutionMode
    required_weight: int
    risk_level: RiskLevel
    risk_concerns: list[str]
    auto_executed: bool
    tx_hash: Optional[str]       # if auto-executed


class AnomalyResponse(BaseModel):
    risk_level: RiskLevel
    risk_score: float            # 0.0–1.0
    concerns: list[str]
    is_new_recipient: bool
    is_duplicate: bool
    amount_deviation_pct: Optional[float]
    budget_utilization_after: Optional[float]


class RunwayForecastResponse(BaseModel):
    treasury_usd: Decimal
    monthly_burn_usd: Decimal
    runway_months: float
    runway_date: datetime
    scenario: Optional[dict]     # if additional_monthly_burn or one_time_payment provided


class SpendingAnalyticsResponse(BaseModel):
    monthly_burn_usd: Decimal
    monthly_burn_trend: list[dict]    # [{month, amount}]
    top_categories: list[dict]        # [{category, amount, pct}]
    top_vendors: list[dict]           # [{address, name, amount, pct}]
    runway_months: float
    budget_utilization: dict          # {category: pct}


class AgentChatResponse(BaseModel):
    message: str
    proposals_created: list[dict]
    risk_flags: list[str]
    tool_calls_made: int
