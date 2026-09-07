-- ─────────────────────────────────────────────────────────────────────────────
-- CFOx Migration: fix gaps identified in code review
-- Run this against your Supabase project (SQL editor or psql)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. indexer_state table (resume-from-block for the event indexer)
create table if not exists indexer_state (
    treasury_id   uuid        primary key references treasuries(id) on delete cascade,
    last_block    bigint      not null default 0,
    updated_at    timestamptz not null default now()
);

-- 2. Prevent duplicate signatures per proposal per signer
--    (safe to run even if the table already exists)
do $$ begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'proposal_signatures_proposal_signer_unique'
    ) then
        alter table proposal_signatures
            add constraint proposal_signatures_proposal_signer_unique
            unique (proposal_id, signer);
    end if;
end $$;

-- 3. policies table must have all columns the backend expects
alter table policies
    add column if not exists per_transaction_limit_usd  numeric  not null default 100,
    add column if not exists daily_limit_usd             numeric  not null default 500,
    add column if not exists weekly_limit_usd            numeric  not null default 2000,
    add column if not exists medium_threshold_bps        integer  not null default 5000,
    add column if not exists large_threshold_bps         integer  not null default 7000,
    add column if not exists large_payment_amount_usd    numeric  not null default 1000,
    add column if not exists recipient_whitelist_enabled boolean  not null default false,
    add column if not exists updated_at                  timestamptz not null default now();

-- 4. proposals table — add columns that code inserts but schema may lack
alter table proposals
    add column if not exists title       text,
    add column if not exists value       text,         -- human-readable amount string
    add column if not exists target      text,         -- recipient address
    add column if not exists created_by  text,
    add column if not exists token       text;

-- 5. members table — add updated_at if missing
alter table members
    add column if not exists updated_at timestamptz;

-- 6. transactions table — add amount_usd, category, description if missing
alter table transactions
    add column if not exists amount_usd   numeric,
    add column if not exists category     text    default 'Other',
    add column if not exists description  text;

-- 7. agent_actions — ensure policy_result column exists
alter table agent_actions
    add column if not exists policy_result text,
    add column if not exists risk_score    numeric;

-- 8. Index for fast proposal lookups by onchain id
create index if not exists idx_proposals_onchain_id
    on proposals(treasury_id, proposal_id_onchain);

-- 9. Index for transaction queries by treasury + direction + timestamp
create index if not exists idx_transactions_treasury_dir_ts
    on transactions(treasury_id, direction, timestamp desc);
