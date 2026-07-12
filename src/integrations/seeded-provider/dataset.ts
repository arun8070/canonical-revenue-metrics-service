/**
 * Deterministic seeded-provider dataset.
 *
 * The shape is deliberately different from PayPal's (flat snake_case fields,
 * `ref`/`parent_ref` instead of capture/order IDs, `state` instead of nested
 * capture status, amount already in minor units) to prove that only the
 * adapter knows source-specific shapes. Its status vocabulary is also its own
 * (CLAUDE.md §10). This dataset never changes, so imports are reproducible.
 */
export interface SeededRecord {
  ref: string; // -> external_id
  parent_ref: string | null; // -> parent_external_id
  state: string; // raw status (seeded vocabulary)
  amount_minor: number; // already in integer minor units
  currency: string; // ISO-4217
  created_at: string; // ISO 8601 -> source_created_at
  settled_at: string | null; // ISO 8601 -> collected_at (collected rows only)
}

export const SEEDED_DATASET: readonly SeededRecord[] = [
  // --- Collected USD, spread across days/weeks of July 2026 ---------------
  {
    ref: 'seed-0001',
    parent_ref: 'seed-order-0001',
    state: 'paid',
    amount_minor: 1000,
    currency: 'USD',
    created_at: '2026-07-01T09:00:00Z',
    settled_at: '2026-07-01T09:00:03Z',
  },
  {
    ref: 'seed-0002',
    parent_ref: 'seed-order-0002',
    state: 'succeeded',
    amount_minor: 2500,
    currency: 'USD',
    created_at: '2026-07-02T14:30:00Z',
    settled_at: '2026-07-02T14:30:02Z',
  },
  {
    ref: 'seed-0003',
    parent_ref: null,
    state: 'completed',
    amount_minor: 500,
    currency: 'USD',
    created_at: '2026-07-08T11:15:00Z',
    settled_at: '2026-07-08T11:15:01Z',
  },
  {
    ref: 'seed-0010',
    parent_ref: null,
    state: 'paid',
    amount_minor: 100,
    currency: 'USD',
    created_at: '2026-07-31T23:59:00Z',
    settled_at: '2026-07-31T23:59:01Z',
  },
  // --- Collected EUR (proves currency isolation) --------------------------
  {
    ref: 'seed-0009',
    parent_ref: 'seed-order-0009',
    state: 'paid',
    amount_minor: 3000,
    currency: 'EUR',
    created_at: '2026-07-02T08:00:00Z',
    settled_at: '2026-07-02T08:00:04Z',
  },
  // --- Not collected (each a different canonical status) ------------------
  {
    ref: 'seed-0004',
    parent_ref: null,
    state: 'pending',
    amount_minor: 9999,
    currency: 'USD',
    created_at: '2026-07-03T10:00:00Z',
    settled_at: null,
  },
  {
    ref: 'seed-0005',
    parent_ref: null,
    state: 'failed',
    amount_minor: 4200,
    currency: 'USD',
    created_at: '2026-07-03T10:05:00Z',
    settled_at: null,
  },
  {
    ref: 'seed-0006',
    parent_ref: null,
    state: 'voided',
    amount_minor: 700,
    currency: 'USD',
    created_at: '2026-07-04T10:00:00Z',
    settled_at: null,
  },
  {
    ref: 'seed-0007',
    parent_ref: null,
    state: 'refunded',
    amount_minor: 1500,
    currency: 'USD',
    created_at: '2026-07-05T10:00:00Z',
    settled_at: null,
  },
  // --- A status that does not exist yet in our allow-list -> UNKNOWN ------
  {
    ref: 'seed-0008',
    parent_ref: null,
    state: 'unexpected_new_status',
    amount_minor: 8888,
    currency: 'USD',
    created_at: '2026-07-06T10:00:00Z',
    settled_at: null,
  },
];
