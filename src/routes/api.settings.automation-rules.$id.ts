import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/automation-rules/$id")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { settingsAutomationRules } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const updates: Record<string, any> = {};
          if (body.enabled !== undefined) updates.enabled = !!body.enabled;
          if (body.name !== undefined) updates.name = body.name;
          if (body.action !== undefined) updates.action = body.action;

          await d.update(settingsAutomationRules).set(updates).where(eq(settingsAutomationRules.id, params.id));
          await logAudit(actorEmailFromRequest(request), "automation_rule.updated", { id: params.id, updates });

          return Response.json({ ok: true, id: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { settingsAutomationRules } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(settingsAutomationRules).where(eq(settingsAutomationRules.id, params.id));
          await logAudit(actorEmailFromRequest(request), "automation_rule.removed", { id: params.id });

          return Response.json({ ok: true, id: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
