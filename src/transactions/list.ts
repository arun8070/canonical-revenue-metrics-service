import { getPool } from '../database/pool.js';
import type { Queryable } from './repository.js';

export interface ListFilter {
  source?: string;
  currency?: string;
  canonicalStatus?: string;
  limit: number;
}

/**
 * List canonical transactions for debugging/demo. Raw payload is intentionally
 * omitted from the listing to keep responses small and avoid dumping source
 * payloads (CLAUDE.md §15); it remains stored per-row for auditability.
 */
export async function listTransactions(
  filter: ListFilter,
  db: Queryable = getPool(),
) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.source) {
    params.push(filter.source);
    conditions.push(`source = $${params.length}`);
  }
  if (filter.currency) {
    params.push(filter.currency);
    conditions.push(`currency = $${params.length}`);
  }
  if (filter.canonicalStatus) {
    params.push(filter.canonicalStatus);
    conditions.push(`canonical_status = $${params.length}`);
  }
  params.push(filter.limit);
  const limitIdx = params.length;

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const sql = `
    select id, source, external_id, parent_external_id, currency,
           amount_minor, gross_amount_minor, fee_amount_minor, net_amount_minor,
           raw_status, canonical_status, source_created_at, collected_at,
           created_at, updated_at
    from transactions
    ${where}
    order by source_created_at desc, id
    limit $${limitIdx}
  `;
  const { rows } = await db.query(sql, params);
  return rows;
}
