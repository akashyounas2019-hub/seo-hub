import { createFileRoute } from "@tanstack/react-router";
import { verifyWordPressConnection } from "@/lib/wordpress";
import { decrypt } from "@/lib/crypto";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

/**
 * Verifies the site's stored WordPress credentials against a real call to
 * that site's own REST API (/wp-json/wp/v2/users/me) and updates
 * sites.wp_connected accordingly -- never marks connected without an
 * actual successful auth check.
 */
export const Route = createFileRoute("/api/sites/$id/wp-verify")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }
          if (!site.wpSiteUrl || !site.wpUsername || !site.wpAppPasswordCiphertext) {
            return Response.json({ ok: false, error: "WordPress credentials are not set for this site" }, { status: 400 });
          }

          let appPassword: string;
          try {
            appPassword = decrypt(site.wpAppPasswordCiphertext);
          } catch (err: any) {
            return Response.json({ ok: false, error: `Stored credentials could not be decrypted: ${err.message}` }, { status: 500 });
          }

          const result = await verifyWordPressConnection({
            siteUrl: site.wpSiteUrl,
            username: site.wpUsername,
            appPassword,
          });

          await d.update(sites).set({ wpConnected: result.ok, wpDetail: result.ok ? `Connected as ${result.userName}` : site.wpDetail, updatedAt: new Date() }).where(eq(sites.id, params.id));

          await logAudit(actorEmailFromRequest(request), result.ok ? "site.wp_connected" : "site.wp_connect_failed", {
            siteId: params.id,
            error: result.ok ? undefined : result.error,
          });

          if (!result.ok) {
            return Response.json({ ok: false, error: result.error }, { status: 502 });
          }
          return Response.json({ ok: true, userName: result.userName });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to verify WordPress connection" }, { status: 500 });
        }
      },
    },
  },
});
