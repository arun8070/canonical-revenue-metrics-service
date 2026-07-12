import { z } from 'zod';

/**
 * The closed set of canonical statuses (CLAUDE.md §10). This set never grows
 * to accommodate a new *source* status — unrecognized raw statuses map to
 * UNKNOWN. Only COLLECTED counts as revenue.
 */
export const CANONICAL_STATUSES = [
  'COLLECTED',
  'PENDING',
  'FAILED',
  'REFUNDED',
  'VOIDED',
  'UNKNOWN',
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const CanonicalStatusSchema = z.enum(CANONICAL_STATUSES);

/**
 * The single definition of "counts as collected revenue". Everything reads
 * this — no endpoint or query re-decides what COLLECTED means.
 */
export function isCollected(status: CanonicalStatus): boolean {
  return status === 'COLLECTED';
}
