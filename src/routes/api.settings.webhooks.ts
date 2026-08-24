import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/webhooks")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { webhookSubscribers } = await import("@/db/schema");
          const { asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d
            .select({
              id: webhookSubscribers.id,
              label: webhookSubscribers.label,
              url: webhookSubscribers.url,
              active: webhookSubscribers.active,
              createdAt: webhookSubscribers.createdAt,
              lastDeliveredAt: webhookSubscribers.lastDeliveredAt,
              lastStatus: webhookSubscribers.lastStatus,
            })
            .from(webhookSubscribers)
            .orderBy(asc(webhookSubscribers.createdAt));
          // secret is intentionally never returned to the client

          return Response.json({ ok: true, webhooks: rows });
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

          const label = (body.label as string || "").trim();
          const url = (body.url as string || "").trim();
          if (!label || !url) {
            return Response.json({ ok: false, error: "label and url are required" }, { status: 400 });
          }
          try {
            new URL(url);
          } catch {
            return Response.json({ ok: false, error: "url is not a valid URL" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { webhookSubscribers } = await import("@/db/schema");

          await ensureSchema();
          const d = db();
          const secret = randomBytes(24).toString("hex");
          const [created] = await d
            .insert(webhookSubscribers)
            .values({ label, url, secret })
            .returning();

          await logAudit(actorEmailFromRequest(request), "webhook.added", { label, url });

          return Response.json({
            ok: true,
            webhook: { id: created.id, label: created.label, url: created.url, active: created.active, createdAt: created.createdAt },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
