import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

const ALLOWED_FIELDS = ["name", "minPriority", "category", "siteId", "requiresApproval", "enabled"];

export const Route = createFileRoute("/api/approval-rules/$id")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { approvalRules } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const updates: Record<string, any> = {};
          for (const key of ALLOWED_FIELDS) {
            if (body[key] !== undefined) updates[key] = body[key];
          }

          await d.update(approvalRules).set(updates).where(eq(approvalRules.id, params.id));
          const [updated] = await d.select().from(approvalRules).where(eq(approvalRules.id, params.id)).limit(1);

          await logAudit(actorEmailFromRequest(request), "approval_rule.updated", { ruleId: params.id, fields: Object.keys(updates) });

          return Response.json({ ok: true, rule: updated || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to update approval rule" }, { status: 500 });
        }
      },
      DELETE: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { approvalRules } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(approvalRules).where(eq(approvalRules.id, params.id));
          await logAudit(actorEmailFromRequest(request), "approval_rule.deleted", { ruleId: params.id });
          return Response.json({ ok: true, ruleId: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to delete approval rule" }, { status: 500 });
        }
      },
    },
  },
});
