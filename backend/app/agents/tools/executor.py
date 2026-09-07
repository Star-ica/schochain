"""
Tool executor for the CFOx CFO agent.

Calls backend services directly (in-process) — no HTTP round-trip needed
since the agent lives inside the same FastAPI app.
"""

import json
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timedelta

from ...services.web3_service import get_web3_service
from ...services.db_service import TreasuryDB, get_db


@dataclass
class ToolResult:
    tool_use_id: str
    content: str
    is_error: bool = False


class AgentToolExecutor:
    def __init__(self, backend_url: str, api_key: str, treasury_id: str):
        self.treasury_id = treasury_id
        # Use services directly — no HTTP
        self.web3 = get_web3_service()
        self.db = TreasuryDB(get_db())

    async def execute(self, tool_name: str, tool_use_id: str, inputs: dict) -> ToolResult:
        handlers = {
            "get_treasury_balance":    self._get_treasury_balance,
            "get_transactions":        self._get_transactions,
            "get_members":             self._get_members,
            "get_pending_proposals":   self._get_pending_proposals,
            "get_budget_status":       self._get_budget_status,
            "get_spending_analytics":  self._get_spending_analytics,
            "create_payment_proposal": self._create_payment_proposal,
            "forecast_runway":         self._forecast_runway,
            "detect_anomaly":          self._detect_anomaly,
            "get_policy":              self._get_policy,
            "request_human_approval":  self._request_human_approval,
        }
        handler = handlers.get(tool_name)
        if not handler:
            return ToolResult(tool_use_id, json.dumps({"error": f"Unknown tool: {tool_name}"}), True)
        try:
            result = await handler(inputs)
            return ToolResult(tool_use_id, json.dumps(result, default=str))
        except Exception as e:
            return ToolResult(tool_use_id, json.dumps({"error": str(e)}), True)

    async def _get_treasury_balance(self, inputs: dict) -> dict:
        raw = self.web3.get_all_balances()
        balances = []
        total_usd = Decimal("0")
        PRICES = {"USDC": 1.0, "USDT": 1.0}
        for b in raw:
            human = Decimal(str(b["raw_balance"])) / Decimal(10 ** b["decimals"])
            price = PRICES.get(b["symbol"], 0.0)
            usd = human * Decimal(str(price))
            total_usd += usd
            balances.append({"symbol": b["symbol"], "balance": float(human), "balance_usd": float(usd)})
        return {
            "balances": balances,
            "total_usd": float(total_usd),
            "is_paused": self.web3.is_treasury_paused(),
        }

    async def _get_transactions(self, inputs: dict) -> dict:
        txs = self.db.get_transactions(
            self.treasury_id,
            inputs.get("limit", 20),
            inputs.get("direction", "all"),
        )
        return {"transactions": txs}

    async def _get_members(self, inputs: dict) -> dict:
        members = self.web3.get_all_members()
        db_members = {m["wallet_address"]: m for m in self.db.get_members(self.treasury_id)}
        result = []
        for m in members:
            db_m = db_members.get(m["address"].lower(), {})
            result.append({
                "address": m["address"],
                "name": db_m.get("name", "Unknown"),
                "role": db_m.get("role", "Member"),
                "equity_weight": m["weight"],
                "equity_percent": m["weight"] / 100,
                "active": m["active"],
            })
        return {"members": result}

    async def _get_pending_proposals(self, inputs: dict) -> dict:
        proposals = self.db.get_proposals(self.treasury_id, inputs.get("status", "PENDING"))
        return {"proposals": proposals}

    async def _get_budget_status(self, inputs: dict) -> dict:
        budgets = self.db.get_budgets(self.treasury_id, inputs.get("period", "current_month"))
        return {"budgets": budgets}

    async def _get_spending_analytics(self, inputs: dict) -> dict:
        months_back = inputs.get("months_back", 3)
        monthly = self.db.get_monthly_burn(self.treasury_id, months_back)
        categories = self.db.get_top_categories(self.treasury_id, months_back)
        vendors = self.db.get_top_vendors(self.treasury_id, months_back)
        avg_burn = sum(m["amount_usd"] for m in monthly) / max(len(monthly), 1)
        return {
            "monthly_burn_usd": avg_burn,
            "monthly_burn_trend": monthly,
            "top_categories": categories,
            "top_vendors": vendors,
        }

    async def _create_payment_proposal(self, inputs: dict) -> dict:
        from decimal import Decimal as D
        amount = D(str(inputs["amount"]))
        result = self.web3.create_payment_proposal(
            token_symbol=inputs["token"].upper(),
            recipient=inputs["recipient_address"],
            amount_human=amount,
            description=inputs["description"],
        )
        self.db.log_agent_action(self.treasury_id, {
            "action_type": "CREATE_PAYMENT_PROPOSAL",
            "input": inputs,
            "decision": f"Proposal {result.get('proposal_id')} created",
            "proposal_id": str(result.get("proposal_id", "")),
            "executed": False,
        })
        return result

    async def _forecast_runway(self, inputs: dict) -> dict:
        monthly = self.db.get_monthly_burn(self.treasury_id, 3)
        avg_burn = Decimal(str(sum(m["amount_usd"] for m in monthly) / max(len(monthly), 1)))
        raw = self.web3.get_all_balances()
        PRICES = {"USDC": 1.0, "USDT": 1.0}
        total_usd = sum(
            Decimal(str(b["raw_balance"])) / Decimal(10 ** b["decimals"])
            * Decimal(str(PRICES.get(b["symbol"], 0)))
            for b in raw
        )
        extra_burn = Decimal(str(inputs.get("additional_monthly_burn", 0)))
        one_off = Decimal(str(inputs.get("one_time_payment", 0)))
        effective = total_usd - one_off
        burn = avg_burn + extra_burn
        runway = float(effective / burn) if burn > 0 else float("inf")
        runway_date = (datetime.utcnow() + timedelta(days=runway * 30)).isoformat()
        return {
            "treasury_usd": float(total_usd),
            "monthly_burn_usd": float(avg_burn),
            "runway_months": round(runway, 1),
            "runway_date": runway_date,
        }

    async def _detect_anomaly(self, inputs: dict) -> dict:
        recipient = inputs["recipient_address"]
        amount = Decimal(str(inputs["amount"]))
        concerns = []
        score = 0.0
        txs = self.db.get_transactions(self.treasury_id, 500, "out")
        known = {t["to_address"].lower() for t in txs if t.get("to_address")}
        is_new = recipient.lower() not in known
        if is_new:
            concerns.append("New recipient — no prior payment history")
            score += 0.3
        cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
        is_dup = any(
            t.get("to_address", "").lower() == recipient.lower()
            and t.get("timestamp", "") >= cutoff
            and Decimal(str(t.get("amount_usd", 0))) == amount
            for t in txs
        )
        if is_dup:
            concerns.append("Possible duplicate payment")
            score += 0.4
        if amount > Decimal("5000"):
            concerns.append(f"Large payment: ${amount:,.2f}")
            score += 0.15
        level = "CRITICAL" if score >= 0.7 else "HIGH" if score >= 0.4 else "MEDIUM" if score >= 0.2 else "LOW"
        return {"risk_level": level, "risk_score": min(score, 1.0), "concerns": concerns,
                "is_new_recipient": is_new, "is_duplicate": is_dup}

    async def _get_policy(self, inputs: dict) -> dict:
        return self.web3.get_policy()

    async def _request_human_approval(self, inputs: dict) -> dict:
        action = self.db.log_agent_action(self.treasury_id, {
            "action_type": "ESCALATION",
            "decision": f"ESCALATED: {inputs['reason']}",
            "risk_score": {"MEDIUM": 0.4, "HIGH": 0.7, "CRITICAL": 0.9}.get(inputs["risk_level"], 0.5),
            "input": inputs.get("context", {}),
        })
        return {"escalation_id": action.get("id"), "status": "sent", "risk_level": inputs["risk_level"]}
