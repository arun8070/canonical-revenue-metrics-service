import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../src/database/pool.js';
import { importSeeded } from '../src/integrations/seeded-provider/import.js';
import { upsertTransactions } from '../src/transactions/repository.js';
import type { CanonicalTransaction } from '../src/transactions/transaction.js';
import {
  getRevenueSummary,
  getRevenueBreakdown,
  type RevenueQuery,
} from '../src/metrics/revenue.js';

const hasDb = Boolean(process.env.DATABASE_URL);

const JULY: Omit<RevenueQuery, 'currency'> = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-08-01T00:00:00Z'), // exclusive upper
};

describe.skipIf(!hasDb)('canonical revenue (integration)', () => {
  let client: PoolClient;

  beforeEach(async () => {
    client = await getPool().connect();
    await client.query('begin');
    await importSeeded(client);
  });

  afterEach(async () => {
    await client.query('rollback');
    client.release();
  });

  afterAll(async () => {
    await closePool();
  });

  test('USD July total is the sum of COLLECTED gross only (unknown/other excluded)', async () => {
    // Collected USD: 1000 + 2500 + 500 + 100 = 4100. Everything else
    // (pending/failed/voided/refunded/unexpected_new_status) is excluded.
    const summary = await getRevenueSummary({ currency: 'USD', ...JULY }, client);
    expect(summary.totalMinor).toBe(4100);
    expect(summary.collectedCount).toBe(4);
  });

  test('currencies are isolated, never summed together', async () => {
    const usd = await getRevenueSummary({ currency: 'USD', ...JULY }, client);
    const eur = await getRevenueSummary({ currency: 'EUR', ...JULY }, client);
    expect(usd.totalMinor).toBe(4100);
    expect(eur.totalMinor).toBe(3000);
    // A cross-currency sum (7100) is never produced by any single call.
    expect(usd.totalMinor).not.toBe(usd.totalMinor + eur.totalMinor);
  });

  test('drift guard: summary total equals sum of breakdown buckets (day AND week)', async () => {
    const summary = await getRevenueSummary({ currency: 'USD', ...JULY }, client);

    for (const interval of ['day', 'week'] as const) {
      const bd = await getRevenueBreakdown(
        { currency: 'USD', ...JULY },
        interval,
        client,
      );
      const bucketSum = bd.buckets.reduce((a, b) => a + b.totalMinor, 0);
      expect(bucketSum).toBe(summary.totalMinor);
      expect(bd.totalMinor).toBe(summary.totalMinor);
      expect(bd.collectedCount).toBe(summary.collectedCount);
    }
  });

  test('daily breakdown has one bucket per distinct collected day', async () => {
    const bd = await getRevenueBreakdown({ currency: 'USD', ...JULY }, 'day', client);
    // Collected USD days: 07-01, 07-02, 07-08, 07-31.
    expect(bd.buckets.length).toBe(4);
  });

  test('revenue uses GROSS, not net-of-fees', async () => {
    // A collected row where gross != net. Revenue must count 1000, not 800.
    const grossRow: CanonicalTransaction = {
      source: 'seeded',
      externalId: 'gross-check-1',
      parentExternalId: null,
      currency: 'GBP',
      amountMinor: 1000,
      grossAmountMinor: 1000,
      feeAmountMinor: 200,
      netAmountMinor: 800,
      rawStatus: 'paid',
      canonicalStatus: 'COLLECTED',
      sourceCreatedAt: new Date('2026-07-10T00:00:00Z'),
      collectedAt: new Date('2026-07-10T00:00:00Z'),
      rawPayload: { note: 'gross-not-net check' },
    };
    await upsertTransactions([grossRow], client);

    const gbp = await getRevenueSummary({ currency: 'GBP', ...JULY }, client);
    expect(gbp.totalMinor).toBe(1000); // gross, not 800 net
    expect(gbp.collectedCount).toBe(1);
  });

  describe('date-range boundaries', () => {
    test('exclusive upper bound: to=2026-07-31T00:00Z excludes the 07-31 23:59 row', async () => {
      const summary = await getRevenueSummary(
        {
          currency: 'USD',
          from: new Date('2026-07-01T00:00:00Z'),
          to: new Date('2026-07-31T00:00:00Z'),
        },
        client,
      );
      expect(summary.totalMinor).toBe(4000); // 4100 - 100 (07-31 row)
      expect(summary.collectedCount).toBe(3);
    });

    test('inclusive lower bound: from=2026-07-02 excludes the 07-01 row', async () => {
      const summary = await getRevenueSummary(
        {
          currency: 'USD',
          from: new Date('2026-07-02T00:00:00Z'),
          to: new Date('2026-08-01T00:00:00Z'),
        },
        client,
      );
      // 2500 (07-02) + 500 (07-08) + 100 (07-31) = 3100; excludes 1000 (07-01).
      expect(summary.totalMinor).toBe(3100);
      expect(summary.collectedCount).toBe(3);
    });
  });
});
