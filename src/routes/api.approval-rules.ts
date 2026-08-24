import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/approval-rules")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { approvalRules } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rules = await d.select().from(approvalRules).orderBy(desc(approvalRules.createdAt));
          return Response.json({ ok: true, rules });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load approval rules" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { approvalRules } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          if (!body.name) {
            return Response.json({ ok: false, error: "name is required" }, { status: 400 });
          }

          const [rule] = await d
            .insert(approvalRules)
            .values({
              name: body.name,
              minPriority: body.minPriority || null,
              category: body.category || null,
              siteId: body.siteId || null,
              requiresApproval: body.requiresApproval !== undefined ? !!body.requiresApproval : true,
              enabled: body.enabled !== undefined ? !!body.enabled : true,
            })
            .returning();

          await logAudit(actorEmailFromRequest(request), "approval_rule.created", { ruleId: rule.id, name: rule.name });

          return Response.json({ ok: true, rule });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to create approval rule" }, { status: 500 });
        }
      },
    },
  },
});
