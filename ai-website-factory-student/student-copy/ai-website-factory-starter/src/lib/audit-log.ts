import { headers } from "next/headers";
import { db } from "@/db/client";
import { adminActions, type User } from "@/db/schema";

/**
 * Append-only log of human admin actions for accountability.
 *
 * Call this from every server action that mutates a user, lead, task, site,
 * comment, integration, key, or org-wide setting. It captures actor + kind +
 * target reference + before/after snapshots so "who did what when" is
 * traceable even after the underlying row is deleted.
 *
 * Fails open: any logging error is swallowed (logged to stderr only) so a
 * broken audit table cannot block a mutation.
 *
 * Action kind convention: `<entity>.<verb>` e.g. `user.update`,
 * `lead.status_change`, `task.delete`, `site.create`, `key.rotate`.
 */
export async function recordAdminAction(input: {
  actor: User | { id: string; email: string } | null;
  kind: string;
  targetType: "user" | "lead" | "task" | "site" | "comment" | "integration" | "key" | "org" | "phone_number" | "template" | "other";
  targetId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    // Capture request-scoped IP/UA if we're inside a server-action / route handler.
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null;
      userAgent = h.get("user-agent");
    } catch {
      // Outside a request context (e.g. cron) — headers() throws.
    }

    await db()
      .insert(adminActions)
      .values({
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        kind: input.kind,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        summary: input.summary,
        before: truncate(input.before),
        after: truncate(input.after),
        ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
      });
  } catch (err) {
    // Best-effort: never let auditing break the actual mutation.
    console.error("[audit-log] failed to record action", { kind: input.kind, summary: input.summary, err });
  }
}

// Truncate before/after JSON snapshots to 16 KB per side so a giant row
// doesn't bloat the audit table.
const MAX_JSON_BYTES = 16 * 1024;
function truncate(v: unknown): unknown {
  if (v === undefined) return null;
  try {
    const s = JSON.stringify(v);
    if (s.length <= MAX_JSON_BYTES) return v;
    return { _truncated: true, _bytes: s.length, _preview: s.slice(0, MAX_JSON_BYTES) };
  } catch {
    return { _unserializable: true };
  }
}
