import { createFileRoute } from "@tanstack/react-router";
import { KEY_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, IDEMPOTENCY_HEADER, verify } from "@/lib/hmac";

export const Route = createFileRoute("/api/events/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { events, apiKeys, leads } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const headers = request.headers;
          const keyId = headers.get(KEY_ID_HEADER);
          const signature = headers.get(SIGNATURE_HEADER);
          const timestamp = headers.get(TIMESTAMP_HEADER);
          const idempotencyKey = headers.get(IDEMPOTENCY_HEADER);

          const rawBody = await request.text();

          if (!keyId || !signature || !timestamp || !idempotencyKey) {
            return Response.json({ ok: false, error: "Missing required HMAC headers" }, { status: 400 });
          }

          const d = db();
          const keys = await d.select().from(apiKeys).where(eq(apiKeys.keyId, keyId)).limit(1);
          if (keys.length === 0 || !keys[0].active) {
            return Response.json({ ok: false, error: "Invalid API key" }, { status: 401 });
          }

          const key = keys[0];
          const verifyRes = verify({ secret: key.secret, timestamp, body: rawBody, signature });
          if (!verifyRes.ok) {
            return Response.json({ ok: false, error: `Invalid signature: ${verifyRes.reason}` }, { status: 401 });
          }

          let payload: any = {};
          try {
            payload = JSON.parse(rawBody);
          } catch {
            return Response.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
          }

          // Record event
          await d.insert(events).values({
            siteId: key.siteId,
            kind: payload.kind || "generic",
            payload,
            signatureValid: true,
            idempotencyKey,
          }).onConflictDoNothing();

          // If lead form submission, record in leads table
          if (payload.kind === "lead_submitted" || payload.kind === "form_submitted") {
            await d.insert(leads).values({
              siteId: key.siteId,
              form: payload.form || "default",
              name: payload.name,
              email: payload.email,
              phone: payload.phone,
              service: payload.service,
              message: payload.message,
              pageUrl: payload.pageUrl,
              meta: payload.meta || {},
            });
          }

          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
