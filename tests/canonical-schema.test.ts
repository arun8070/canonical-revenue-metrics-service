import { describe, expect, test } from 'vitest';
import {
  CanonicalTransactionSchema,
  type CanonicalTransaction,
} from '../src/transactions/transaction.js';

function validCollected(): CanonicalTransaction {
  return {
    source: 'paypal',
    externalId: '0F3444274G682183F',
    parentExternalId: '1A876373MX123143G',
    currency: 'USD',
    amountMinor: 2500,
    grossAmountMinor: 2500,
    feeAmountMinor: 105,
    netAmountMinor: 2395,
    rawStatus: 'COMPLETED',
    canonicalStatus: 'COLLECTED',
    sourceCreatedAt: new Date('2026-07-10T12:00:00Z'),
    collectedAt: new Date('2026-07-10T12:00:05Z'),
    rawPayload: { id: '0F3444274G682183F' },
  };
}

describe('CanonicalTransaction schema', () => {
  test('accepts a valid COLLECTED record', () => {
    expect(CanonicalTransactionSchema.parse(validCollected())).toBeTruthy();
  });

  test('rejects a COLLECTED record with null collectedAt', () => {
    const bad = { ...validCollected(), collectedAt: null };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects a non-COLLECTED record that carries a collectedAt', () => {
    const bad = {
      ...validCollected(),
      canonicalStatus: 'PENDING' as const,
      collectedAt: new Date(),
    };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects gross != net + fee when both are known', () => {
    const bad = { ...validCollected(), grossAmountMinor: 9999 };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects negative minor units', () => {
    const bad = { ...validCollected(), grossAmountMinor: -1 };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects non-integer minor units (no floats)', () => {
    const bad = { ...validCollected(), amountMinor: 25.5 };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('rejects lowercase / non-ISO-4217 currency', () => {
    expect(
      CanonicalTransactionSchema.safeParse({ ...validCollected(), currency: 'usd' })
        .success,
    ).toBe(false);
    expect(
      CanonicalTransactionSchema.safeParse({ ...validCollected(), currency: 'US' })
        .success,
    ).toBe(false);
  });

  test('rejects unknown extra keys (strict schema)', () => {
    const bad = { ...validCollected(), somethingElse: true };
    expect(CanonicalTransactionSchema.safeParse(bad).success).toBe(false);
  });

  test('allows fee/net to be null (e.g. seeded source without fee data)', () => {
    const ok = {
      ...validCollected(),
      source: 'seeded' as const,
      feeAmountMinor: null,
      netAmountMinor: null,
    };
    expect(CanonicalTransactionSchema.safeParse(ok).success).toBe(true);
  });
});
