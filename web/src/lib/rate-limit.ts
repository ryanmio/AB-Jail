/**
 * In-memory sliding-window rate limiter.
 *
 * Limits are per-key (typically an IP address or API key).
 * On serverless platforms each cold-start gets its own Map, so this is
 * best-effort. For stronger guarantees, swap the store for Upstash Redis.
 */

interface SlidingWindow {
  timestamps: number[];
}

const stores = new Map<string, Map<string, SlidingWindow>>();

function getStore(namespace: string): Map<string, SlidingWindow> {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  return store;
}

const MAX_KEYS_PER_STORE = 10_000;

function evictOldEntries(store: Map<string, SlidingWindow>, windowMs: number) {
  if (store.size <= MAX_KEYS_PER_STORE) return;
  const cutoff = Date.now() - windowMs;
  for (const [key, window] of store) {
    if (window.timestamps.length === 0 || window.timestamps[window.timestamps.length - 1] < cutoff) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Check and consume one request against a rate limit.
 *
 * @param namespace  Logical bucket (e.g. "api_auth", "key_request")
 * @param key        Identifier to limit (e.g. IP address, API key)
 * @param maxRequests Maximum requests allowed within the window
 * @param windowMs   Sliding window duration in milliseconds
 */
export function rateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const store = getStore(namespace);
  evictOldEntries(store, windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let window = store.get(key);
  if (!window) {
    window = { timestamps: [] };
    store.set(key, window);
  }

  window.timestamps = window.timestamps.filter((t) => t > cutoff);

  if (window.timestamps.length >= maxRequests) {
    const oldestInWindow = window.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  window.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - window.timestamps.length,
    resetMs: windowMs,
  };
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
