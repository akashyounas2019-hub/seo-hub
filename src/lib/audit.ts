/**
 * Records a privileged action into the audit_log table. Scoped to Settings
 * mutations and site-level admin actions -- not retrofitted app-wide.
 *
 * There is no real session/auth system wired into these server routes yet
 * (the client-side role picker in settings.tsx reads localStorage only), so
 * `actorEmail` comes from an `x-actor-email` request header when the client
 * sends one, falling back to "unknown" rather than fabricating an identity.
 */
export function actorEmailFromRequest(request: Request): string {
  return request.headers.get("x-actor-email") || "unknown";
}

export async function logAudit(actorEmail: string, action: string, detail: Record<string, unknown> = {}) {
  try {
    const { db, ensureSchema } = await import("@/db/client");
    const { auditLog } = await import("@/db/schema");
    await ensureSchema();
    const d = db();
    await d.insert(auditLog).values({ actorEmail: actorEmail || "unknown", action, detail });
  } catch (err) {
    // Audit logging must never break the primary action it's recording.
    console.error("[audit] failed to record entry:", err);
  }
}
