import { z } from 'zod';
import { SourceSchema } from '../transactions/transaction.js';
import { CanonicalStatusSchema } from '../transactions/canonical-status.js';

/** Query params for GET /api/transactions. All optional; sane bounded limit. */
export const TransactionsQuerySchema = z.object({
  source: SourceSchema.optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO-4217 code')
    .transform((s) => s.toUpperCase())
    .optional(),
  status: CanonicalStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
});

export type TransactionsQuery = z.infer<typeof TransactionsQuerySchema>;
