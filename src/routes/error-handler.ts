import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logging/logger.js';
import { PaypalError } from '../integrations/paypal/client.js';

/**
 * Terminal error middleware. Validation errors (ZodError) surface as a
 * structured 400; upstream PayPal failures as a 502; anything else is logged
 * with context and returned as a generic 500 — never a raw stack trace to the
 * client (CLAUDE.md §14).
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Request failed validation',
      issues: err.issues,
    });
    return;
  }

  if (err instanceof PaypalError) {
    logger.error(
      { err: err.message, status: err.status },
      'PayPal upstream error',
    );
    res.status(502).json({
      error: 'paypal_error',
      message: 'Failed to communicate with PayPal',
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
  });
};
