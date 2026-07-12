import { Router } from 'express';
import { importSeeded } from '../integrations/seeded-provider/import.js';
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
