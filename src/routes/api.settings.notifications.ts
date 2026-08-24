import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/notifications")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { notificationPrefs } = await import("@/db/schema");
          const { asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d.select().from(notificationPrefs).orderBy(asc(notificationPrefs.eventKey));

          return Response.json({ ok: true, prefs: rows });
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
          const eventKey = body.eventKey as string;
          const channel = body.channel as "email" | "slack" | "push";
          if (!eventKey || !["email", "slack", "push"].includes(channel)) {
            return Response.json({ ok: false, error: "eventKey and a valid channel are required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { notificationPrefs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d
            .update(notificationPrefs)
            .set({ [channel]: !!body.enabled, updatedAt: new Date() })
            .where(eq(notificationPrefs.eventKey, eventKey));

          await logAudit(actorEmailFromRequest(request), "notification_pref.toggled", { eventKey, channel, enabled: !!body.enabled });

          return Response.json({ ok: true, eventKey, channel, enabled: !!body.enabled });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
