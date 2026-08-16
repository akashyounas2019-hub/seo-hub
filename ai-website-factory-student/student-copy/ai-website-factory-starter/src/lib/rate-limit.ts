/**
 * Tiny in-process token bucket for login throttling.
 *
 * This is intentionally NOT distributed (no Redis) — we run a single Node
 * process per host. If we ever scale horizontally, this should be backed by
 * `login_attempts` rows in Postgres with a unique index on `(key, window)`.
 *
 * Default policy: max 8 failed attempts per 5-minute window keyed by IP+email,
 * and 30 failures per 5-minute window keyed by IP alone (so an attacker can't
 * iterate emails from one IP either).
 *
 * Successful logins clear the counter for that key so a legitimate user
 * recovering from a typo isn't penalized.
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PER_EMAIL_IP = 8;
const MAX_PER_IP = 30;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function bump(key: string, max: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  // Allow exactly `max` events per window: blocked when the count crosses the
  // threshold (i.e. `>= max` means the (max+1)th would-be event is rejected).
  // Using `>` here would silently allow max+1 events, off-by-one.
  if (b.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

function clear(key: string) {
  buckets.delete(key);
}

/**
 * Check whether a login attempt should be allowed BEFORE running scrypt.
 * Call with the (email, ip) pair. Returns `{ ok: true }` if allowed,
 * `{ ok: false, retryAfterSec }` if blocked.
 *
 * On a failed login, call `recordLoginFailure(email, ip)`.
 * On a successful login, call `recordLoginSuccess(email, ip)`.
 */
export function checkLoginRate(email: string, ip: string | null): { ok: boolean; retryAfterSec: number; reason?: string } {
  const e = email.toLowerCase();
  const ipKey = ip ?? "unknown";
  // First check the IP-only bucket — if an IP is hammering, no email lookup happens.
  const ipB = buckets.get(`ip:${ipKey}`);
  if (ipB && ipB.resetAt > Date.now() && ipB.count >= MAX_PER_IP) {
    return { ok: false, retryAfterSec: Math.ceil((ipB.resetAt - Date.now()) / 1000), reason: "too-many-from-ip" };
  }
  const pairB = buckets.get(`pair:${e}:${ipKey}`);
  if (pairB && pairB.resetAt > Date.now() && pairB.count >= MAX_PER_EMAIL_IP) {
    return { ok: false, retryAfterSec: Math.ceil((pairB.resetAt - Date.now()) / 1000), reason: "too-many-for-account" };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function recordLoginFailure(email: string, ip: string | null) {
  const e = email.toLowerCase();
  const ipKey = ip ?? "unknown";
  bump(`pair:${e}:${ipKey}`, MAX_PER_EMAIL_IP);
  bump(`ip:${ipKey}`, MAX_PER_IP);
}

export function recordLoginSuccess(email: string, ip: string | null) {
  const e = email.toLowerCase();
  const ipKey = ip ?? "unknown";
  clear(`pair:${e}:${ipKey}`);
  // Don't clear the IP bucket — an IP can legitimately host many accounts
  // but we still want to throttle credential-stuffing across them.
}

/**
 * Generic per-IP rate limiter for public AI endpoints (parse-quote, chat,
 * voice telemetry ingest). Same in-process bucket model — single Node host
 * is the assumption. Default is a generous 30 calls / 5 min, suitable for
 * a customer working through a multi-turn booking flow.
 *
 * Pass a unique `bucketKey` for each endpoint so a customer hitting one
 * doesn't burn through another's budget.
 */
export function checkPublicRate(
  bucketKey: string,
  ip: string | null,
  opts: { max?: number } = {},
): { ok: boolean; retryAfterSec: number; reason?: string } {
  const max = opts.max ?? 30;
  const ipKey = ip ?? "unknown";
  const key = `public:${bucketKey}:${ipKey}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
      reason: "rate-limited",
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Test-only: reset all buckets.
 */
export function _resetRateLimitForTests() {
  buckets.clear();
}
