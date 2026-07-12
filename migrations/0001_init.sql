-- 0001_init.sql
-- The canonical `transactions` table: the single normalized schema that every
-- source adapter writes into. Downstream code cares only about the `source`
-- column, never the original shape. See CLAUDE.md §8 (DB), §9 (money),
-- §10 (status), §11 (idempotency).

create extension if not exists pgcrypto;

create table if not exists transactions (
  id                 uuid primary key default gen_random_uuid(),

  -- Provenance ------------------------------------------------------------
  source             text not null,          -- 'paypal' | 'seeded'
  external_id        text not null,          -- PayPal: capture ID. Idempotency key with source.
  parent_external_id text,                   -- PayPal: order ID, for traceability.

  -- Money — integer minor units only, never float (CLAUDE.md §9) -----------
  currency           text not null,          -- ISO 4217, uppercase 3 letters.
  amount_minor       bigint not null,        -- source headline amount, minor units.
  gross_amount_minor bigint not null,        -- gross captured amount == THE revenue figure.
  fee_amount_minor   bigint,                 -- processor fee if known (nullable).
  net_amount_minor   bigint,                 -- net-of-fees if known. NEVER used for revenue.

  -- Status — allow-list normalization (CLAUDE.md §10) ---------------------
  raw_status         text not null,          -- original source status string.
  canonical_status   text not null,          -- one of the six canonical values.

  -- Timestamps ------------------------------------------------------------
  source_created_at  timestamptz not null,   -- when the txn was created at the source.
  collected_at       timestamptz,            -- when revenue was collected; null unless COLLECTED.
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Audit -----------------------------------------------------------------
  raw_payload        jsonb not null,         -- full raw source payload.

  -- Idempotency boundary (CLAUDE.md §11). All writes upsert on this key.
  constraint transactions_source_external_unique unique (source, external_id),

  constraint transactions_currency_iso4217
    check (currency ~ '^[A-Z]{3}$'),

  -- Canonical status set is closed; unknown *raw* statuses map to UNKNOWN in
  -- code, they never introduce a new canonical value.
  constraint transactions_canonical_status_allowed
    check (canonical_status in
      ('COLLECTED', 'PENDING', 'FAILED', 'REFUNDED', 'VOIDED', 'UNKNOWN')),

  -- Every COLLECTED row carries a collection timestamp (revenue filters on
  -- collected_at); non-COLLECTED rows carry none.
  constraint transactions_collected_at_consistency
    check (
      (canonical_status = 'COLLECTED' and collected_at is not null)
      or (canonical_status <> 'COLLECTED' and collected_at is null)
    ),

  -- Money integrity: non-negative, and if both fee and net are known they must
  -- reconcile with gross — a guard against silently storing net as gross.
  constraint transactions_amounts_nonneg
    check (
      amount_minor >= 0 and gross_amount_minor >= 0
      and (fee_amount_minor is null or fee_amount_minor >= 0)
      and (net_amount_minor is null or net_amount_minor >= 0)
    ),
  constraint transactions_gross_net_fee_reconcile
    check (
      fee_amount_minor is null or net_amount_minor is null
      or gross_amount_minor = net_amount_minor + fee_amount_minor
    )
);

-- Supports the canonical revenue query: collected rows, by currency, over time.
create index if not exists transactions_collected_revenue_idx
  on transactions (currency, collected_at)
  where canonical_status = 'COLLECTED';

-- Keep updated_at fresh on any row update.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();
