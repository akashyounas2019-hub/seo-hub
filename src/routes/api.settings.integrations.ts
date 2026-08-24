import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

// Maps the UI's integration key to the org_settings boolean column.
const INTEGRATION_COLUMNS: Record<string, string> = {
  smtp: "integrationSmtpEnabled",
  slack: "integrationSlackEnabled",
  telegram: "integrationTelegramEnabled",
  restApi: "integrationRestApiEnabled",
  wordpress: "integrationWordpressEnabled",
  stripe: "integrationStripeEnabled",
  zapier: "integrationZapierEnabled",
};

export const Route = createFileRoute("/api/settings/integrations")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [row] = await d.select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);

          const enabled: Record<string, boolean> = {};
          for (const [key, column] of Object.entries(INTEGRATION_COLUMNS)) {
            enabled[key] = !!(row as any)?.[column];
          }

          return Response.json({ ok: true, enabled });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const key = body.key as string;
          const on = !!body.enabled;
          const column = INTEGRATION_COLUMNS[key];
          if (!column) {
            return Response.json({ ok: false, error: "unknown integration key" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.update(orgSettings).set({ [column]: on, updatedAt: new Date() }).where(eq(orgSettings.id, "singleton"));

          await logAudit(actorEmailFromRequest(request), "integration.toggled", { key, enabled: on });

          return Response.json({ ok: true, key, enabled: on });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
