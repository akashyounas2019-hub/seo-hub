import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { notifications, users } from "@/db/schema";

/**
 * Minimal in-house error tracking — no Sentry, no SaaS.
 *
 * Behavior:
 *   - Every error goes to stderr (visible in `journalctl -u gyl-platform`).
 *   - Errors are fingerprinted (sha256 of message + first 3 stack frames).
 *   - For each new fingerprint we drop ONE notification per admin per hour.
 *     A noisy bug doesn't spam the inbox; a new one does.
 *
 * Usage:
 *   try { ... } catch (err) { await trackError(err, { module: "stripe-webhook" }); }
 *
 * Or as a wrapper for server actions / route handlers:
 *   export async function GET() {
 *     try { return await realHandler(); }
 *     catch (err) { await trackError(err, { route: "GET /api/foo" }); throw err; }
 *   }
 */

const SUPPRESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function fingerprint(err: Error): string {
  const msg = (err.message ?? "").slice(0, 200);
  const frames = (err.stack ?? "")
    .split("\n")
    .slice(1, 4)
    .map((l) => l.trim())
    .join("|");
  return createHash("sha256").update(msg + "::" + frames).digest("hex").slice(0, 16);
}

export async function trackError(
  err: unknown,
  context: Record<string, string | number | undefined> = {},
): Promise<void> {
  const error =
    err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
  const fp = fingerprint(error);

  // Always log to stderr
  console.error(`[error fp=${fp}]`, error.message, context, error.stack);

  // Best-effort persist a notification — never let tracking break the caller
  try {
    await ensureSchema();
    const since = new Date(Date.now() - SUPPRESSION_WINDOW_MS);
    const admins = await db()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));

    for (const admin of admins) {
      // Suppress if we've already notified this admin about this fingerprint in the last hour
      const [recent] = await db()
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, admin.id),
            eq(notifications.kind, `error:${fp}`),
            gte(notifications.createdAt, since),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(1);
      if (recent) continue;

      const contextLines = Object.entries(context)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      await db().insert(notifications).values({
        recipientId: admin.id,
        kind: `error:${fp}`,
        title: `⚠ ${error.message.slice(0, 120)}`,
        body: `${contextLines}\n\n${error.stack ?? error.message}`.slice(0, 4000),
        link: null,
      });
    }
  } catch (trackingErr) {
    console.error("[error-tracking] failed to record notification", trackingErr);
  }
}

/** Convenience wrapper for route handlers. */
export function withErrorTracking<A extends unknown[], R>(
  module: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      await trackError(err, { module });
      throw err;
    }
  };
}

// quiet unused-import for sql (kept for future query extensions)
void sql;
