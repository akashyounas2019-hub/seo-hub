import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/webhooks/$id")({
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
          const { webhookSubscribers } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const updates: Record<string, any> = {};
          if (body.active !== undefined) updates.active = !!body.active;
          if (body.label !== undefined) updates.label = body.label;
          if (body.url !== undefined) updates.url = body.url;

          await d.update(webhookSubscribers).set(updates).where(eq(webhookSubscribers.id, params.id));
          await logAudit(actorEmailFromRequest(request), "webhook.updated", { id: params.id, updates });

          return Response.json({ ok: true, id: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { webhookSubscribers } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(webhookSubscribers).where(eq(webhookSubscribers.id, params.id));
          await logAudit(actorEmailFromRequest(request), "webhook.removed", { id: params.id });

          return Response.json({ ok: true, id: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
