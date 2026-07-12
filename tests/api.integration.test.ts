import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getPool, closePool } from '../src/database/pool.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('HTTP API (integration)', () => {
  let server: Server;
  let baseUrl: string;

  async function cleanupSeeded() {
    await getPool().query("delete from transactions where source = 'seeded'");
  }

  beforeAll(async () => {
    await cleanupSeeded(); // start from a known-clean slate
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await cleanupSeeded();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
  });

  // --- Validation: structured 4xx, never 500 or silent default ------------
  describe('validation returns structured 400', () => {
    test('summary without currency', async () => {
      const r = await fetch(
        `${baseUrl}/api/metrics/revenue/summary?from=2026-07-01&to=2026-08-01`,
      );
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe('validation_error');
    });

    test('summary with invalid date', async () => {
      const r = await fetch(
        `${baseUrl}/api/metrics/revenue/summary?currency=USD&from=not-a-date&to=2026-08-01`,
      );
      expect(r.status).toBe(400);
    });

    test('summary with from >= to', async () => {
      const r = await fetch(
        `${baseUrl}/api/metrics/revenue/summary?currency=USD&from=2026-08-01&to=2026-07-01`,
      );
      expect(r.status).toBe(400);
    });

    test('breakdown with invalid interval', async () => {
      const r = await fetch(
        `${baseUrl}/api/metrics/revenue/breakdown?currency=USD&from=2026-07-01&to=2026-08-01&interval=month`,
      );
      expect(r.status).toBe(400);
    });

    test('transactions with invalid source', async () => {
      const r = await fetch(`${baseUrl}/api/transactions?source=stripe`);
      expect(r.status).toBe(400);
    });
  });

  // --- End-to-end: import -> summary -> breakdown agree -------------------
  describe('import then metrics', () => {
    test('POST /api/import/seeded inserts the dataset', async () => {
      const r = await fetch(`${baseUrl}/api/import/seeded`, { method: 'POST' });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body).toMatchObject({ source: 'seeded', total: 10, inserted: 10 });
    });

    test('summary returns canonical USD total; currency echoed uppercased', async () => {
      const r = await fetch(
        `${baseUrl}/api/metrics/revenue/summary?currency=usd&from=2026-07-01&to=2026-08-01`,
      );
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.currency).toBe('USD');
      expect(body.totalMinor).toBe(4100);
      expect(body.collectedCount).toBe(4);
    });

    test('breakdown buckets sum to the summary total (endpoint drift guard)', async () => {
      const [sumRes, bdRes] = await Promise.all([
        fetch(
          `${baseUrl}/api/metrics/revenue/summary?currency=USD&from=2026-07-01&to=2026-08-01`,
        ),
        fetch(
          `${baseUrl}/api/metrics/revenue/breakdown?currency=USD&from=2026-07-01&to=2026-08-01&interval=day`,
        ),
      ]);
      const summary = await sumRes.json();
      const breakdown = await bdRes.json();
      expect(breakdown.interval).toBe('day');
      const bucketSum = breakdown.buckets.reduce(
        (a: number, b: { totalMinor: number }) => a + b.totalMinor,
        0,
      );
      expect(bucketSum).toBe(summary.totalMinor);
      expect(breakdown.totalMinor).toBe(summary.totalMinor);
    });

    test('GET /api/transactions lists normalized seeded rows', async () => {
      const r = await fetch(`${baseUrl}/api/transactions?source=seeded`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.count).toBe(10);
      expect(body.transactions[0]).toHaveProperty('canonical_status');
      expect(body.transactions[0]).not.toHaveProperty('raw_payload');
    });
  });
});
