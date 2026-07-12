import { logger } from '../../logging/logger.js';
import {
  upsertTransactions,
  type Queryable,
} from '../../transactions/repository.js';
import type { CanonicalTransaction } from '../../transactions/transaction.js';
import type { ImportSummary } from '../import-result.js';
import { fetchPaypalOrder } from './client.js';
import { extractCaptures } from './types.js';
import { mapPaypalCapture } from './adapter.js';

/**
 * Import PayPal orders by ID: fetch each order, normalize every capture into a
 * canonical transaction (capture id = external_id, order id = parent), and
 * upsert idempotently.
 */
export async function importPaypalOrders(
  orderIds: string[],
  db?: Queryable,
): Promise<ImportSummary> {
  logger.info({ source: 'paypal', orderCount: orderIds.length }, 'paypal import start');

  const txs: CanonicalTransaction[] = [];
  for (const orderId of orderIds) {
    const order = await fetchPaypalOrder(orderId);
    for (const { capture, orderId: oid } of extractCaptures(order)) {
      txs.push(mapPaypalCapture(capture, oid));
    }
  }

  const unknown = txs.filter((t) => t.canonicalStatus === 'UNKNOWN').length;
  const { inserted, skipped } = await upsertTransactions(txs, db);

  const summary: ImportSummary = {
    source: 'paypal',
    total: txs.length,
    inserted,
    skipped,
    unknown,
  };
  logger.info(summary, 'paypal import complete');
  return summary;
}
