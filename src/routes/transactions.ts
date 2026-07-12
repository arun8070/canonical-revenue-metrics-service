import { Router } from 'express';
import { listTransactions } from '../transactions/list.js';
import { TransactionsQuerySchema } from '../validation/transactions-query.js';
import { asyncHandler } from './async-handler.js';

export const transactionsRouter = Router();

/**
 * GET /api/transactions?source=&currency=&status=&limit=
 * Basic normalized listing across all sources (debug/demo).
 */
transactionsRouter.get(
  '/api/transactions',
  asyncHandler(async (req, res) => {
    const q = TransactionsQuerySchema.parse(req.query);
    const rows = await listTransactions({
      source: q.source,
      currency: q.currency,
      canonicalStatus: q.status,
      limit: q.limit,
    });
    res.status(200).json({ count: rows.length, transactions: rows });
  }),
);
