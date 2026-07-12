import { z } from 'zod';

/**
 * Central, Zod-validated view of process.env.
 *
 * Only PORT and LOG_LEVEL are required to boot (health endpoint + logging).
 * DATABASE_URL and the PayPal credentials are optional *at boot* so the
 * service can start during early scaffolding before those secrets exist;
 * the code paths that actually need them (Phase 1+ / Phase 3+) must assert
 * their presence at their own edge rather than crashing startup here.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  DATABASE_URL: z.string().url().optional(),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_API_BASE: z
    .string()
    .url()
    .default('https://api-m.sandbox.paypal.com'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parse and cache environment configuration. Throws on invalid config. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`,
    );
  }
  cached = parsed.data;
  return cached;
}
