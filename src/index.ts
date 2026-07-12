// Load .env if present (no-op when absent, e.g. in production where env vars
// are injected by the platform). process.loadEnvFile is available on Node 20.12+.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './logging/logger.js';

const env = loadEnv();
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'canonical-revenue-metrics service started');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
