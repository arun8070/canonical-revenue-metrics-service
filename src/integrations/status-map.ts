import { logger } from '../logging/logger.js';
import type { CanonicalStatus } from '../transactions/canonical-status.js';

/**
 * A source's status allow-list: an explicit mapping from that source's raw
 * status strings to canonical statuses. Anything not present maps to UNKNOWN.
 */
export type StatusAllowList = Readonly<Record<string, CanonicalStatus>>;

/**
 * Map a raw source status through an allow-list.
 *
 * This is the ONLY place a raw status becomes canonical. Matching is exact
 * (no case folding, no trimming beyond what the caller passes): if a source
 * ever changes the spelling or case of a status, that is a *new, unrecognized*
 * status and must fall through to UNKNOWN — the safe direction, since UNKNOWN
 * never counts as revenue (CLAUDE.md §10). Unknown fall-through is logged, not
 * thrown: it is a normal case, not an error (CLAUDE.md §14).
 */
export function mapStatus(
  source: string,
  allowList: StatusAllowList,
  rawStatus: string,
): CanonicalStatus {
  const mapped = Object.prototype.hasOwnProperty.call(allowList, rawStatus)
    ? allowList[rawStatus]
    : undefined;

  if (mapped === undefined) {
    logger.info(
      { source, rawStatus, canonicalStatus: 'UNKNOWN' },
      'raw status not in allow-list; mapped to UNKNOWN',
    );
    return 'UNKNOWN';
  }
  return mapped;
}
