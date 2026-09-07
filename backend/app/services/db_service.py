"""
Database service — Supabase/PostgreSQL queries.

Replaces all the 501 stubs in the API routes with real queries.
The indexer worker writes to these tables; the API reads from them.
"""

import os
from datetime import datetime, timedelta
from decimal import Decimal
from supabase import create_client, Client


def get_db() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    assert url and key, "SUPABASE_URL and SUPABASE_KEY must be set"
    return create_client(url, key)


class TreasuryDB:
    def __init__(self, db: Client):
        self.db = db

    # ─── Treasuries ───────────────────────────────────────────────────────────

    def get_treasury(self, treasury_id: str) -> dict | None:
        r = self.db.table("treasuries").select("*").eq("id", treasury_id).single().execute()
        return r.data

    def create_treasury(self, org_id: str, address: str, chain_id: int, name: str) -> dict:
        r = self.db.table("treasuries").insert({
            "organization_id": org_id,
            "address": address.lower(),
            "chain_id": chain_id,
            "name": name,
        }).execute()
        return r.data[0]

    # ─── Members ─────────────────────────────────────────────────────────────

    def get_members(self, treasury_id: str) -> list[dict]:
        r = (self.db.table("members")
             .select("*")
             .eq("treasury_id", treasury_id)
             .order("equity_weight", desc=True)
             .execute())
        return r.data

    def upsert_member(self, treasury_id: str, address: str, data: dict) -> dict:
        r = (self.db.table("members")
             .upsert({
                 "treasury_id": treasury_id,
                 "wallet_address": address.lower(),
                 **data,
                 "updated_at": datetime.utcnow().isoformat(),
             }, on_conflict="treasury_id,wallet_address")
             .execute())
        return r.data[0]

    # ─── Transactions ─────────────────────────────────────────────────────────

    def get_transactions(
        self,
        treasury_id: str,
        limit: int = 20,
        direction: str = "all",
    ) -> list[dict]:
        q = (self.db.table("transactions")
             .select("*")
             .eq("treasury_id", treasury_id)
             .order("timestamp", desc=True)
             .limit(limit))
        if direction in ("in", "out"):
            q = q.eq("direction", direction)
        return q.execute().data

    def insert_transaction(self, treasury_id: str, tx: dict) -> dict:
        r = (self.db.table("transactions")
             .upsert({
                 "treasury_id": treasury_id,
                 **tx,
             }, on_conflict="tx_hash")
             .execute())
        return r.data[0]

    # ─── Proposals ────────────────────────────────────────────────────────────

    def get_proposals(self, treasury_id: str, status: str = "PENDING") -> list[dict]:
        q = (self.db.table("proposals")
             .select("*, proposal_signatures(*)")
             .eq("treasury_id", treasury_id)
             .order("created_at", desc=True))
        if status != "all":
            q = q.eq("status", status)
        return q.execute().data

    def get_proposal(self, proposal_id: str) -> dict | None:
        r = (self.db.table("proposals")
             .select("*, proposal_signatures(*)")
             .eq("id", proposal_id)
             .single()
             .execute())
        return r.data

    def create_proposal(self, data: dict) -> dict:
        # If an onchain id is provided, upsert to handle the race between
        # the API creating the row and the indexer picking up ProposalCreated
        onchain_id = data.get("proposal_id_onchain")
        treasury_id = data.get("treasury_id")
        if onchain_id and treasury_id:
            # Check if indexer already wrote this row
            existing = (self.db.table("proposals")
                        .select("*")
                        .eq("treasury_id", treasury_id)
                        .eq("proposal_id_onchain", onchain_id)
                        .execute())
            if existing.data:
                # Update with richer metadata from the API call (title, description, etc.)
                row_id = existing.data[0]["id"]
                update_data = {k: v for k, v in data.items()
                               if k not in ("treasury_id", "proposal_id_onchain") and v is not None}
                r = (self.db.table("proposals")
                     .update(update_data)
                     .eq("id", row_id)
                     .execute())
                return r.data[0] if r.data else existing.data[0]
        r = self.db.table("proposals").insert(data).execute()
        return r.data[0]

    def update_proposal_status(self, proposal_id: str, status: str, **extra) -> dict:
        r = (self.db.table("proposals")
             .update({"status": status, **extra})
             .eq("id", proposal_id)
             .execute())
        return r.data[0]

    def add_signature(self, proposal_id: str, signer: str, weight: int, signature: str) -> dict:
        # Upsert on (proposal_id, signer) unique constraint — idempotent if indexer
        # and /sign endpoint both record the same approval
        r = self.db.table("proposal_signatures").upsert({
            "proposal_id": proposal_id,
            "signer": signer.lower(),
            "weight": weight,
            "signature": signature,
            "signed_at": datetime.utcnow().isoformat(),
        }, on_conflict="proposal_id,signer").execute()

        # Recompute approved_weight from scratch to avoid double-counting races
        sigs_r = (self.db.table("proposal_signatures")
                  .select("weight")
                  .eq("proposal_id", proposal_id)
                  .execute())
        new_weight = sum(s["weight"] for s in sigs_r.data)
        self.db.table("proposals").update({
            "approved_weight": new_weight,
        }).eq("id", proposal_id).execute()
        return r.data[0] if r.data else {}

    # ─── Budgets ─────────────────────────────────────────────────────────────

    def get_budgets(self, treasury_id: str, period: str = "current_month") -> list[dict]:
        r = (self.db.table("budgets")
             .select("*")
             .eq("treasury_id", treasury_id)
             .eq("period", period)
             .execute())
        budgets = r.data

        # Enrich with spent amounts from transactions
        now = datetime.utcnow()
        if period == "current_month":
            since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "current_quarter":
            q_month = ((now.month - 1) // 3) * 3 + 1
            since = now.replace(month=q_month, day=1, hour=0, minute=0, second=0)
        else:
            since = now.replace(month=1, day=1, hour=0, minute=0, second=0)

        for budget in budgets:
            spent_r = (self.db.table("transactions")
                       .select("amount_usd")
                       .eq("treasury_id", treasury_id)
                       .eq("category", budget["category"])
                       .eq("direction", "out")
                       .gte("timestamp", since.isoformat())
                       .execute())
            spent = sum(Decimal(str(t["amount_usd"])) for t in spent_r.data if t["amount_usd"])
            budget["spent_usd"] = float(spent)
            budget["remaining_usd"] = budget["amount_usd"] - float(spent)
            budget["utilization_pct"] = (float(spent) / budget["amount_usd"] * 100) if budget["amount_usd"] else 0

        return budgets

    # ─── Analytics ────────────────────────────────────────────────────────────

    def get_monthly_burn(self, treasury_id: str, months_back: int = 3) -> list[dict]:
        """Returns [{month: 'YYYY-MM', amount_usd: float}] for last N months."""
        since = (datetime.utcnow() - timedelta(days=months_back * 30)).isoformat()
        r = (self.db.table("transactions")
             .select("amount_usd, timestamp")
             .eq("treasury_id", treasury_id)
             .eq("direction", "out")
             .gte("timestamp", since)
             .execute())

        by_month: dict[str, Decimal] = {}
        for tx in r.data:
            if not tx.get("timestamp") or not tx.get("amount_usd"):
                continue
            month = tx["timestamp"][:7]  # YYYY-MM
            by_month[month] = by_month.get(month, Decimal("0")) + Decimal(str(tx["amount_usd"]))

        return [{"month": m, "amount_usd": float(v)} for m, v in sorted(by_month.items())]

    def get_top_categories(self, treasury_id: str, months_back: int = 3) -> list[dict]:
        since = (datetime.utcnow() - timedelta(days=months_back * 30)).isoformat()
        r = (self.db.table("transactions")
             .select("category, amount_usd")
             .eq("treasury_id", treasury_id)
             .eq("direction", "out")
             .gte("timestamp", since)
             .execute())

        by_cat: dict[str, Decimal] = {}
        total = Decimal("0")
        for tx in r.data:
            cat = tx.get("category") or "Other"
            amt = Decimal(str(tx.get("amount_usd") or 0))
            by_cat[cat] = by_cat.get(cat, Decimal("0")) + amt
            total += amt

        return sorted(
            [{"category": c, "amount_usd": float(v), "pct": float(v / total * 100) if total else 0}
             for c, v in by_cat.items()],
            key=lambda x: x["amount_usd"], reverse=True
        )

    def get_top_vendors(self, treasury_id: str, months_back: int = 3) -> list[dict]:
        since = (datetime.utcnow() - timedelta(days=months_back * 30)).isoformat()
        r = (self.db.table("transactions")
             .select("to_address, amount_usd")
             .eq("treasury_id", treasury_id)
             .eq("direction", "out")
             .gte("timestamp", since)
             .execute())

        by_vendor: dict[str, Decimal] = {}
        total = Decimal("0")
        for tx in r.data:
            addr = tx.get("to_address") or "unknown"
            amt = Decimal(str(tx.get("amount_usd") or 0))
            by_vendor[addr] = by_vendor.get(addr, Decimal("0")) + amt
            total += amt

        return sorted(
            [{"address": a, "amount_usd": float(v), "pct": float(v / total * 100) if total else 0}
             for a, v in by_vendor.items()],
            key=lambda x: x["amount_usd"], reverse=True
        )[:10]

    # ─── Agent audit log ──────────────────────────────────────────────────────

    def log_agent_action(self, treasury_id: str, action: dict) -> dict:
        r = self.db.table("agent_actions").insert({
            "treasury_id": treasury_id,
            **action,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
        return r.data[0]

    def get_or_create_org(self, founder_address: str, name: str) -> dict:
        r = (self.db.table("organizations")
             .select("*")
             .eq("created_by", founder_address.lower())
             .limit(1)
             .execute())
        if r.data:
            return r.data[0]
        slug = name.lower().replace(" ", "-")[:40]
        r2 = self.db.table("organizations").insert({
            "name": name,
            "slug": slug,
            "created_by": founder_address.lower(),
        }).execute()
        return r2.data[0]
# ── Paste these methods inside the TreasuryDB class in db_service.py ──────────
# Add after the upsert_policy method at the bottom of the class.

    # ─── Subscriptions ────────────────────────────────────────────────────────

    def get_subscription(self, treasury_id: str) -> dict | None:
        try:
            r = (self.db.table("subscriptions")
                 .select("*")
                 .eq("treasury_id", treasury_id)
                 .single()
                 .execute())
            return r.data
        except Exception:
            return None

    def create_subscription(self, treasury_id: str) -> dict:
        from datetime import datetime, timezone
        r = self.db.table("subscriptions").insert({
            "treasury_id": treasury_id,
            "free_calls_used": 0,
            "period_start": datetime.now(timezone.utc).isoformat(),
            "is_subscribed": False,
        }).execute()
        return r.data[0]

    def reset_subscription_period(self, treasury_id: str) -> dict:
        from datetime import datetime, timezone
        r = (self.db.table("subscriptions")
             .update({
                 "free_calls_used": 0,
                 "period_start": datetime.now(timezone.utc).isoformat(),
                 "is_subscribed": False,   # subscription must be renewed each period
                 "updated_at": datetime.now(timezone.utc).isoformat(),
             })
             .eq("treasury_id", treasury_id)
             .execute())
        return r.data[0]

    def increment_free_calls(self, treasury_id: str) -> dict:
        from datetime import datetime, timezone
        # Read current count then write (Supabase JS SDK doesn't support atomic increment
        # via the Python client directly — use RPC or a simple read+write here)
        sub = self.get_subscription(treasury_id)
        new_count = (sub["free_calls_used"] if sub else 0) + 1
        r = (self.db.table("subscriptions")
             .update({
                 "free_calls_used": new_count,
                 "updated_at": datetime.now(timezone.utc).isoformat(),
             })
             .eq("treasury_id", treasury_id)
             .execute())
        return r.data[0]

    def activate_subscription(
        self, treasury_id: str, tx_hash: str, paid_at
    ) -> dict:
        from datetime import datetime, timezone
        r = (self.db.table("subscriptions")
             .update({
                 "is_subscribed": True,
                 "subscribed_at": paid_at.isoformat() if hasattr(paid_at, "isoformat") else str(paid_at),
                 "last_payment_tx": tx_hash,
                 "last_payment_at": paid_at.isoformat() if hasattr(paid_at, "isoformat") else str(paid_at),
                 "period_start": paid_at.isoformat() if hasattr(paid_at, "isoformat") else str(paid_at),
                 "free_calls_used": 0,
                 "updated_at": datetime.now(timezone.utc).isoformat(),
             })
             .eq("treasury_id", treasury_id)
             .execute())
        return r.data[0]
    def create_treasury(
        self, org_id: str, address: str, chain_id: int, name: str,
        governance_address: str = None, policy_address: str = None,
        factory_address: str = None,
    ) -> dict:
        payload = {
            "organization_id": org_id,
            "address": address.lower(),
            "chain_id": chain_id,
            "name": name,
        }
        if governance_address:
            payload["governance_address"] = governance_address.lower()
        if policy_address:
            payload["policy_address"] = policy_address.lower()
        if factory_address:
            payload["factory_address"] = factory_address.lower()
        r = self.db.table("treasuries").insert(payload).execute()
        return r.data[0]

    def get_treasury_by_address(self, address: str) -> dict | None:
        r = (self.db.table("treasuries")
             .select("*")
             .eq("address", address.lower())
             .limit(1)
             .execute())
        return r.data[0] if r.data else None

    def upsert_policy(self, treasury_id: str, data: dict) -> dict:
        r = self.db.table("policies").upsert({
            "treasury_id": treasury_id,
            **data,
        }, on_conflict="treasury_id").execute()
        return r.data[0]
