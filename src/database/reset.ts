// Dev/demo convenience: empty the transactions table so imports can be
// replayed from scratch. Keeps the schema and schema_migrations intact (no
// re-migration needed). NOT wired into the HTTP API — reset is a local,
// database-level operation only.
//
// Run with: npm run reset

import '../config/load-dotenv.js';
import { getPool, closePool } from './pool.js';
import { logger } from '../logging/logger.js';

async function reset(): Promise<void> {
  const { rowCount } = await getPool().query('delete from transactions');
  logger.info({ deleted: rowCount ?? 0 }, 'transactions table reset');
}

reset()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error({ err }, 'reset failed');
    await closePool();
    process.exit(1);
  });
