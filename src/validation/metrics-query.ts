import { z } from 'zod';
import { IntervalSchema } from '../metrics/revenue.js';

/**
 * Zod schemas for metrics query params (CLAUDE.md §12). Invalid input throws a
 * ZodError, which the terminal error handler renders as a structured 400 — no
 * silent defaults, no 500s.
 */

const Currency = z
  .string({ required_error: 'currency is required' })
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO-4217 code')
  .transform((s) => s.toUpperCase());

// Accepts ISO date or datetime strings; rejects unparseable/invalid dates.
const DateParam = z.coerce.date();

const DateRange = z
  .object({
    currency: Currency,
    from: DateParam,
    to: DateParam,
  })
  .refine((v) => v.from < v.to, {
    path: ['to'],
    message: 'from must be strictly before to',
  });

export const SummaryQuerySchema = DateRange;

export const BreakdownQuerySchema = z
  .object({
    currency: Currency,
    from: DateParam,
    to: DateParam,
    interval: IntervalSchema.default('day'),
  })
  .refine((v) => v.from < v.to, {
    path: ['to'],
    message: 'from must be strictly before to',
  });

export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;
export type BreakdownQuery = z.infer<typeof BreakdownQuerySchema>;
