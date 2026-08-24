import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/automation-rules")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { settingsAutomationRules } = await import("@/db/schema");
          const { asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d.select().from(settingsAutomationRules).orderBy(asc(settingsAutomationRules.createdAt));

          return Response.json({ ok: true, rules: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }
          const name = (body.name as string || "").trim();
          const action = (body.action as string || "").trim();
          if (!name || !action) {
            return Response.json({ ok: false, error: "name and action are required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { settingsAutomationRules } = await import("@/db/schema");

          await ensureSchema();
          const d = db();
          const [created] = await d
            .insert(settingsAutomationRules)
            .values({ name, action, enabled: body.enabled !== false })
            .returning();

          await logAudit(actorEmailFromRequest(request), "automation_rule.created", { name, action });

          return Response.json({ ok: true, rule: created });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
