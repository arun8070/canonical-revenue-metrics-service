import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getPool, closePool } from '../src/database/pool.js';
import { importSeeded } from '../src/integrations/seeded-provider/import.js';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Concurrent duplicate imports must be safe via the DB unique constraint, not
 * application locking (CLAUDE.md §11). This test commits (separate connections
 * genuinely race), so it cleans up before and after.
 */
describe.skipIf(!hasDb)('concurrent duplicate import (integration)', () => {
  async function cleanupSeeded() {
    await getPool().query("delete from transactions where source = 'seeded'");
  }

  beforeAll(cleanupSeeded);

  afterAll(async () => {
    await cleanupSeeded();
    await closePool();
  });

  test('two parallel imports of the same data produce no duplicates and no crash', async () => {
    // Each importSeeded() draws its own connection from the pool -> real race.
    const [a, b] = await Promise.all([importSeeded(), importSeeded()]);

    // Exactly the 10 distinct rows exist, regardless of who won each conflict.
    const { rows } = await getPool().query(
      "select count(*)::int as n from transactions where source = 'seeded'",
    );
    expect(rows[0].n).toBe(10);

    // Between the two runs, exactly 10 inserts happened in total (the rest
    // were skipped by ON CONFLICT DO NOTHING).
    expect(a.inserted + b.inserted).toBe(10);
    expect(a.total).toBe(10);
    expect(b.total).toBe(10);
  });
});
