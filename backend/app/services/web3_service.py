"""
Web3 Service — connects the FastAPI backend to the deployed CFOx contracts.

Factory-aware: contract addresses are loaded per-treasury from the DB,
not hardcoded in .env. Only FACTORY_CONTRACT lives in env.
"""

import os
import json
from decimal import Decimal
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from eth_account import Account

# ─── ABIs ─────────────────────────────────────────────────────────────────────

GOVERNANCE_ABI = json.loads("""[
  {"type":"function","name":"createPaymentProposal",
   "inputs":[
     {"name":"token","type":"address"},
     {"name":"recipient","type":"address"},
     {"name":"amount","type":"uint256"},
     {"name":"description","type":"string"}
   ],
   "outputs":[{"name":"proposalId","type":"uint256"}],
   "stateMutability":"nonpayable"},

  {"type":"function","name":"approve",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[],"stateMutability":"nonpayable"},

  {"type":"function","name":"execute",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[],"stateMutability":"nonpayable"},

  {"type":"function","name":"getMember",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"components":[
     {"name":"account","type":"address"},
     {"name":"weight","type":"uint256"},
     {"name":"active","type":"bool"},
     {"name":"createdAt","type":"uint256"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getProposal",
   "inputs":[{"name":"proposalId","type":"uint256"}],
   "outputs":[{"components":[
     {"name":"id","type":"uint256"},
     {"name":"proposer","type":"address"},
     {"name":"proposalType","type":"uint8"},
     {"name":"operationHash","type":"bytes32"},
     {"name":"requiredWeight","type":"uint256"},
     {"name":"approvedWeight","type":"uint256"},
     {"name":"snapshotBlock","type":"uint256"},
     {"name":"createdAt","type":"uint256"},
     {"name":"expiresAt","type":"uint256"},
     {"name":"executed","type":"bool"},
     {"name":"cancelled","type":"bool"},
     {"name":"callData","type":"bytes"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getMembers",
   "inputs":[],"outputs":[{"name":"","type":"address[]"}],
   "stateMutability":"view"},

  {"type":"function","name":"totalEquity",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"proposalCount",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"hasSigned",
   "inputs":[
     {"name":"proposalId","type":"uint256"},
     {"name":"member","type":"address"}
   ],
   "outputs":[{"name":"","type":"bool"}],
   "stateMutability":"view"},

  {"type":"function","name":"getSnapshotWeight",
   "inputs":[
     {"name":"proposalId","type":"uint256"},
     {"name":"member","type":"address"}
   ],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"}
]""")

TREASURY_ABI = json.loads("""[
  {"type":"function","name":"balanceOf",
   "inputs":[{"name":"token","type":"address"}],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"isPaused",
   "inputs":[],"outputs":[{"name":"","type":"bool"}],
   "stateMutability":"view"},

  {"type":"function","name":"pauseReason",
   "inputs":[],"outputs":[{"name":"","type":"string"}],
   "stateMutability":"view"}
]""")

POLICY_ABI = json.loads("""[
  {"type":"function","name":"getPolicy",
   "inputs":[],"outputs":[{"components":[
     {"name":"perTransactionLimit","type":"uint256"},
     {"name":"dailyLimit","type":"uint256"},
     {"name":"weeklyLimit","type":"uint256"},
     {"name":"mediumPaymentThreshold","type":"uint256"},
     {"name":"largePaymentThreshold","type":"uint256"},
     {"name":"largePaymentAmount","type":"uint256"},
     {"name":"recipientWhitelistEnabled","type":"bool"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"getDailySpend",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"function","name":"getWeeklySpend",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"}
]""")

ERC20_ABI = json.loads("""[
  {"type":"function","name":"balanceOf",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},
  {"type":"function","name":"decimals",
   "inputs":[],"outputs":[{"name":"","type":"uint8"}],
   "stateMutability":"view"},
  {"type":"function","name":"symbol",
   "inputs":[],"outputs":[{"name":"","type":"string"}],
   "stateMutability":"view"}
]""")

FACTORY_ABI = json.loads("""[
  {"type":"function","name":"deploy",
   "inputs":[
     {"name":"founderName","type":"string"},
     {"name":"agentWallet","type":"address"},
     {"name":"usdcAddress","type":"address"},
     {"name":"perTxLimit","type":"uint256"},
     {"name":"dailyLimit","type":"uint256"},
     {"name":"weeklyLimit","type":"uint256"}
   ],
   "outputs":[
     {"name":"governance","type":"address"},
     {"name":"treasury","type":"address"},
     {"name":"policy","type":"address"}
   ],
   "stateMutability":"nonpayable"},

  {"type":"function","name":"getInstance",
   "inputs":[{"name":"founder","type":"address"}],
   "outputs":[{"components":[
     {"name":"governance","type":"address"},
     {"name":"treasury","type":"address"},
     {"name":"policy","type":"address"},
     {"name":"founder","type":"address"},
     {"name":"deployedAt","type":"uint256"}
   ],"name":"","type":"tuple"}],
   "stateMutability":"view"},

  {"type":"function","name":"hasInstance",
   "inputs":[{"name":"founder","type":"address"}],
   "outputs":[{"name":"","type":"bool"}],
   "stateMutability":"view"},

  {"type":"function","name":"totalDeployed",
   "inputs":[],"outputs":[{"name":"","type":"uint256"}],
   "stateMutability":"view"},

  {"type":"event","name":"CFOxDeployed",
   "inputs":[
     {"name":"founder","type":"address","indexed":true},
     {"name":"governance","type":"address","indexed":false},
     {"name":"treasury","type":"address","indexed":false},
     {"name":"policy","type":"address","indexed":false}
   ]}
]""")


# ─── Base service (factory + agent wallet only) ───────────────────────────────

class Web3Service:
    """
    Base Web3 service — holds the agent wallet and factory contract only.
    Per-treasury contract instances are created on demand via for_treasury().
    This means NO env vars for GOVERNANCE_CONTRACT / TREASURY_CONTRACT / POLICY_CONTRACT.
    Only FACTORY_CONTRACT is needed.
    """

    def __init__(self):
        rpc_url = os.getenv("RPC_URL", "https://forno.celo.org")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        assert self.w3.is_connected(), f"Cannot connect to RPC: {rpc_url}"

        # Agent wallet — signs all backend-submitted txs
        agent_key = os.getenv("AGENT_PRIVATE_KEY")
        assert agent_key, "AGENT_PRIVATE_KEY not set"
        self.agent_account = Account.from_key(agent_key)

        # Factory — the only contract address that lives in env
        factory_addr = os.getenv("FACTORY_CONTRACT")
        if factory_addr:
            self.factory_address = Web3.to_checksum_address(factory_addr)
            self.factory = self.w3.eth.contract(
                address=self.factory_address, abi=FACTORY_ABI
            )
        else:
            self.factory_address = None
            self.factory = None

        self.chain_id = self.w3.eth.chain_id

        # Token registry — shared across all treasuries
        self.tokens: dict[str, dict] = self._load_token_registry()

    def _load_token_registry(self) -> dict:
        registry = {}
        usdc = os.getenv("USDC_ADDRESS")
        if usdc:
            registry["USDC"] = {"address": Web3.to_checksum_address(usdc), "decimals": 6}
        weth = os.getenv("WETH_ADDRESS")
        if weth:
            registry["WETH"] = {"address": Web3.to_checksum_address(weth), "decimals": 18}
        return registry

    def _get_gas_price(self) -> int:
        return int(self.w3.eth.gas_price * 1.1)

    def _get_token(self, symbol: str) -> dict:
        key = symbol.upper()
        if key not in self.tokens:
            raise ValueError(f"Unknown token: {symbol}. Allowed: {list(self.tokens)}")
        return self.tokens[key]

    # ─── Per-treasury contract binding ────────────────────────────────────────

    def for_treasury(self, treasury_row: dict) -> "TreasuryWeb3":
        """
        Return a treasury-scoped Web3 helper bound to the contract addresses
        stored in the DB row. Call this in every API route that needs onchain data.

        treasury_row must have: address, governance_address, policy_address
        """
        return TreasuryWeb3(self, treasury_row)

    # ─── Factory operations ───────────────────────────────────────────────────

    def get_instance(self, founder_address: str) -> dict | None:
        """Read the onchain CFOxInstance struct for a founder."""
        if not self.factory:
            raise RuntimeError("FACTORY_CONTRACT not configured")
        checksum = Web3.to_checksum_address(founder_address)
        result = self.factory.functions.getInstance(checksum).call()
        return {
            "governance": result[0],
            "treasury":   result[1],
            "policy":     result[2],
            "founder":    result[3],
            "deployed_at": result[4],
        }

    def deploy_instance(
        self,
        founder_address: str,
        founder_name: str,
        usdc_address: str,
        per_tx_limit: int,
        daily_limit: int,
        weekly_limit: int,
    ) -> dict:
        """Call factory.deploy() from the agent wallet. Returns addresses + tx_hash."""
        if not self.factory:
            raise RuntimeError("FACTORY_CONTRACT not configured")

        tx = self.factory.functions.deploy(
            founder_name,
            self.agent_account.address,
            Web3.to_checksum_address(usdc_address),
            per_tx_limit,
            daily_limit,
            weekly_limit,
        ).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 8_000_000,
            "gasPrice": self._get_gas_price(),
        })

        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"Factory deploy reverted: {tx_hash.hex()}")

        # Parse CFOxDeployed event — handle HexBytes or plain str
        deployed_topic = Web3.keccak(text="CFOxDeployed(address,address,address,address)")
        gov_addr = treas_addr = policy_addr = None
        for log in receipt.get("logs", []):
            if log["topics"] and log["topics"][0] == deployed_topic:
                raw = log["data"]
                data_bytes = bytes(raw) if isinstance(raw, (bytes, bytearray)) \
                    else bytes.fromhex(raw.removeprefix("0x"))
                decoded = self.w3.codec.decode(
                    ["address", "address", "address"], data_bytes
                )
                gov_addr, treas_addr, policy_addr = decoded
                break

        if not gov_addr:
            raise RuntimeError("CFOxDeployed event not found in receipt")

        return {
            "tx_hash": tx_hash.hex(),
            "governance_address": gov_addr,
            "treasury_address":   treas_addr,
            "policy_address":     policy_addr,
        }


# ─── Per-treasury scoped helper ───────────────────────────────────────────────

class TreasuryWeb3:
    """
    Wraps Web3Service with contract instances bound to a specific treasury.
    Created fresh per request from the DB row — no singleton state per treasury.
    """

    def __init__(self, base: Web3Service, treasury_row: dict):
        self.base = base
        self.w3 = base.w3
        self.agent_account = base.agent_account
        self.tokens = base.tokens

        self.treasury_address    = Web3.to_checksum_address(treasury_row["address"])
        self.governance_address  = Web3.to_checksum_address(treasury_row["governance_address"])
        self.policy_address      = Web3.to_checksum_address(treasury_row["policy_address"])

        self.governance = self.w3.eth.contract(address=self.governance_address, abi=GOVERNANCE_ABI)
        self.treasury   = self.w3.eth.contract(address=self.treasury_address,   abi=TREASURY_ABI)
        self.policy     = self.w3.eth.contract(address=self.policy_address,     abi=POLICY_ABI)

    def _get_gas_price(self) -> int:
        return self.base._get_gas_price()

    def _get_token(self, symbol: str) -> dict:
        return self.base._get_token(symbol)

    # ─── Treasury reads ───────────────────────────────────────────────────────

    def get_native_balance(self) -> int:
        return self.w3.eth.get_balance(self.treasury_address)

    def get_token_balance(self, token_symbol: str) -> int:
        token = self._get_token(token_symbol)
        erc20 = self.w3.eth.contract(address=token["address"], abi=ERC20_ABI)
        return erc20.functions.balanceOf(self.treasury_address).call()

    def get_all_balances(self) -> list[dict]:
        balances = []
        native_bal = self.get_native_balance()
        balances.append({
            "symbol": "CELO",
            "address": "0x0000000000000000000000000000000000000000",
            "raw_balance": native_bal,
            "decimals": 18,
        })
        for symbol, info in self.tokens.items():
            try:
                raw = self.get_token_balance(symbol)
                balances.append({
                    "symbol": symbol,
                    "address": info["address"],
                    "raw_balance": raw,
                    "decimals": info["decimals"],
                })
            except Exception:
                pass
        return balances

    def is_treasury_paused(self) -> bool:
        return self.treasury.functions.isPaused().call()

    def pause_treasury(self, reason: str) -> str:
        tx = self.treasury.functions.emergencyPause(reason).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 100_000,
            "gasPrice": self._get_gas_price(),
        })
        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return tx_hash.hex()

    def unpause_treasury(self) -> str:
        tx = self.treasury.functions.unpause().build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 100_000,
            "gasPrice": self._get_gas_price(),
        })
        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return tx_hash.hex()

    # ─── Governance reads ─────────────────────────────────────────────────────

    def get_all_members(self) -> list[dict]:
        addresses = self.governance.functions.getMembers().call()
        members = []
        for addr in addresses:
            m = self.governance.functions.getMember(addr).call()
            members.append({
                "address": addr,
                "weight": m[1],
                "active": m[2],
                "created_at": m[3],
            })
        return members



    def verify_subscription_tx(
        self,
        tx_hash: str,
        founder_address: str,
        treasury_address: str,
    ) -> bool:
        """
        Confirm that tx_hash is a real paySubscription() call from founder_address
        that emitted SubscriptionPaid with the correct treasury address.
        Returns True if valid, False otherwise.
        """
        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
            tx = self.w3.eth.get_transaction(tx_hash)
        except Exception:
            return False

        if receipt is None or receipt.get("status") != 1:
            return False

        # Sender must be the founder
        if tx["from"].lower() != founder_address.lower():
            return False

        # Must be sent to the factory
        factory_addr = os.getenv("FACTORY_CONTRACT", "").lower()
        if tx["to"].lower() != factory_addr:
            return False

        # Check for SubscriptionPaid event
        # event SubscriptionPaid(address indexed founder, address indexed treasury, uint256 amount, uint256 periodStart)
        topic = Web3.keccak(text="SubscriptionPaid(address,address,uint256,uint256)")
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            if not topics or topics[0] != topic:
                continue
            # topics[2] is the indexed treasury address (padded to 32 bytes)
            if len(topics) >= 3:
                log_treasury = "0x" + topics[2].hex()[-40:]
                if log_treasury.lower() == treasury_address.lower():
                    return True

        return False
    def get_proposal(self, proposal_id: int) -> dict:
        p = self.governance.functions.getProposal(proposal_id).call()
        return {
            "id": p[0], "proposer": p[1], "proposal_type": p[2],
            "operation_hash": p[3].hex(), "required_weight": p[4],
            "approved_weight": p[5], "snapshot_block": p[6],
            "created_at": p[7], "expires_at": p[8],
            "executed": p[9], "cancelled": p[10],
        }

    def get_proposal_count(self) -> int:
        return self.governance.functions.proposalCount().call()

    def has_signed(self, proposal_id: int, member: str) -> bool:
        return self.governance.functions.hasSigned(proposal_id, member).call()

    def get_snapshot_weight(self, proposal_id: int, member: str) -> int:
        return self.governance.functions.getSnapshotWeight(proposal_id, member).call()

    # ─── Policy reads ─────────────────────────────────────────────────────────

    def get_policy(self) -> dict:
        p = self.policy.functions.getPolicy().call()
        return {
            "per_transaction_limit": p[0],
            "daily_limit": p[1],
            "weekly_limit": p[2],
            "medium_payment_threshold": p[3],
            "large_payment_threshold": p[4],
            "large_payment_amount": p[5],
            "recipient_whitelist_enabled": p[6],
            "daily_spent": self.policy.functions.getDailySpend().call(),
            "weekly_spent": self.policy.functions.getWeeklySpend().call(),
        }

    # ─── Transactions ─────────────────────────────────────────────────────────

    def create_payment_proposal(
        self,
        token_symbol: str,
        recipient: str,
        amount_human: Decimal,
        description: str,
    ) -> dict:
        token = self._get_token(token_symbol)
        amount_raw = int(amount_human * Decimal(10 ** token["decimals"]))

        tx = self.governance.functions.createPaymentProposal(
            token["address"],
            Web3.to_checksum_address(recipient),
            amount_raw,
            description,
        ).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 300_000,
            "gasPrice": self._get_gas_price(),
        })
        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt["status"] != 1:
            raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

        proposal_id = self._parse_proposal_created(receipt)
        return {"tx_hash": tx_hash.hex(), "proposal_id": proposal_id, "block": receipt["blockNumber"]}

    def execute_proposal(self, proposal_id: int) -> str:
        tx = self.governance.functions.execute(proposal_id).build_transaction({
            "from": self.agent_account.address,
            "nonce": self.w3.eth.get_transaction_count(self.agent_account.address),
            "gas": 300_000,
            "gasPrice": self._get_gas_price(),
        })
        signed = self.agent_account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return tx_hash.hex()

    def _parse_proposal_created(self, receipt) -> int:
        topic = Web3.keccak(text="ProposalCreated(uint256,uint8,bytes32,uint256)")
        for log in receipt.get("logs", []):
            if log["topics"] and log["topics"][0] == topic:
                return int(log["topics"][1].hex(), 16)
        return 0


# ─── FastAPI dependency ───────────────────────────────────────────────────────

_web3_service: Web3Service | None = None


def get_web3_service() -> Web3Service:
    global _web3_service
    if _web3_service is None:
        _web3_service = Web3Service()
    return _web3_service