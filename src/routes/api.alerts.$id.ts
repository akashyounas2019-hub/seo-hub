import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/alerts/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { alerts } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [alert] = await d.select().from(alerts).where(eq(alerts.id, params.id)).limit(1);
          return Response.json({ ok: true, alert: alert || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { alerts } = await import("@/db/schema");
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
          if (body.status !== undefined) {
            updates.status = body.status;
            if (body.status === "resolved") updates.resolvedAt = new Date();
          }
          if (body.severity !== undefined) updates.severity = body.severity;
          if (body.title !== undefined) updates.title = body.title;
          if (body.message !== undefined) updates.message = body.message;

          await d.update(alerts).set(updates).where(eq(alerts.id, params.id));
          const [updated] = await d.select().from(alerts).where(eq(alerts.id, params.id)).limit(1);
          return Response.json({ ok: true, alert: updated || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { alerts } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(alerts).where(eq(alerts.id, params.id));
          return Response.json({ ok: true, alertId: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
