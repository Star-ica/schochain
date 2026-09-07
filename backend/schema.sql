-- CFOx CFO — Supabase/PostgreSQL Schema
-- Run this in the Supabase SQL editor or via psql

-- ─── Organizations ───────────────────────────────────────────────────────────
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    created_by  TEXT NOT NULL,  -- wallet address
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Treasuries ──────────────────────────────────────────────────────────────
CREATE TABLE treasuries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    address         TEXT NOT NULL,
    chain_id        INTEGER NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(address, chain_id)
);

-- ─── Members ─────────────────────────────────────────────────────────────────
CREATE TABLE members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id     UUID REFERENCES treasuries(id),
    wallet_address  TEXT NOT NULL,
    name            TEXT,
    role            TEXT,
    equity_weight   INTEGER NOT NULL DEFAULT 0,   -- basis points
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(treasury_id, wallet_address)
);

-- ─── Equity snapshots (per proposal) ─────────────────────────────────────────
CREATE TABLE equity_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id     UUID REFERENCES treasuries(id),
    proposal_id     UUID,
    member_address  TEXT NOT NULL,
    equity_weight   INTEGER NOT NULL,
    snapshot_block  BIGINT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Proposals ───────────────────────────────────────────────────────────────
CREATE TABLE proposals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id         UUID REFERENCES treasuries(id),
    proposal_id_onchain BIGINT,
    type                TEXT NOT NULL,
    title               TEXT,
    description         TEXT,
    target              TEXT,   -- recipient address
    value               TEXT,   -- amount as string (avoid float precision loss)
    token               TEXT,
    calldata            BYTEA,
    operation_hash      TEXT,
    required_weight     INTEGER NOT NULL DEFAULT 5000,
    approved_weight     INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'PENDING',
    created_by          TEXT,   -- wallet address
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    executed_at         TIMESTAMPTZ
);

-- ─── Proposal signatures ─────────────────────────────────────────────────────
CREATE TABLE proposal_signatures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID REFERENCES proposals(id),
    signer      TEXT NOT NULL,
    weight      INTEGER NOT NULL,
    signature   TEXT,
    signed_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, signer)
);

-- ─── Transactions ────────────────────────────────────────────────────────────
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id     UUID REFERENCES treasuries(id),
    tx_hash         TEXT UNIQUE NOT NULL,
    chain_id        INTEGER NOT NULL,
    from_address    TEXT,
    to_address      TEXT,
    token           TEXT,
    amount          TEXT,       -- raw amount (base units)
    amount_usd      NUMERIC,    -- USD value at time of tx
    direction       TEXT,       -- 'in' | 'out'
    category        TEXT DEFAULT 'Other',
    description     TEXT,
    block_number    BIGINT,
    timestamp       TIMESTAMPTZ,
    proposal_id     UUID REFERENCES proposals(id)
);

-- ─── Budgets ─────────────────────────────────────────────────────────────────
CREATE TABLE budgets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id UUID REFERENCES treasuries(id),
    category    TEXT NOT NULL,
    amount_usd  NUMERIC NOT NULL,
    period      TEXT NOT NULL DEFAULT 'current_month',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(treasury_id, category, period)
);

-- ─── Vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE vendors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id     UUID REFERENCES treasuries(id),
    wallet_address  TEXT NOT NULL,
    name            TEXT,
    category        TEXT,
    whitelisted     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(treasury_id, wallet_address)
);

-- ─── Agent actions (audit log) ────────────────────────────────────────────────
CREATE TABLE agent_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id     UUID REFERENCES treasuries(id),
    action_type     TEXT NOT NULL,
    input           JSONB,
    decision        TEXT,
    risk_score      NUMERIC,
    policy_result   TEXT,
    proposal_id     UUID REFERENCES proposals(id),
    executed        BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Policies ────────────────────────────────────────────────────────────────
CREATE TABLE policies (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id                 UUID REFERENCES treasuries(id) UNIQUE,
    per_transaction_limit_usd   NUMERIC DEFAULT 100,
    daily_limit_usd             NUMERIC DEFAULT 500,
    weekly_limit_usd            NUMERIC DEFAULT 2000,
    medium_threshold_bps        INTEGER DEFAULT 5000,
    large_threshold_bps         INTEGER DEFAULT 7000,
    large_payment_amount_usd    NUMERIC DEFAULT 1000,
    recipient_whitelist_enabled BOOLEAN DEFAULT FALSE,
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_id UUID REFERENCES treasuries(id),
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL,  -- LOW | MEDIUM | HIGH | CRITICAL
    message     TEXT NOT NULL,
    resolved    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexer state ────────────────────────────────────────────────────────────
CREATE TABLE indexer_state (
    treasury_id UUID REFERENCES treasuries(id) PRIMARY KEY,
    last_block  BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_transactions_treasury_ts  ON transactions(treasury_id, timestamp DESC);
CREATE INDEX idx_transactions_to_address   ON transactions(to_address);
CREATE INDEX idx_proposals_treasury_status ON proposals(treasury_id, status);
CREATE INDEX idx_agent_actions_treasury_ts ON agent_actions(treasury_id, created_at DESC);
CREATE INDEX idx_members_treasury          ON members(treasury_id);

-- ─── Factory integration (add to treasuries table) ───────────────────────────
-- Run these ALTER statements if you already have the table:
ALTER TABLE treasuries ADD COLUMN IF NOT EXISTS governance_address TEXT;
ALTER TABLE treasuries ADD COLUMN IF NOT EXISTS policy_address TEXT;
ALTER TABLE treasuries ADD COLUMN IF NOT EXISTS factory_address TEXT;
