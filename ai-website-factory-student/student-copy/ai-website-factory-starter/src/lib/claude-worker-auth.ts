/**
 * Helpers for authenticating the Claude Code worker against /api/claude-jobs/*.
 *
 * The shared secret lives in `org_settings.claude_worker_secret`. The
 * worker presents it via the `Authorization: Bearer <secret>` header on
 * every request.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { orgSettings } from "../db/schema";

let _cached: string | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getWorkerSecret(): Promise<string | null> {
  if (_cached && Date.now() - _cachedAt < CACHE_TTL_MS) return _cached;
  const [row] = await db().select({ secret: orgSettings.claudeWorkerSecret }).from(orgSettings).limit(1);
  _cached = row?.secret ?? null;
  _cachedAt = Date.now();
  return _cached;
}

/** Generate + store a new secret. Returns the new secret. */
export async function rotateWorkerSecret(): Promise<string> {
  const fresh = randomBytes(32).toString("hex");
  const [row] = await db().select({ id: orgSettings.id }).from(orgSettings).limit(1);
  if (row) {
    await db().update(orgSettings).set({ claudeWorkerSecret: fresh, updatedAt: new Date() }).where(eq(orgSettings.id, row.id));
  } else {
    await db().insert(orgSettings).values({ claudeWorkerSecret: fresh });
  }
  _cached = fresh;
  _cachedAt = Date.now();
  return fresh;
}

/** Compare a bearer token against the stored secret in constant time. */
export async function verifyWorkerAuth(authHeader: string | null): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const presented = authHeader.slice(7).trim();
  if (!presented) return false;
  const stored = await getWorkerSecret();
  if (!stored) return false;
  // Constant-time compare
  if (presented.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) diff |= presented.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
