/**
 * Tiny helper to write to the audit_log table.
 *
 * Call from server actions, cron jobs, worker callbacks. Don't await this
 * inside a hot path — fire-and-forget is fine, log failures shouldn't break
 * the action.
 *
 * Usage:
 *   await logAudit({ kind: "fix_applied", siteId, summary: "Set meta title", afterState: {...} });
 */
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

export interface AuditEvent {
  kind: string;
  summary: string;
  siteId?: string | null;
  actorId?: string | null;
  source?: "admin_ui" | "cron" | "worker" | "cli" | "webhook";
  payload?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  relatedKind?: string;
  relatedId?: string;
}

export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db().insert(auditLog).values({
      kind: event.kind,
      siteId: event.siteId ?? null,
      summary: event.summary,
      actorId: event.actorId ?? null,
      source: event.source ?? "admin_ui",
      payload: event.payload ?? {},
      beforeState: event.beforeState ?? null,
      afterState: event.afterState ?? null,
      relatedKind: event.relatedKind ?? null,
      relatedId: event.relatedId ?? null,
    });
  } catch (err) {
    // Audit log failures must never break the underlying operation.
    console.error("[audit-log] write failed:", (err as Error).message);
  }
}
