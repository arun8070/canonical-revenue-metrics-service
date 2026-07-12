import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../src/database/pool.js';
import { importPaypalOrders } from '../src/integrations/paypal/import.js';

// Opt-in: hits the live PayPal sandbox and depends on the known order still
// existing. Off by default so `npm test` stays deterministic. Run with:
//   RUN_PAYPAL_LIVE=1 npm test
const enabled =
  process.env.RUN_PAYPAL_LIVE === '1' && Boolean(process.env.DATABASE_URL);

const REAL_ORDER_ID = '1A876373MX123143G';
const REAL_CAPTURE_ID = '0F3444274G682183F';

describe.skipIf(!enabled)('PayPal live import (integration, opt-in)', () => {
  let client: PoolClient;

  beforeEach(async () => {
    client = await getPool().connect();
    await client.query('begin');
  });

  afterEach(async () => {
    await client.query('rollback');
    client.release();
  });

  afterAll(async () => {
    await closePool();
  });

  test('imports the real capture as exactly one COLLECTED row with gross in minor units', async () => {
    const summary = await importPaypalOrders([REAL_ORDER_ID], client);
    expect(summary.inserted).toBe(1);

    const { rows } = await client.query(
      "select * from transactions where source='paypal' and external_id=$1",
      [REAL_CAPTURE_ID],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.parent_external_id).toBe(REAL_ORDER_ID);
    expect(row.canonical_status).toBe('COLLECTED');
    expect(row.raw_status).toBe('COMPLETED');
    expect(Number(row.gross_amount_minor)).toBe(2500);
    expect(row.currency).toBe('USD');
    expect(row.collected_at).not.toBeNull();
    expect(row.raw_payload).toBeTruthy(); // raw payload stored
  });

  test('re-import is idempotent (no duplicate capture row)', async () => {
    await importPaypalOrders([REAL_ORDER_ID], client);
    const second = await importPaypalOrders([REAL_ORDER_ID], client);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
  });
});
