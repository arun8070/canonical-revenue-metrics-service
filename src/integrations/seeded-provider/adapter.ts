import {
  CanonicalTransactionSchema,
  type CanonicalTransaction,
} from '../../transactions/transaction.js';
import { mapSeededStatus } from './status.js';
import type { SeededRecord } from './dataset.js';

/**
 * Normalize one seeded-provider record into a CanonicalTransaction.
 *
 * This adapter is the ONLY code that understands the seeded shape. It maps the
 * source's own status vocabulary through the seeded allow-list, and derives
 * collected_at only for COLLECTED rows (mirrors the canonical invariant). The
 * seeded source reports a single headline amount, so amount == gross and there
 * is no fee/net breakdown (both null).
 */
export function mapSeededRecord(record: SeededRecord): CanonicalTransaction {
  const canonicalStatus = mapSeededStatus(record.state);
  const collectedAt =
    canonicalStatus === 'COLLECTED'
      ? new Date(record.settled_at ?? record.created_at)
      : null;

  const tx: CanonicalTransaction = {
    source: 'seeded',
    externalId: record.ref,
    parentExternalId: record.parent_ref,
    currency: record.currency,
    amountMinor: record.amount_minor,
    grossAmountMinor: record.amount_minor,
    feeAmountMinor: null,
    netAmountMinor: null,
    rawStatus: record.state,
    canonicalStatus,
    sourceCreatedAt: new Date(record.created_at),
    collectedAt,
    rawPayload: record,
  };

  // Validate at the adapter boundary so a malformed record fails here, loudly,
  // rather than at the DB.
  return CanonicalTransactionSchema.parse(tx);
}
