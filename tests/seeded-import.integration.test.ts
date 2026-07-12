import { afterAll, beforeEach, afterEach, describe, expect, test } from 'vitest';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../src/database/pool.js';
import { importSeeded } from '../src/integrations/seeded-provider/import.js';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Each test runs inside a transaction that is rolled back, so nothing is left
 * in the real database. Passing the same client to importSeeded means the
 * second import sees the first import's rows and skips them — exercising
 * re-import idempotency without needing a separate commit.
 */
describe.skipIf(!hasDb)('seeded import (integration)', () => {
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

  test('first import inserts every seeded row, none unknown-collected', async () => {
    const summary = await importSeeded(client);
    expect(summary.total).toBe(10);
    expect(summary.inserted).toBe(10);
    expect(summary.skipped).toBe(0);
    expect(summary.unknown).toBe(1); // seed-0008 unexpected_new_status

    const { rows } = await client.query(
      "select count(*)::int as n from transactions where source = 'seeded'",
    );
    expect(rows[0].n).toBe(10);
  });

  test('re-import is idempotent: no new rows on the second run', async () => {
    const first = await importSeeded(client);
    const second = await importSeeded(client);

    expect(first.inserted).toBe(10);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(10);

    const { rows } = await client.query(
      "select count(*)::int as n from transactions where source = 'seeded'",
    );
    expect(rows[0].n).toBe(10);
  });

  test('unexpected_new_status is stored as UNKNOWN', async () => {
    await importSeeded(client);
    const { rows } = await client.query(
      "select canonical_status, collected_at from transactions where source='seeded' and external_id='seed-0008'",
    );
    expect(rows[0].canonical_status).toBe('UNKNOWN');
    expect(rows[0].collected_at).toBeNull();
  });

  test('collected rows carry collected_at; non-collected do not', async () => {
    await importSeeded(client);
    const { rows } = await client.query(
      "select external_id, canonical_status, collected_at from transactions where source='seeded' order by external_id",
    );
    for (const r of rows) {
      if (r.canonical_status === 'COLLECTED') {
        expect(r.collected_at).not.toBeNull();
      } else {
        expect(r.collected_at).toBeNull();
      }
    }
  });
});
