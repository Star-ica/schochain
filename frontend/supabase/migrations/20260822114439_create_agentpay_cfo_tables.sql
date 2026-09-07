/*
# CFOx CFO Console — core tables

Creates the single-tenant data model for the CFO treasury console.
This app has no sign-in screen, so all policies are open to anon+authenticated
(intentionally shared workspace data).

## New Tables
1. `treasury_accounts` — funding sources / wallets held by the workspace.
   - id, name, provider, currency, balance, available, type, status, created_at.
2. `proposals` — payment requests raised by agents or humans for approval.
   - id, title, merchant, category, amount, currency, requested_by, status,
     justification, created_at, updated_at.
3. `policies` — spending guardrails (thresholds, allowed categories, per-agent caps).
   - id, name, description, category, limit_amount, period, active, created_at.
4. `activity` — append-only audit feed of treasury events.
   - id, type, title, detail, amount, actor, created_at.
5. `transactions` — ledger of approved / pending money movement per account.
   - id, account_id, proposal_id, merchant, amount, status, created_at.

## Security
- RLS enabled on every table.
- 4 CRUD policies per table, scoped to `anon, authenticated` (no-auth single-tenant app).
*/

CREATE TABLE IF NOT EXISTS treasury_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  balance numeric(14,2) NOT NULL DEFAULT 0,
  available numeric(14,2) NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'operating',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE treasury_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_treasury_accounts" ON treasury_accounts;
CREATE POLICY "anon_select_treasury_accounts" ON treasury_accounts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_treasury_accounts" ON treasury_accounts;
CREATE POLICY "anon_insert_treasury_accounts" ON treasury_accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_treasury_accounts" ON treasury_accounts;
CREATE POLICY "anon_update_treasury_accounts" ON treasury_accounts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_treasury_accounts" ON treasury_accounts;
CREATE POLICY "anon_delete_treasury_accounts" ON treasury_accounts FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  merchant text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  requested_by text NOT NULL DEFAULT 'System',
  status text NOT NULL DEFAULT 'pending',
  justification text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_proposals" ON proposals;
CREATE POLICY "anon_select_proposals" ON proposals FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_proposals" ON proposals;
CREATE POLICY "anon_insert_proposals" ON proposals FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_proposals" ON proposals;
CREATE POLICY "anon_update_proposals" ON proposals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_proposals" ON proposals;
CREATE POLICY "anon_delete_proposals" ON proposals FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  limit_amount numeric(14,2) NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_policies" ON policies;
CREATE POLICY "anon_select_policies" ON policies FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_policies" ON policies;
CREATE POLICY "anon_insert_policies" ON policies FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_policies" ON policies;
CREATE POLICY "anon_update_policies" ON policies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_policies" ON policies;
CREATE POLICY "anon_delete_policies" ON policies FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  detail text,
  amount numeric(14,2),
  actor text NOT NULL DEFAULT 'System',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_activity" ON activity;
CREATE POLICY "anon_select_activity" ON activity FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_activity" ON activity;
CREATE POLICY "anon_insert_activity" ON activity FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_activity" ON activity;
CREATE POLICY "anon_update_activity" ON activity FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_activity" ON activity;
CREATE POLICY "anon_delete_activity" ON activity FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES treasury_accounts(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  merchant text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
