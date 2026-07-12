import { logger } from '../../logging/logger.js';
import { upsertTransactions, type Queryable } from '../../transactions/repository.js';
import type { ImportSummary } from '../import-result.js';
import { mapSeededRecord } from './adapter.js';
import { SEEDED_DATASET } from './dataset.js';

/**
 * Import the deterministic seeded dataset. Pure-ish: same input always yields
 * the same canonical rows, and the upsert makes re-runs idempotent.
 */
export async function importSeeded(db?: Queryable): Promise<ImportSummary> {
  logger.info({ source: 'seeded', count: SEEDED_DATASET.length }, 'seeded import start');

  const txs = SEEDED_DATASET.map(mapSeededRecord);
  const unknown = txs.filter((t) => t.canonicalStatus === 'UNKNOWN').length;

  const { inserted, skipped } = await upsertTransactions(txs, db);

  const summary: ImportSummary = {
    source: 'seeded',
    total: txs.length,
    inserted,
    skipped,
    unknown,
  };
  logger.info(summary, 'seeded import complete');
  return summary;
}
