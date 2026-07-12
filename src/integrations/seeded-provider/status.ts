import { mapStatus, type StatusAllowList } from '../status-map.js';
import type { CanonicalStatus } from '../../transactions/canonical-status.js';

/**
 * Seeded-provider status allow-list. This source has its OWN vocabulary,
 * deliberately different from PayPal's, to prove normalization is per-source.
 *
 * Note `unexpected_new_status` is intentionally NOT listed: it stands in for a
 * status that does not exist yet at the time this code is written, and must map
 * to UNKNOWN (and thus be excluded from revenue) with no code change.
 */
export const SEEDED_STATUS_ALLOW_LIST: StatusAllowList = {
  paid: 'COLLECTED',
  succeeded: 'COLLECTED',
  completed: 'COLLECTED',
  pending: 'PENDING',
  failed: 'FAILED',
  voided: 'VOIDED',
  refunded: 'REFUNDED',
};

export function mapSeededStatus(rawStatus: string): CanonicalStatus {
  return mapStatus('seeded', SEEDED_STATUS_ALLOW_LIST, rawStatus);
}
