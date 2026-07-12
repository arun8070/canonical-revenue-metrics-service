import './config/load-dotenv.js';
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
