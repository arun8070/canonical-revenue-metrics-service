import { Router } from 'express';
import {
  getRevenueSummary,
  getRevenueBreakdown,
} from '../metrics/revenue.js';
import {
  SummaryQuerySchema,
  BreakdownQuerySchema,
} from '../validation/metrics-query.js';
import { asyncHandler } from './async-handler.js';

export const metricsRouter = Router();

/**
 * GET /api/metrics/revenue/summary?from=&to=&currency=
 * Canonical collected-revenue total for one currency over [from, to).
 */
metricsRouter.get(
  '/api/metrics/revenue/summary',
  asyncHandler(async (req, res) => {
    const { currency, from, to } = SummaryQuerySchema.parse(req.query);
    const summary = await getRevenueSummary({ currency, from, to });
    res.status(200).json(summary);
  }),
);

/**
 * GET /api/metrics/revenue/breakdown?from=&to=&currency=&interval=day|week
 * Same canonical total, bucketed. Buckets always sum to the summary total.
 */
metricsRouter.get(
  '/api/metrics/revenue/breakdown',
  asyncHandler(async (req, res) => {
    const { currency, from, to, interval } = BreakdownQuerySchema.parse(
      req.query,
    );
    const breakdown = await getRevenueBreakdown({ currency, from, to }, interval);
    res.status(200).json(breakdown);
  }),
);
