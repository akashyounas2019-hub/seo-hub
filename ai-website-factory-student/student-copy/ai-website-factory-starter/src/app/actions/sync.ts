"use server";

/**
 * On-demand sync triggers used by the site detail page and dashboard.
 *
 * These share the exact same code path as the CLI crons at
 * `src/scripts/sync-gsc.ts` and `src/scripts/sync-ga4.ts` — the CLI wraps a
 * loop, these wrap a single site + a revalidate/redirect.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { integrationsAccounts, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { syncGa4ForSite } from "@/lib/ga4-sync";
import { stampSyncStatus, syncGscForSite } from "@/lib/gsc-sync";
import { requireAdmin } from "@/lib/server-auth";

export async function syncGscNowAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const siteId = String(formData.get("siteId") ?? "").trim();
  const [site] = await db()
    .select({ id: sites.id, slug: sites.slug, domain: sites.domain })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) redirect("/admin/sites?error=site-not-found");

  const result = await syncGscForSite(site, 28);

  if (result.ok) {
    await stampSyncStatus(site.id, "ok", null);
    await recordAdminAction({
      actor: me,
      kind: "integration.gsc_sync",
      targetType: "site",
      targetId: site.id,
      summary: `GSC sync · ${result.written} days · ${result.property}`,
    });
    revalidatePath(`/admin/sites/${site.slug}`);
    revalidatePath("/admin/dashboard-overview");
    redirect(`/admin/sites/${site.slug}?ok=${encodeURIComponent(`gsc-synced-${result.written}`)}`);
  } else {
    if (result.reason !== "not-connected") {
      await stampSyncStatus(site.id, "error", result.error);
    }
    const code =
      result.reason === "not-connected"
        ? "gsc-not-connected"
        : result.reason === "no-property"
          ? "gsc-no-property"
          : "gsc-sync-failed";
    redirect(`/admin/sites/${site.slug}?error=${encodeURIComponent(code)}`);
  }
}

/**
 * Sync GSC for every site that has a Google connection, then redirect back to
 * `/admin/gsc`. This is the button on the Deep Dive page — it exists so the
 * operator doesn't need to hunt for the site detail page to populate the
 * mover widgets.
 */
export async function syncAllGscNowAction(): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const connectedSites = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      domain: sites.domain,
    })
    .from(sites)
    .innerJoin(integrationsAccounts, eq(integrationsAccounts.siteId, sites.id))
    .where(
      and(
        eq(integrationsAccounts.provider, "google"),
        isNotNull(integrationsAccounts.accessTokenCiphertext),
      ),
    );

  if (connectedSites.length === 0) {
    redirect("/admin/gsc?error=no-connected-sites");
  }

  let okCount = 0;
  let failCount = 0;
  for (const site of connectedSites) {
    const result = await syncGscForSite(site, 28);
    if (result.ok) {
      await stampSyncStatus(site.id, "ok", null);
      okCount++;
    } else if (result.reason !== "not-connected") {
      await stampSyncStatus(site.id, "error", result.error);
      failCount++;
    }
  }

  await recordAdminAction({
    actor: me,
    kind: "integration.gsc_sync_all",
    targetType: "other",
    targetId: "network",
    summary: `Network GSC sync · ok=${okCount} fail=${failCount}`,
  });

  revalidatePath("/admin/gsc");
  revalidatePath("/admin/dashboard-overview");
  redirect(`/admin/gsc?ok=${encodeURIComponent(`synced-${okCount}-of-${connectedSites.length}`)}`);
}

export async function syncGa4NowAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const siteId = String(formData.get("siteId") ?? "").trim();
  const [site] = await db()
    .select({ id: sites.id, slug: sites.slug, domain: sites.domain })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) redirect("/admin/sites?error=site-not-found");

  const result = await syncGa4ForSite(site, 28);

  if (result.ok) {
    await stampSyncStatus(site.id, "ok", null);
    await recordAdminAction({
      actor: me,
      kind: "integration.ga4_sync",
      targetType: "site",
      targetId: site.id,
      summary: `GA4 sync · ${result.written} days · property=${result.propertyId}`,
    });
    revalidatePath(`/admin/sites/${site.slug}`);
    revalidatePath("/admin/dashboard-overview");
    redirect(`/admin/sites/${site.slug}?ok=${encodeURIComponent(`ga4-synced-${result.written}`)}`);
  } else {
    if (result.reason !== "not-connected" && result.reason !== "no-property-id") {
      await stampSyncStatus(site.id, "error", result.error);
    }
    const code =
      result.reason === "not-connected"
        ? "ga4-not-connected"
        : result.reason === "no-property-id"
          ? "ga4-no-property-id"
          : "ga4-sync-failed";
    redirect(`/admin/sites/${site.slug}?error=${encodeURIComponent(code)}`);
  }
}
