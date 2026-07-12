import { mapStatus, type StatusAllowList } from '../status-map.js';
import type { CanonicalStatus } from '../../transactions/canonical-status.js';

/**
 * PayPal capture-status allow-list (CLAUDE.md §10).
 *
 * `external_id` is the capture ID, so `raw_status` is a PayPal *capture*
 * status. Only COMPLETED maps to COLLECTED. Order-level statuses such as
 * CREATED / APPROVED are intentionally absent — they are not capture statuses,
 * so they fall through to UNKNOWN and never count as revenue.
 *
 * Ref: PayPal Orders v2 — capture status values.
 */
export const PAYPAL_STATUS_ALLOW_LIST: StatusAllowList = {
  COMPLETED: 'COLLECTED',
  PENDING: 'PENDING',
  DECLINED: 'FAILED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'REFUNDED',
  VOIDED: 'VOIDED',
};

export function mapPaypalStatus(rawStatus: string): CanonicalStatus {
  return mapStatus('paypal', PAYPAL_STATUS_ALLOW_LIST, rawStatus);
}
