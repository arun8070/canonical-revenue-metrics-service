import { z } from 'zod';

/** POST /api/import/paypal body: one or more PayPal order IDs to import. */
export const PaypalImportBodySchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1, 'orderIds must be non-empty'),
});

export type PaypalImportBody = z.infer<typeof PaypalImportBodySchema>;
