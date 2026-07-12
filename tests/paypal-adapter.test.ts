import { describe, expect, test } from 'vitest';
import { mapPaypalCapture } from '../src/integrations/paypal/adapter.js';
import {
  PaypalOrderSchema,
  extractCaptures,
} from '../src/integrations/paypal/types.js';
import { decimalToMinor } from '../src/integrations/paypal/money.js';

// Based on the real sandbox capture from TASKS.md Phase 3:
// Order 1A876373MX123143G, Capture 0F3444274G682183F, COMPLETED, gross USD 25.00.
// The fee/net breakdown values are illustrative (exercise gross-vs-net), while
// the IDs, status, and gross amount are the real verified facts.
const REAL_ORDER = {
  id: '1A876373MX123143G',
  status: 'COMPLETED',
  purchase_units: [
    {
      payments: {
        captures: [
          {
            id: '0F3444274G682183F',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '25.00' },
            seller_receivable_breakdown: {
              gross_amount: { currency_code: 'USD', value: '25.00' },
              paypal_fee: { currency_code: 'USD', value: '1.03' },
              net_amount: { currency_code: 'USD', value: '23.97' },
            },
            create_time: '2026-07-10T12:00:00Z',
            update_time: '2026-07-10T12:00:05Z',
          },
        ],
      },
    },
  ],
};

describe('PayPal capture -> canonical adapter', () => {
  test('normalizes the real COMPLETED capture correctly', () => {
    const order = PaypalOrderSchema.parse(REAL_ORDER);
    const [{ capture, orderId }] = extractCaptures(order);
    const tx = mapPaypalCapture(capture, orderId);

    expect(tx.source).toBe('paypal');
    // external_id is the CAPTURE id; order id is parent (CLAUDE.md §11).
    expect(tx.externalId).toBe('0F3444274G682183F');
    expect(tx.parentExternalId).toBe('1A876373MX123143G');
    expect(tx.currency).toBe('USD');
    expect(tx.canonicalStatus).toBe('COLLECTED');
    expect(tx.collectedAt).not.toBeNull();
    // GROSS is used for revenue, not net.
    expect(tx.grossAmountMinor).toBe(2500);
    expect(tx.feeAmountMinor).toBe(103);
    expect(tx.netAmountMinor).toBe(2397);
  });

  test('a non-COMPLETED capture status maps to a non-collected canonical status', () => {
    const pending = {
      ...REAL_ORDER,
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-PENDING-1',
                status: 'PENDING',
                amount: { currency_code: 'USD', value: '10.00' },
                create_time: '2026-07-10T12:00:00Z',
              },
            ],
          },
        },
      ],
    };
    const order = PaypalOrderSchema.parse(pending);
    const [{ capture, orderId }] = extractCaptures(order);
    const tx = mapPaypalCapture(capture, orderId);
    expect(tx.canonicalStatus).toBe('PENDING');
    expect(tx.collectedAt).toBeNull();
  });

  test('falls back to capture amount as gross when breakdown is absent', () => {
    const order = PaypalOrderSchema.parse({
      id: 'ORDER-X',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-X',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '9.99' },
                create_time: '2026-07-10T12:00:00Z',
              },
            ],
          },
        },
      ],
    });
    const [{ capture, orderId }] = extractCaptures(order);
    const tx = mapPaypalCapture(capture, orderId);
    expect(tx.grossAmountMinor).toBe(999);
    expect(tx.feeAmountMinor).toBeNull();
    expect(tx.netAmountMinor).toBeNull();
  });

  test('extractCaptures flattens multiple captures across purchase units', () => {
    const order = PaypalOrderSchema.parse({
      id: 'ORDER-MULTI',
      purchase_units: [
        {
          payments: {
            captures: [
              { id: 'C1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '1.00' }, create_time: '2026-07-10T12:00:00Z' },
              { id: 'C2', status: 'PENDING', amount: { currency_code: 'USD', value: '2.00' }, create_time: '2026-07-10T12:00:00Z' },
            ],
          },
        },
      ],
    });
    expect(extractCaptures(order)).toHaveLength(2);
  });
});

describe('decimalToMinor (no floating point)', () => {
  test('converts standard 2-decimal currencies', () => {
    expect(decimalToMinor('25.00', 'USD')).toBe(2500);
    expect(decimalToMinor('0.99', 'USD')).toBe(99);
    expect(decimalToMinor('1000', 'USD')).toBe(100000);
    expect(decimalToMinor('1.03', 'EUR')).toBe(103);
  });

  test('handles zero-decimal currencies (JPY)', () => {
    expect(decimalToMinor('500', 'JPY')).toBe(500);
  });

  test('rejects amounts with more decimals than the currency permits', () => {
    expect(() => decimalToMinor('25.001', 'USD')).toThrow();
    expect(() => decimalToMinor('5.5', 'JPY')).toThrow();
  });

  test('rejects non-numeric input', () => {
    expect(() => decimalToMinor('abc', 'USD')).toThrow();
  });

  test('avoids float rounding error (0.1 + 0.2 style)', () => {
    // 0.29 must be exactly 29, not 28 or 30.
    expect(decimalToMinor('0.29', 'USD')).toBe(29);
    expect(decimalToMinor('19.99', 'USD')).toBe(1999);
  });
});
