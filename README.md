# CFOx CFO

> AI-powered autonomous treasury management with equity-weighted human governance.

**The AI can spend, but it can't take control.**

## Architecture

```
User/DAO
  ↓
CFOx Web UI (Next.js)
  ↓
FastAPI Backend
  ├── AI CFO Agent (Anthropic claude-sonnet-4-6)
  ├── Policy Engine (offchain mirror of contract)
  └── Blockchain Indexer
  ↓
CFOxGovernance.sol
  ├── Equity-weighted proposals + signing
  └── Weight snapshots (prevents vote manipulation)
  ↓
CFOxPolicy.sol
  └── Per-tx / daily / weekly spend enforcement
  ↓
CFOxTreasury.sol
  └── Fund custody + execution
```

## Key Principles

1. **AI = Operator, Equity Holders = Governors, Smart Contract = Enforcer**
2. **Equity weights are snapshotted** at proposal creation — changing weights mid-vote has no effect
3. **All payment flows through the policy engine** — both offchain (UX) and onchain (enforcement)
4. **AI wallet has 0% equity** — it creates proposals, never controls funds directly

## Contract Suite

| Contract | Role |
|----------|------|
| `CFOxGovernance.sol` | Members, equity weights, proposals, voting |
| `CFOxTreasury.sol` | Fund custody, payment execution |
| `CFOxPolicy.sol` | AI spending limits, governance thresholds |

## Equity Model

Weights stored in **basis points** (10,000 = 100%):

```
Founder    6000  (60%)
CFO        2000  (20%)
CTO        1000  (10%)
Ops        1000  (10%)
AI Agent      0   (0%)
─────────────────────
Total     10000 (100%)  ← invariant enforced onchain
```

## Governance Thresholds

| Action | Required Approval |
|--------|--------------------|
| AI auto-execute | ≤$100 + within daily/weekly limits |
| Medium payment ($100–$1k) | 50% equity |
| Large payment (>$1k) | 70% equity |
| Add/remove member | 70% equity |
| Transfer equity | 70% equity |
| Emergency pause | 50% equity |

## Setup

### 1. Smart Contracts (Foundry)

```bash
cd contracts
forge install
cp ../.env.example .env  # fill in your values
forge build
forge test
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### 2. Backend (FastAPI)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --reload
```

### 3. AI Agent

The agent is embedded in the backend. Configure:
- `ANTHROPIC_API_KEY` — your Anthropic API key
- `AGENT_PRIVATE_KEY` — the AI agent's wallet (0% equity, just submits txs)

### 4. Frontend (Next.js) — TODO

```bash
cd frontend
npm install
npm run dev
```

## Demo Flow

1. **Create treasury** — founder gets 100% equity
2. **Add team** — founder proposes equity transfers to CFO (20%) and CTO (10%)
3. **Deposit USDC** — send USDC to treasury address
4. **Ask AI** — *"How much can we safely spend this month?"*
5. **Pay vendor** — *"Pay our designer $500"* → AI creates proposal → equity holders sign → executes
6. **Verify** — *"Why did we make that payment?"* → AI retrieves full audit trail

## Security Checklist

- [ ] Private keys never touch the AI
- [ ] AI cannot call treasury.execute() directly
- [ ] All payments validated onchain by CFOxPolicy
- [ ] Proposal hashes include chainId (replay protection)
- [ ] Weight snapshots prevent mid-vote manipulation
- [ ] Reentrancy protection on treasury
- [ ] Emergency pause mechanism
- [ ] Token whitelist enforced onchain
- [ ] Proposals expire after 7 days

## Test Coverage

```bash
cd contracts
forge test -vv
```

Tests cover:
- Auto-execute for small payments
- Daily limit escalation to multisig
- Proposal creation, signing, execution
- Cannot execute twice
- Cannot sign twice
- Non-member cannot sign
- Weight snapshot isolation
- Threshold enforcement
- Proposal expiry
- Emergency pause
- Token whitelist
- Unauthorized treasury access
- Equity transfer flow
- Weight invariant (sum = 10000)
- Operation hash includes chainId (replay protection)
# CFOx
# CFOx
# cfox
