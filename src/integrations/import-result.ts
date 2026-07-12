/** Summary returned by every import path (CLAUDE.md §15 logging counts). */
export interface ImportSummary {
  source: string;
  total: number;
  inserted: number;
  skipped: number;
  /** Count of records whose raw status fell through to UNKNOWN. */
  unknown: number;
}
