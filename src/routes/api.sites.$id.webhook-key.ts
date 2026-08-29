import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "node:crypto";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

// Real inbound-webhook API key management for a site. This is the missing
// piece that made the real HMAC-verified ingest endpoint
// (api.events.ingest.ts) unusable in production: the endpoint and its
// database table were both genuinely correct, but there was no UI or route
// anywhere that ever issued a real keyId/secret pair for a site to actually
// configure in its WordPress plugin -- the only place one was ever created
// was db/seed.ts's fake-data-adjacent bootstrap loop, which was correctly
// removed this session (it had never even run against production). This
// gives the real webhook feature something to actually authenticate with.
function genSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export const Route = createFileRoute("/api/sites/$id/webhook-key")({
  server: {
    handlers: {
      // Returns the site's active key (keyId only -- the secret is shown
      // once at creation time and never returned again, same convention as
      // most real API-key systems) or null if none exists yet.
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { apiKeys } = await import("@/db/schema");
          const { eq, and, desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [key] = await d
            .select({ id: apiKeys.id, keyId: apiKeys.keyId, active: apiKeys.active, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt })
            .from(apiKeys)
            .where(and(eq(apiKeys.siteId, params.id), eq(apiKeys.active, true)))
            .orderBy(desc(apiKeys.createdAt))
            .limit(1);

          return Response.json({ ok: true, key: key || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load webhook key" }, { status: 500 });
        }
      },
      // Generates a new real key+secret for this site and deactivates any
      // previous one (rotation, not accumulation) -- the secret is returned
      // exactly once in this response.
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { apiKeys, sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select({ id: sites.id, slug: sites.slug }).from(sites).where(eq(sites.id, params.id)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          await d.update(apiKeys).set({ active: false }).where(eq(apiKeys.siteId, params.id));

          const keyId = `site_${site.slug.replace(/[^a-z0-9]+/gi, "_")}_${randomBytes(4).toString("hex")}`;
          const secret = genSecret(32);

          await d.insert(apiKeys).values({ siteId: params.id, keyId, secret, active: true });

          await logAudit(actorEmailFromRequest(request), "webhook_key.rotated", { siteId: params.id, keyId });

          return Response.json({ ok: true, keyId, secret });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to generate webhook key" }, { status: 500 });
        }
      },
    },
  },
});
