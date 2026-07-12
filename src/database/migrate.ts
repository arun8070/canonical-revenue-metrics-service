// Lightweight forward-only SQL migration runner (CLAUDE.md §8: plain SQL, no
// ORM framework). Applies every migrations/*.sql not yet recorded in
// schema_migrations, each inside its own transaction, in filename order.
//
// Run with: npm run migrate

import '../config/load-dotenv.js';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, closePool } from './pool.js';
import { logger } from '../logging/logger.js';

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      id         text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await pool.query<{ id: string }>(
    'select id from schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.id));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      logger.debug({ file }, 'migration already applied, skipping');
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (id) values ($1)', [
        file,
      ]);
      await client.query('commit');
      count += 1;
      logger.info({ file }, 'migration applied');
    } catch (err) {
      await client.query('rollback');
      logger.error({ file, err }, 'migration failed; rolled back');
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info({ applied: count, total: files.length }, 'migrations complete');
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error({ err }, 'migration run failed');
      await closePool();
      process.exit(1);
    });
}
