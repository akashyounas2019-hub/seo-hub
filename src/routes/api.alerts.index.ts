import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/alerts/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { alerts } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(300);
          return Response.json({ ok: true, alerts: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load alerts" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { alerts } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          if (!body.title) {
            return Response.json({ ok: false, error: "title is required" }, { status: 400 });
          }

          const [created] = await d
            .insert(alerts)
            .values({
              siteId: body.siteId || null,
              severity: body.severity || "info",
              title: body.title,
              message: body.message || null,
              source: body.source || "manual",
              status: "open",
            })
            .returning();

          return Response.json({ ok: true, alert: created });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to create alert" }, { status: 500 });
        }
      },
    },
  },
});
