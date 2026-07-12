import type { Pool, PoolClient } from 'pg';
import { getPool } from '../database/pool.js';
import {
  CanonicalTransactionSchema,
  type CanonicalTransaction,
} from './transaction.js';

/** Anything we can run a query against — the pool or a single client/txn. */
export type Queryable = Pool | PoolClient;

/** Canonical column order for inserts. raw_payload is last (jsonb cast). */
const COLUMNS = [
  'source',
  'external_id',
  'parent_external_id',
  'currency',
  'amount_minor',
  'gross_amount_minor',
  'fee_amount_minor',
  'net_amount_minor',
  'raw_status',
  'canonical_status',
  'source_created_at',
  'collected_at',
  'raw_payload',
] as const;

function toRow(tx: CanonicalTransaction): unknown[] {
  return [
    tx.source,
    tx.externalId,
    tx.parentExternalId,
    tx.currency,
    tx.amountMinor,
    tx.grossAmountMinor,
    tx.feeAmountMinor,
    tx.netAmountMinor,
    tx.rawStatus,
    tx.canonicalStatus,
    tx.sourceCreatedAt,
    tx.collectedAt,
    JSON.stringify(tx.rawPayload ?? null),
  ];
}

export interface UpsertResult {
  inserted: number;
  skipped: number;
}

/**
 * Idempotent bulk insert (CLAUDE.md §8, §11). One statement,
 * `ON CONFLICT (source, external_id) DO NOTHING`, so:
 *  - re-running an import inserts nothing new (skipped), and
 *  - concurrent duplicate imports are made safe by the DB unique constraint,
 *    not application locking.
 *
 * `RETURNING` yields only the rows actually inserted, so inserted vs skipped
 * counts are exact. Each record is re-validated through the canonical schema
 * before it can touch the DB.
 */
export async function upsertTransactions(
  txs: CanonicalTransaction[],
  db: Queryable = getPool(),
): Promise<UpsertResult> {
  if (txs.length === 0) return { inserted: 0, skipped: 0 };

  const rows = txs.map((t) => CanonicalTransactionSchema.parse(t));

  const params: unknown[] = [];
  const valuesSql = rows
    .map((tx) => {
      const placeholders = toRow(tx).map((value, colIdx) => {
        params.push(value);
        const n = params.length;
        // raw_payload (last column) is passed as a JSON string; cast to jsonb.
        return colIdx === COLUMNS.length - 1 ? `$${n}::jsonb` : `$${n}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');

  const sql =
    `insert into transactions (${COLUMNS.join(', ')}) values ${valuesSql} ` +
    `on conflict (source, external_id) do nothing returning external_id`;

  const res = await db.query(sql, params);
  const inserted = res.rowCount ?? 0;
  return { inserted, skipped: rows.length - inserted };
}
