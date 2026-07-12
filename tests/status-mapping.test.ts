import { describe, expect, test } from 'vitest';
import { mapPaypalStatus } from '../src/integrations/paypal/status.js';
import { mapSeededStatus } from '../src/integrations/seeded-provider/status.js';
import { mapStatus } from '../src/integrations/status-map.js';
import { isCollected } from '../src/transactions/canonical-status.js';

describe('PayPal status allow-list', () => {
  test('only COMPLETED maps to COLLECTED', () => {
    expect(mapPaypalStatus('COMPLETED')).toBe('COLLECTED');
    expect(isCollected(mapPaypalStatus('COMPLETED'))).toBe(true);
  });

  test('order-level CREATED / APPROVED are not collected (fall through to UNKNOWN)', () => {
    expect(mapPaypalStatus('CREATED')).toBe('UNKNOWN');
    expect(mapPaypalStatus('APPROVED')).toBe('UNKNOWN');
    expect(isCollected(mapPaypalStatus('CREATED'))).toBe(false);
    expect(isCollected(mapPaypalStatus('APPROVED'))).toBe(false);
  });

  test('other capture statuses map explicitly and are not collected', () => {
    expect(mapPaypalStatus('PENDING')).toBe('PENDING');
    expect(mapPaypalStatus('DECLINED')).toBe('FAILED');
    expect(mapPaypalStatus('REFUNDED')).toBe('REFUNDED');
    expect(mapPaypalStatus('PARTIALLY_REFUNDED')).toBe('REFUNDED');
    expect(mapPaypalStatus('VOIDED')).toBe('VOIDED');
  });

  test('unrecognized / novel status maps to UNKNOWN', () => {
    expect(mapPaypalStatus('SOME_FUTURE_STATUS')).toBe('UNKNOWN');
    expect(mapPaypalStatus('')).toBe('UNKNOWN');
  });

  test('matching is case-sensitive; wrong case is UNKNOWN (safe direction)', () => {
    expect(mapPaypalStatus('completed')).toBe('UNKNOWN');
  });
});

describe('Seeded provider status allow-list', () => {
  test('paid / succeeded / completed all map to COLLECTED', () => {
    expect(mapSeededStatus('paid')).toBe('COLLECTED');
    expect(mapSeededStatus('succeeded')).toBe('COLLECTED');
    expect(mapSeededStatus('completed')).toBe('COLLECTED');
  });

  test('pending / failed / voided / refunded are not collected', () => {
    expect(mapSeededStatus('pending')).toBe('PENDING');
    expect(mapSeededStatus('failed')).toBe('FAILED');
    expect(mapSeededStatus('voided')).toBe('VOIDED');
    expect(mapSeededStatus('refunded')).toBe('REFUNDED');
    for (const s of ['pending', 'failed', 'voided', 'refunded']) {
      expect(isCollected(mapSeededStatus(s))).toBe(false);
    }
  });

  test('unexpected_new_status maps to UNKNOWN and is excluded from revenue', () => {
    expect(mapSeededStatus('unexpected_new_status')).toBe('UNKNOWN');
    expect(isCollected(mapSeededStatus('unexpected_new_status'))).toBe(false);
  });

  test('the two sources have independent vocabularies', () => {
    // PayPal's COMPLETED is not a seeded status; seeded's paid is not PayPal's.
    expect(mapSeededStatus('COMPLETED')).toBe('UNKNOWN');
    expect(mapPaypalStatus('paid')).toBe('UNKNOWN');
  });
});

describe('a new source with no status policy fails safely', () => {
  test('an empty allow-list maps every status to UNKNOWN (never COLLECTED)', () => {
    // A brand-new source added without defining an allow-list must never
    // default to counting as collected (CLAUDE.md §10).
    for (const raw of ['paid', 'COMPLETED', 'anything', 'succeeded', '']) {
      const mapped = mapStatus('brand-new-source', {}, raw);
      expect(mapped).toBe('UNKNOWN');
      expect(isCollected(mapped)).toBe(false);
    }
  });
});
