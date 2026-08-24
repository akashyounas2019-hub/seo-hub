import { createFileRoute } from "@tanstack/react-router";
import { fetchGBPAccounts, fetchGBPLocations } from "@/lib/google/business-profile";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

/**
 * Manual-trigger "Sync from Google Business Profile" -- pulls the site's
 * real GBP location (name, address, phone, hours if available) into
 * structuredKb.businessProfile, the same field every AI prompt reads via
 * compileFullKnowledge(). No scheduler; matches the orchestrator's and
 * sitemap crawler's manual-trigger-only design (no cron in this app).
 */
export const Route = createFileRoute("/api/sites/$id/gbp-sync")({
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

          const accounts = await fetchGBPAccounts();
          if (!accounts.length) {
            return Response.json({ ok: false, error: "No Google Business Profile accounts accessible to this service account" }, { status: 404 });
          }

          const locations = await fetchGBPLocations(accounts[0].name);
          if (!locations.length) {
            return Response.json({ ok: false, error: "No GBP locations found on this account" }, { status: 404 });
          }

          // If the site already has a known location name, try to match it;
          // otherwise take the first location.
          const match =
            (site.gbpLocationName && locations.find((l: any) => l.title === site.gbpLocationName)) || locations[0];

          const address = match.storefrontAddress
            ? [match.storefrontAddress.addressLines?.join(", "), match.storefrontAddress.locality, match.storefrontAddress.administrativeArea]
                .filter(Boolean)
                .join(", ")
            : undefined;
          const phone = match.phoneNumbers?.primaryPhone;

          const existingKb = (site.structuredKb as any) || {};
          const updatedKb = {
            ...existingKb,
            businessProfile: {
              ...(existingKb.businessProfile || {}),
              ...(match.title ? { businessName: match.title } : {}),
              ...(address ? { address } : {}),
              ...(phone ? { phone } : {}),
            },
          };

          await d
            .update(sites)
            .set({
              structuredKb: updatedKb,
              gbpConnected: true,
              gbpLocationName: match.title || site.gbpLocationName,
              updatedAt: new Date(),
            })
            .where(eq(sites.id, params.id));

          await logAudit(actorEmailFromRequest(request), "site.gbp_synced", {
            siteId: params.id,
            locationName: match.title,
          });

          return Response.json({
            ok: true,
            synced: {
              businessName: match.title,
              address,
              phone,
            },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to sync Google Business Profile" }, { status: 500 });
        }
      },
    },
  },
});
