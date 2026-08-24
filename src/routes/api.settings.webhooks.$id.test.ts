import { createFileRoute } from "@tanstack/react-router";
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/lib/hmac";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/webhooks/$id/test")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { webhookSubscribers } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [sub] = await d.select().from(webhookSubscribers).where(eq(webhookSubscribers.id, params.id)).limit(1);
          if (!sub) {
            return Response.json({ ok: false, error: "Webhook subscriber not found" }, { status: 404 });
          }

          const payload = JSON.stringify({ event: "test", sentAt: new Date().toISOString() });
          const timestamp = String(Math.floor(Date.now() / 1000));
          const signature = sign({ secret: sub.secret, timestamp, body: payload });

          let status: string;
          try {
            const res = await fetch(sub.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                [SIGNATURE_HEADER]: signature,
                [TIMESTAMP_HEADER]: timestamp,
              },
              body: payload,
              signal: AbortSignal.timeout(6000),
            });
            status = `${res.status} ${res.statusText}`;
          } catch (err: any) {
            status = `delivery failed: ${err.message}`;
          }

          await d
            .update(webhookSubscribers)
            .set({ lastDeliveredAt: new Date(), lastStatus: status })
            .where(eq(webhookSubscribers.id, params.id));

          await logAudit(actorEmailFromRequest(request), "webhook.tested", { id: params.id, status });

          return Response.json({ ok: true, status });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
