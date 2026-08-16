import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "gyl_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_ABSOLUTE_MAX_MS = 1000 * 60 * 60 * 24 * 90; // 90 days hard ceiling

const SCRYPT_KEYLEN = 64;
const SCRYPT_PREFIX = "scrypt$";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

// Stable dummy hash used to give the password-verify path constant cost
// even when no user row exists or the stored hash is malformed. This prevents
// timing-based account enumeration. Computed once at module load.
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_EXPECTED = scryptSync("dummy-password", DUMMY_SALT, SCRYPT_KEYLEN);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/**
 * Async, constant-time-ish password verification.
 *
 * Performance: uses libuv's threadpool via async scrypt so the event loop
 * doesn't block under load. Always performs a real scrypt computation
 * regardless of whether the stored hash is valid — this hides "user doesn't
 * exist" from "user exists but wrong password" via response timing.
 *
 * Callers should treat this as the canonical password check. The legacy
 * sync `verifyPasswordSync` is retained only for tests.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Parse the stored hash. If invalid for any reason, fall through to a
  // dummy scrypt run + always-false comparison so timing stays constant.
  let salt = DUMMY_SALT;
  let expected: Buffer = DUMMY_EXPECTED;
  let valid = false;
  if (stored && stored.startsWith(SCRYPT_PREFIX)) {
    const parts = stored.split("$");
    if (parts.length === 3 && parts[1] && parts[2]) {
      try {
        const candidate = Buffer.from(parts[2], "hex");
        if (candidate.length === SCRYPT_KEYLEN) {
          salt = parts[1];
          expected = candidate;
          valid = true;
        }
      } catch {
        // fall through with valid=false
      }
    }
  }
  const actual = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  // Always run timingSafeEqual on equal-length buffers so the compare cost
  // is constant. Then AND with `valid` so a malformed hash is never accepted
  // even if the (dummy) compare returns true.
  if (actual.length !== expected.length) return false;
  const equal = timingSafeEqual(actual, expected);
  return valid && equal;
}

/**
 * Sync verify — only used by older tests. Prefer the async version.
 */
export function verifyPasswordSync(password: string, stored: string): boolean {
  if (!stored.startsWith(SCRYPT_PREFIX)) return false;
  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, opts: { userAgent?: string | null; ip?: string | null } = {}) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().insert(sessions).values({
    tokenHash,
    userId,
    expiresAt,
    userAgent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
  });
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<User | null> {
  const tokenHash = hashSessionToken(token);
  const rows = await db()
    .select({
      user: users,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (rows.length === 0) return null;

  // Refresh last_seen_at (fire-and-forget) — best effort, ignore failures.
  db()
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.tokenHash, tokenHash))
    .catch(() => {});

  return rows[0].user;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
