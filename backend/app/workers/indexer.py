"""
Blockchain Indexer Worker

Listens for CFOx contract events and syncs them to PostgreSQL.
Run as a background task alongside the FastAPI app, or as a separate process.

Events indexed:
  CFOxGovernance: MemberAdded, MemberRemoved, EquityTransferred,
                      ProposalCreated, ProposalApproved, ProposalExecuted
  CFOxTreasury:   TreasuryPayment, Deposited, Paused, Unpaused
"""

import os
import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from ..services.db_service import TreasuryDB, get_db

log = logging.getLogger("indexer")

# Poll interval when no new blocks
POLL_INTERVAL = int(os.getenv("INDEXER_POLL_SECONDS", "3"))
# How many blocks to process per batch
BATCH_SIZE = int(os.getenv("INDEXER_BATCH_SIZE", "100"))


# ─── Event signatures ─────────────────────────────────────────────────────────

EVENTS = {
    "MemberAdded":       Web3.keccak(text="MemberAdded(address,uint256,string)").hex(),
    "MemberRemoved":     Web3.keccak(text="MemberRemoved(address)").hex(),
    "EquityTransferred": Web3.keccak(text="EquityTransferred(address,address,uint256)").hex(),
    "ProposalCreated":   Web3.keccak(text="ProposalCreated(uint256,uint8,bytes32,uint256)").hex(),
    "ProposalApproved":  Web3.keccak(text="ProposalApproved(uint256,address,uint256,uint256)").hex(),
    "ProposalExecuted":  Web3.keccak(text="ProposalExecuted(uint256)").hex(),
    "TreasuryPayment":   Web3.keccak(text="TreasuryPayment(address,address,uint256)").hex(),
    "Deposited":         Web3.keccak(text="Deposited(address,uint256)").hex(),
    "Paused":            Web3.keccak(text="Paused(address,string)").hex(),
    "Unpaused":          Web3.keccak(text="Unpaused(address)").hex(),
}

# Reverse map for fast lookup
SIG_TO_NAME = {v: k for k, v in EVENTS.items()}


class BlockchainIndexer:
    def __init__(self, treasury_id: str):
        rpc_url = os.getenv("RPC_URL", "https://forno.celo.org")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        self.treasury_id = treasury_id
        self.governance_address = os.getenv("GOVERNANCE_CONTRACT", "").lower()
        self.treasury_address   = os.getenv("TREASURY_CONTRACT", "").lower()

        self.db = TreasuryDB(get_db())

        # Resume from last indexed block (stored in DB)
        self.from_block = self._get_last_indexed_block()

    def _get_last_indexed_block(self) -> int:
        """Resume from where we left off, or start from deployment block."""
        default = int(os.getenv("DEPLOYMENT_BLOCK", "0"))
        try:
            r = (self.db.db.table("indexer_state")
                 .select("last_block")
                 .eq("treasury_id", self.treasury_id)
                 .single()
                 .execute())
            return r.data.get("last_block", default) if r.data else default
        except Exception:
            return default

    def _save_last_indexed_block(self, block: int):
        self.db.db.table("indexer_state").upsert({
            "treasury_id": self.treasury_id,
            "last_block": block,
            "updated_at": datetime.utcnow().isoformat(),
        }, on_conflict="treasury_id").execute()

    async def run(self):
        """Main indexer loop."""
        log.info(f"Indexer starting from block {self.from_block}")
        while True:
            try:
                latest = self.w3.eth.block_number
                if latest <= self.from_block:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                to_block = min(self.from_block + BATCH_SIZE, latest)
                await self._process_range(self.from_block + 1, to_block)

                self.from_block = to_block
                self._save_last_indexed_block(to_block)

            except Exception as e:
                log.error(f"Indexer error: {e}")
                await asyncio.sleep(POLL_INTERVAL * 2)

    async def _process_range(self, from_block: int, to_block: int):
        """Fetch and process all relevant logs in a block range."""
        watched_addresses = [self.governance_address, self.treasury_address]
        all_topics = list(EVENTS.values())

        logs = self.w3.eth.get_logs({
            "fromBlock": from_block,
            "toBlock": to_block,
            "address": [Web3.to_checksum_address(a) for a in watched_addresses],
            "topics": [all_topics],
        })

        for log_entry in logs:
            await self._handle_log(log_entry)

    async def _handle_log(self, log_entry):
        if not log_entry.get("topics"):
            return

        sig = log_entry["topics"][0].hex()
        event_name = SIG_TO_NAME.get(sig)
        if not event_name:
            return

        source = log_entry["address"].lower()
        block_ts = self.w3.eth.get_block(log_entry["blockNumber"])["timestamp"]

        handler = getattr(self, f"_on_{event_name}", None)
        if handler:
            try:
                await handler(log_entry, block_ts)
                log.debug(f"Processed {event_name} at block {log_entry['blockNumber']}")
            except Exception as e:
                log.error(f"Error handling {event_name}: {e}")

    # ─── Event handlers ───────────────────────────────────────────────────────

    async def _on_MemberAdded(self, log_entry, block_ts: int):
        member = _decode_address(log_entry["topics"][1])
        weight = int(log_entry["topics"][2].hex(), 16)
        self.db.upsert_member(self.treasury_id, member, {
            "equity_weight": weight,
            "active": True,
            "created_at": datetime.utcfromtimestamp(block_ts).isoformat(),
        })

    async def _on_MemberRemoved(self, log_entry, block_ts: int):
        member = _decode_address(log_entry["topics"][1])
        self.db.upsert_member(self.treasury_id, member, {
            "equity_weight": 0,
            "active": False,
            "updated_at": datetime.utcfromtimestamp(block_ts).isoformat(),
        })

    async def _on_EquityTransferred(self, log_entry, block_ts: int):
        from_addr = _decode_address(log_entry["topics"][1])
        to_addr   = _decode_address(log_entry["topics"][2])
        data_bytes = log_entry.get("data", b"")
        if isinstance(data_bytes, str):
            data_bytes = bytes.fromhex(data_bytes.removeprefix("0x"))
        weight = int.from_bytes(data_bytes[:32], "big") if len(data_bytes) >= 32 else 0
        log.info(f"EquityTransferred {weight} bps from {from_addr} to {to_addr}")

        # Sync both addresses from chain so DB stays accurate
        try:
            from web3 import Web3
            from web3.middleware import ExtraDataToPOAMiddleware
            import os, json
            from ..services.web3_service import GOVERNANCE_ABI
            w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://forno.celo.org")))
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            gov = w3.eth.contract(
                address=Web3.to_checksum_address(self.governance_address),
                abi=GOVERNANCE_ABI,
            )
            for addr in (from_addr, to_addr):
                m = gov.functions.getMember(Web3.to_checksum_address(addr)).call()
                self.db.upsert_member(self.treasury_id, addr, {
                    "equity_weight": m[1],
                    "active": m[2],
                    "updated_at": datetime.utcfromtimestamp(block_ts).isoformat(),
                })
        except Exception as e:
            log.error(f"EquityTransferred weight sync failed: {e}")

    async def _on_ProposalCreated(self, log_entry, block_ts: int):
        proposal_id   = int(log_entry["topics"][1].hex(), 16)
        proposal_type = int(log_entry["topics"][2].hex(), 16)
        # Remaining fields from non-indexed data
        data = log_entry.get("data", b"")
        self.db.create_proposal({
            "treasury_id": self.treasury_id,
            "proposal_id_onchain": proposal_id,
            "type": _proposal_type_name(proposal_type),
            "status": "PENDING",
            "created_at": datetime.utcfromtimestamp(block_ts).isoformat(),
        })

    async def _on_ProposalApproved(self, log_entry, block_ts: int):
        onchain_id = int(log_entry["topics"][1].hex(), 16)
        signer     = _decode_address(log_entry["topics"][2])

        # weight (uint256) and totalApproved (uint256) are in non-indexed data
        data_bytes = log_entry.get("data", b"")
        if isinstance(data_bytes, str):
            data_bytes = bytes.fromhex(data_bytes.removeprefix("0x"))
        weight = total_weight = 0
        if len(data_bytes) >= 64:
            weight       = int.from_bytes(data_bytes[:32],  "big")
            total_weight = int.from_bytes(data_bytes[32:64], "big")

        # Look up the DB proposal UUID by onchain id
        try:
            r = (self.db.db.table("proposals")
                 .select("id, status, required_weight")
                 .eq("treasury_id", self.treasury_id)
                 .eq("proposal_id_onchain", onchain_id)
                 .single()
                 .execute())
            if not r.data:
                log.warning(f"ProposalApproved: no DB row for onchain_id={onchain_id}")
                return
            db_proposal_id = r.data["id"]
            required       = r.data["required_weight"]
        except Exception as e:
            log.error(f"ProposalApproved DB lookup failed: {e}")
            return

        # Record signature (idempotent — UNIQUE(proposal_id, signer) prevents duplicates)
        try:
            self.db.add_signature(
                proposal_id=db_proposal_id,
                signer=signer,
                weight=weight,
                signature="onchain",
            )
        except Exception:
            pass  # Already recorded (e.g. via /sign endpoint before indexer caught up)

        # Promote to APPROVED if threshold reached
        if total_weight >= required:
            self.db.update_proposal_status(db_proposal_id, "APPROVED")

    async def _on_ProposalExecuted(self, log_entry, block_ts: int):
        proposal_id = int(log_entry["topics"][1].hex(), 16)
        self.db.update_proposal_status(
            str(proposal_id),
            "EXECUTED",
            executed_at=datetime.utcfromtimestamp(block_ts).isoformat(),
        )

    async def _on_TreasuryPayment(self, log_entry, block_ts: int):
        token     = _decode_address(log_entry["topics"][1])
        recipient = _decode_address(log_entry["topics"][2])
        amount    = _decode_uint256(log_entry.get("data", b""))
        tx_hash   = _decode_hex(log_entry["transactionHash"])

        self.db.insert_transaction(self.treasury_id, {
            "tx_hash":      tx_hash,
            "chain_id":     self.w3.eth.chain_id,
            "from_address": self.treasury_address,
            "to_address":   recipient,
            "token":        token,
            "amount":       str(amount),
            "direction":    "out",
            "block_number": log_entry["blockNumber"],
            "timestamp":    datetime.utcfromtimestamp(block_ts).isoformat(),
        })

    async def _on_Deposited(self, log_entry, block_ts: int):
        sender  = _decode_address(log_entry["topics"][1])
        amount  = _decode_uint256(log_entry.get("data", b""))
        tx_hash = _decode_hex(log_entry["transactionHash"])

        self.db.insert_transaction(self.treasury_id, {
            "tx_hash":      tx_hash,
            "chain_id":     self.w3.eth.chain_id,
            "from_address": sender,
            "to_address":   self.treasury_address,
            "token":        "0x0000000000000000000000000000000000000000",
            "amount":       str(amount),
            "direction":    "in",
            "block_number": log_entry["blockNumber"],
            "timestamp":    datetime.utcfromtimestamp(block_ts).isoformat(),
        })

    async def _on_Paused(self, log_entry, block_ts: int):
        log.warning(f"Treasury PAUSED at block {log_entry['blockNumber']}")

    async def _on_Unpaused(self, log_entry, block_ts: int):
        log.info(f"Treasury unpaused at block {log_entry['blockNumber']}")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _decode_address(topic) -> str:
    if isinstance(topic, bytes):
        return "0x" + topic.hex()[-40:]
    return "0x" + str(topic)[-40:]

def _decode_uint256(data) -> int:
    if not data:
        return 0
    if isinstance(data, str):
        data = bytes.fromhex(data.removeprefix("0x"))
    return int.from_bytes(data[:32], "big") if len(data) >= 32 else 0

def _decode_hex(val) -> str:
    if isinstance(val, bytes):
        return val.hex()
    return str(val)


def _proposal_type_name(type_int: int) -> str:
    names = [
        "PAYMENT", "BATCH_PAYMENT", "ADD_MEMBER", "REMOVE_MEMBER",
        "TRANSFER_EQUITY", "CHANGE_THRESHOLD", "CHANGE_POLICY", "EMERGENCY_ACTION"
    ]
    return names[type_int] if type_int < len(names) else "UNKNOWN"


# ─── Entry point ─────────────────────────────────────────────────────────────

async def start_indexer(treasury_id: str):
    indexer = BlockchainIndexer(treasury_id)
    await indexer.run()
