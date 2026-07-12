import { loadEnv } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { PaypalOrderSchema, type PaypalOrder } from './types.js';

/** Structured error for PayPal API failures (CLAUDE.md §14 — never crash). */
export class PaypalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'PaypalError';
  }
}

function paypalConfig() {
  const env = loadEnv();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new PaypalError('PayPal credentials are not configured');
  }
  return {
    base: env.PAYPAL_API_BASE,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
  };
}

/** Retry transient failures (network errors, 5xx, 429) with exponential backoff. */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 200,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient =
        err instanceof PaypalError
          ? err.status === undefined || err.status >= 500 || err.status === 429
          : true; // network/other errors are transient
      if (!transient || attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt;
      logger.warn(
        { attempt: attempt + 1, delayMs: delay },
        'PayPal request failed; retrying',
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

let tokenCache: { token: string; expiresAt: number } | undefined;

/** Fetch (and cache) an OAuth client-credentials token. Refreshes near expiry. */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const { base, clientId, clientSecret } = paypalConfig();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const data = await withRetry(async () => {
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      // 4xx here means bad credentials — non-transient, fails fast.
      throw new PaypalError(
        `PayPal OAuth token request failed (${res.status})`,
        res.status,
        await res.text(),
      );
    }
    return (await res.json()) as { access_token: string; expires_in: number };
  });

  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  logger.info({ expiresInS: data.expires_in }, 'PayPal access token acquired');
  return data.access_token;
}

/** Clear the cached token (used on a 401, and by tests). */
export function resetTokenCache(): void {
  tokenCache = undefined;
}

/** GET a PayPal Orders v2 order by ID, retrying transient failures. */
export async function fetchPaypalOrder(orderId: string): Promise<PaypalOrder> {
  const { base } = paypalConfig();
  const url = `${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`;

  const json = await withRetry(async () => {
    let token = await getAccessToken();
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    // Token may have gone stale — refresh once and retry inline.
    if (res.status === 401) {
      resetTokenCache();
      token = await getAccessToken();
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    }
    if (!res.ok) {
      throw new PaypalError(
        `Failed to fetch PayPal order ${orderId} (${res.status})`,
        res.status,
        await res.text(),
      );
    }
    return res.json();
  });

  return PaypalOrderSchema.parse(json);
}
