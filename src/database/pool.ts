import { Pool, type PoolConfig } from 'pg';
import { loadEnv } from '../config/env.js';

let pool: Pool | undefined;

/**
 * Parse a `postgresql://user:pass@host:port/db?params` string into discrete
 * connection fields.
 *
 * We deliberately do NOT rely on `new URL()` / pg's built-in connection-string
 * parser: Supabase-generated passwords routinely contain characters (`/`, `^`,
 * etc.) that are illegal in URL userinfo and make those parsers throw
 * "Invalid URL". We locate field boundaries structurally instead — the last
 * `@` separates credentials from host, the first `:` separates user from
 * password — so a password may contain any character except an unescaped `@`.
 * Query params (e.g. `?sslmode=require`, `?pgbouncer=true`) are ignored; TLS is
 * configured explicitly below.
 */
export function parseConnectionString(raw: string): {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
} {
  const schemeSplit = raw.indexOf('://');
  if (schemeSplit === -1) {
    throw new Error('DATABASE_URL is missing a scheme (expected postgresql://).');
  }
  let rest = raw.slice(schemeSplit + 3);

  const queryIdx = rest.indexOf('?');
  if (queryIdx !== -1) rest = rest.slice(0, queryIdx);

  const at = rest.lastIndexOf('@');
  if (at === -1) {
    throw new Error('DATABASE_URL is missing credentials (no "@" found).');
  }
  const userinfo = rest.slice(0, at);
  const hostPath = rest.slice(at + 1);

  const colon = userinfo.indexOf(':');
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const password = colon === -1 ? '' : userinfo.slice(colon + 1);

  const slash = hostPath.indexOf('/');
  const hostPort = slash === -1 ? hostPath : hostPath.slice(0, slash);
  const database = slash === -1 ? 'postgres' : hostPath.slice(slash + 1);

  const hpColon = hostPort.lastIndexOf(':');
  const host = hpColon === -1 ? hostPort : hostPort.slice(0, hpColon);
  const port = hpColon === -1 ? 5432 : Number(hostPort.slice(hpColon + 1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DATABASE_URL has an invalid port.');
  }

  return { user, password, host, port, database };
}

/**
 * Lazily-created shared connection pool.
 *
 * DATABASE_URL is optional at boot (see config/env.ts) but required to reach
 * the database, so we assert it here — the edge that actually needs it.
 *
 * Supabase requires TLS. We enable SSL but do not verify the CA chain
 * (`rejectUnauthorized: false`): Supabase terminates TLS with a certificate
 * that node-postgres won't validate against the system trust store by
 * default, and pinning the CA is out of scope for this assignment. The
 * connection is still encrypted in transit.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const { DATABASE_URL } = loadEnv();
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. It is required for any database operation.',
    );
  }

  const { user, password, host, port, database } =
    parseConnectionString(DATABASE_URL);
  const config: PoolConfig = {
    user,
    password,
    host,
    port,
    database,
    ssl: { rejectUnauthorized: false },
  };
  pool = new Pool(config);
  return pool;
}

/** Close the pool (used in tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
