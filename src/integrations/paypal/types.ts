import { z } from 'zod';

/**
 * Partial Zod schemas for the PayPal Orders v2 "get order" response — only the
 * fields we normalize. Unknown fields are ignored (PayPal adds fields over
 * time); we never let unrecognized data change canonical output.
 */
const MoneySchema = z.object({
  currency_code: z.string().regex(/^[A-Za-z]{3}$/),
  value: z.string(),
});

export const PaypalCaptureSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: MoneySchema,
  seller_receivable_breakdown: z
    .object({
      gross_amount: MoneySchema,
      paypal_fee: MoneySchema.optional(),
      net_amount: MoneySchema.optional(),
    })
    .optional(),
  create_time: z.string(),
  update_time: z.string().optional(),
});

export type PaypalCapture = z.infer<typeof PaypalCaptureSchema>;

export const PaypalOrderSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  purchase_units: z
    .array(
      z.object({
        payments: z
          .object({ captures: z.array(PaypalCaptureSchema).optional() })
          .optional(),
      }),
    )
    .default([]),
});

export type PaypalOrder = z.infer<typeof PaypalOrderSchema>;

/** Flatten an order into its captures, each paired with the parent order ID. */
export function extractCaptures(
  order: PaypalOrder,
): { capture: PaypalCapture; orderId: string }[] {
  const out: { capture: PaypalCapture; orderId: string }[] = [];
  for (const unit of order.purchase_units) {
    for (const capture of unit.payments?.captures ?? []) {
      out.push({ capture, orderId: order.id });
    }
  }
  return out;
}
