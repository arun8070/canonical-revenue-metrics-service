import { pino } from 'pino';
import { loadEnv } from '../config/env.js';

/**
 * Single shared Pino logger. Structured JSON output; level from LOG_LEVEL.
 * Per CLAUDE.md §15: never log secrets or full raw payloads at info level.
 */
export const logger = pino({
  level: loadEnv().LOG_LEVEL,
  base: { service: 'canonical-revenue-metrics' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
