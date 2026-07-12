import { z } from 'zod';
import { CanonicalStatusSchema } from './canonical-status.js';

/** Known sources. Adding a source here is deliberate and reviewable. */
export const SOURCES = ['paypal', 'seeded'] as const;
export type Source = (typeof SOURCES)[number];
export const SourceSchema = z.enum(SOURCES);

/** Money in integer minor units (CLAUDE.md §9): non-negative, safe integer. */
const MinorUnits = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

/** ISO-4217 alpha code, uppercase — mirrors the DB currency check. */
const CurrencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, 'currency must be an ISO-4217 uppercase alpha code');

/**
 * A normalized transaction, as produced by a source adapter and inserted into
 * the canonical `transactions` table. This is the boundary type: once data is
 * a CanonicalTransaction, no downstream code cares which source it came from
 * except via `source`.
 *
 * The refinements below intentionally duplicate the DB CHECK constraints so a
 * bad record is rejected in the app layer too (defense in depth).
 */
export const CanonicalTransactionSchema = z
  .object({
    source: SourceSchema,
    externalId: z.string().min(1),
    parentExternalId: z.string().min(1).nullable(),
    currency: CurrencyCode,
    amountMinor: MinorUnits,
    grossAmountMinor: MinorUnits,
    feeAmountMinor: MinorUnits.nullable(),
    netAmountMinor: MinorUnits.nullable(),
    rawStatus: z.string().min(1),
    canonicalStatus: CanonicalStatusSchema,
    sourceCreatedAt: z.date(),
    collectedAt: z.date().nullable(),
    rawPayload: z.unknown(),
  })
  .strict()
  .superRefine((tx, ctx) => {
    // collected_at present iff COLLECTED (mirrors DB consistency constraint).
    const collected = tx.canonicalStatus === 'COLLECTED';
    if (collected && tx.collectedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectedAt'],
        message: 'collectedAt is required when canonicalStatus is COLLECTED',
      });
    }
    if (!collected && tx.collectedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectedAt'],
        message: 'collectedAt must be null unless canonicalStatus is COLLECTED',
      });
    }
    // gross = net + fee when both are known (guards net-stored-as-gross).
    if (
      tx.feeAmountMinor !== null &&
      tx.netAmountMinor !== null &&
      tx.grossAmountMinor !== tx.netAmountMinor + tx.feeAmountMinor
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grossAmountMinor'],
        message: 'grossAmountMinor must equal netAmountMinor + feeAmountMinor',
      });
    }
  });

export type CanonicalTransaction = z.infer<typeof CanonicalTransactionSchema>;
