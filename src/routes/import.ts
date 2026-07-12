import { Router } from 'express';
import { importSeeded } from '../integrations/seeded-provider/import.js';
import { importPaypalOrders } from '../integrations/paypal/import.js';
import { PaypalImportBodySchema } from '../validation/import-body.js';
import { asyncHandler } from './async-handler.js';

export const importRouter = Router();

/**
 * POST /api/import/seeded — ingest the deterministic seeded dataset.
 * Idempotent: safe to call repeatedly.
 */
importRouter.post(
  '/api/import/seeded',
  asyncHandler(async (_req, res) => {
    const summary = await importSeeded();
    res.status(200).json(summary);
  }),
);

/**
 * POST /api/import/paypal — import one or more PayPal orders by ID.
 * Body: { "orderIds": ["..."] }. Idempotent per (paypal, capture id).
 */
importRouter.post(
  '/api/import/paypal',
  asyncHandler(async (req, res) => {
    const { orderIds } = PaypalImportBodySchema.parse(req.body);
    const summary = await importPaypalOrders(orderIds);
    res.status(200).json(summary);
  }),
);
