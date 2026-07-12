import { z } from 'zod';
import { getPool } from '../database/pool.js';
import type { Queryable } from '../transactions/repository.js';

/**
 * THE canonical revenue definition, in one place (CLAUDE.md §5, §12).
 *
 * Revenue = sum of `gross_amount_minor` (gross, never net — §9) over rows that
 * are `COLLECTED`, within a half-open collection-time window and for a single
 * currency. Both the summary and breakdown endpoints build their SQL from the
 * SAME fragments below, so the number cannot drift between the two views.
 *
 * Window semantics: [from, to) — `from` inclusive, `to` EXCLUSIVE. Filtering is
 * on `collected_at` (the instant revenue was recognized). Buckets are truncated
 * in UTC so results are deterministic regardless of server timezone.
 */
const COLLECTED_FILTER = "canonical_status = 'COLLECTED'";
const REVENUE_SUM = 'coalesce(sum(gross_amount_minor), 0)::bigint';
// $1 currency, $2 from (inclusive), $3 to (exclusive)
const RANGE_FILTER =
  'currency = $1 and collected_at >= $2 and collected_at < $3';
const CANONICAL_WHERE = `${COLLECTED_FILTER} and ${RANGE_FILTER}`;

export const IntervalSchema = z.enum(['day', 'week']);
export type Interval = z.infer<typeof IntervalSchema>;

export interface RevenueQuery {
  currency: string;
  from: Date;
  to: Date;
}

export interface RevenueSummary {
  currency: string;
  from: string;
  to: string;
  totalMinor: number;
  collectedCount: number;
}

export interface BreakdownBucket {
  periodStart: string;
  totalMinor: number;
  collectedCount: number;
}

export interface RevenueBreakdown extends RevenueSummary {
  interval: Interval;
  buckets: BreakdownBucket[];
}

function toMinor(sumText: string | number): number {
  // pg returns bigint as string; safe integer for this assignment's volumes.
  return typeof sumText === 'number' ? sumText : Number.parseInt(sumText, 10);
}

/** Canonical total for a currency over a window. Used by the summary endpoint. */
export async function getRevenueSummary(
  query: RevenueQuery,
  db: Queryable = getPool(),
): Promise<RevenueSummary> {
  const sql = `
    select ${REVENUE_SUM} as total_minor, count(*)::int as collected_count
    from transactions
    where ${CANONICAL_WHERE}
  `;
  const { rows } = await db.query(sql, [query.currency, query.from, query.to]);
  return {
    currency: query.currency,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    totalMinor: toMinor(rows[0].total_minor),
    collectedCount: rows[0].collected_count,
  };
}

/**
 * Canonical total bucketed by interval. Used by the breakdown endpoint. Same
 * WHERE and same measure as the summary — only a GROUP BY differs — so the
 * buckets always sum to the summary total for the same range/currency.
 */
export async function getRevenueBreakdown(
  query: RevenueQuery,
  interval: Interval,
  db: Queryable = getPool(),
): Promise<RevenueBreakdown> {
  const sql = `
    select
      date_trunc($4, collected_at at time zone 'UTC') as period_start,
      ${REVENUE_SUM} as total_minor,
      count(*)::int as collected_count
    from transactions
    where ${CANONICAL_WHERE}
    group by period_start
    order by period_start
  `;
  const { rows } = await db.query(sql, [
    query.currency,
    query.from,
    query.to,
    interval,
  ]);

  const buckets: BreakdownBucket[] = rows.map((r) => ({
    periodStart: new Date(r.period_start).toISOString(),
    totalMinor: toMinor(r.total_minor),
    collectedCount: r.collected_count,
  }));

  const totalMinor = buckets.reduce((acc, b) => acc + b.totalMinor, 0);
  const collectedCount = buckets.reduce((acc, b) => acc + b.collectedCount, 0);

  return {
    currency: query.currency,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    interval,
    totalMinor,
    collectedCount,
    buckets,
  };
}
