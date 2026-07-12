import {
  CanonicalTransactionSchema,
  type CanonicalTransaction,
} from '../../transactions/transaction.js';
import { mapPaypalStatus } from './status.js';
import { decimalToMinor } from './money.js';
import type { PaypalCapture } from './types.js';

/**
 * Normalize one PayPal capture into a CanonicalTransaction. The ONLY code that
 * understands PayPal's shape.
 *
 * Idempotency (CLAUDE.md §11): external_id is the CAPTURE id; the order id goes
 * to parent_external_id for traceability.
 *
 * Money (CLAUDE.md §9): revenue uses the GROSS capture amount
 * (seller_receivable_breakdown.gross_amount), never net_amount. When the
 * breakdown is absent, the capture's own amount is the gross figure.
 */
export function mapPaypalCapture(
  capture: PaypalCapture,
  orderId: string,
): CanonicalTransaction {
  const currency = capture.amount.currency_code.toUpperCase();
  const breakdown = capture.seller_receivable_breakdown;

  const grossAmountMinor = decimalToMinor(
    (breakdown?.gross_amount ?? capture.amount).value,
    currency,
  );
  const amountMinor = decimalToMinor(capture.amount.value, currency);
  const feeAmountMinor = breakdown?.paypal_fee
    ? decimalToMinor(breakdown.paypal_fee.value, currency)
    : null;
  const netAmountMinor = breakdown?.net_amount
    ? decimalToMinor(breakdown.net_amount.value, currency)
    : null;

  const canonicalStatus = mapPaypalStatus(capture.status);
  const collectedAt =
    canonicalStatus === 'COLLECTED'
      ? new Date(capture.update_time ?? capture.create_time)
      : null;

  const tx: CanonicalTransaction = {
    source: 'paypal',
    externalId: capture.id,
    parentExternalId: orderId,
    currency,
    amountMinor,
    grossAmountMinor,
    feeAmountMinor,
    netAmountMinor,
    rawStatus: capture.status,
    canonicalStatus,
    sourceCreatedAt: new Date(capture.create_time),
    collectedAt,
    rawPayload: capture,
  };

  return CanonicalTransactionSchema.parse(tx);
}
