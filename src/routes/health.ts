import { Router } from 'express';

export const healthRouter = Router();

/**
 * GET /health — liveness probe. Cheap, no external dependencies.
 * (A DB-connectivity variant is a Phase 9 "nice to have".)
 */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime_s: Math.round(process.uptime()) });
});
