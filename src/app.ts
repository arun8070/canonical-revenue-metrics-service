import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logging/logger.js';
import { healthRouter } from './routes/health.js';
import { importRouter } from './routes/import.js';
import { metricsRouter } from './routes/metrics.js';
import { transactionsRouter } from './routes/transactions.js';
import { errorHandler } from './routes/error-handler.js';

/**
 * Build the Express application. Kept free of `listen()` so tests can import
 * the app and drive it in-process without binding a port.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);
  app.use(importRouter);
  app.use(metricsRouter);
  app.use(transactionsRouter);

  // Terminal error middleware — must be registered last.
  app.use(errorHandler);

  return app;
}
