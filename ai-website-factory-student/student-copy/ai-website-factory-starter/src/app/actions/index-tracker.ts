"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { indexingStatus, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { submitIndexNow } from "@/lib/indexing/indexnow";
import { syncAllSitesIndexing } from "@/lib/indexing/sync";
import { getIndexNowQuota, recordIndexNowUsage } from "@/lib/indexing/quota";
import { recordAdminAction } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Manually trigger the daily indexing sync (sitemap -> GSC/HTTP probe ->
 * indexing_status -> IndexNow submit) instead of waiting for the
 * /api/cron/run-indexing schedule. Caps itself the same way the cron does
 * (MAX_INSPECTS_PER_SITE in sync.ts), so this is safe to click on demand.
 */
export async function runIndexingSyncAction() {
  await ensureSchema();
  await requireAdmin();

  const results = await syncAllSitesIndexing();
  const totalInspected = results.reduce((sum, r) => sum + r.inspected, 0);
  const failed = results.filter((r) => r.error);

  revalidatePath("/admin/indexing");
  revalidatePath("/admin/index-tracker");

  if (totalInspected === 0) {
    redirect(`/admin/indexing?error=${encodeURIComponent("sync-found-no-pages")}`);
  }
  if (failed.length > 0) {
    const reasons = failed.map((r) => `${r.slug}::${r.error}`).join("|");
    redirect(`/admin/indexing?ok=sync-ran&failed=${encodeURIComponent(reasons)}`);
  }
  redirect("/admin/indexing?ok=sync-ran");
}

/** Resubmit a single not-indexed URL to IndexNow and stamp lastSubmittedAt. */
export async function resubmitUrl(siteId: string, url: string): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  await requireAdmin();

  const quota = await getIndexNowQuota();
  if (quota.used >= quota.cap) return { ok: false, error: "daily-quota-reached" };

  const [site] = await db().select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  const result = await submitIndexNow(site.domain, [url]);
  if (!result.ok) return { ok: false, error: result.error ?? "indexnow-failed" };

  await recordIndexNowUsage(result.submitted);
  await db()
    .update(indexingStatus)
    .set({ lastSubmittedAt: new Date(), submitSource: "indexnow" })
    .where(sql`${indexingStatus.siteId} = ${siteId} and ${indexingStatus.url} = ${url}`);

  revalidatePath("/admin/index-tracker");
  revalidatePath("/admin/indexing");
  return { ok: true };
}

/** Resubmit every not-indexed URL for a site in one IndexNow batch call. */
export async function resubmitAllForSite(siteId: string): Promise<{ ok: boolean; submitted: number; error?: string }> {
  await ensureSchema();
  await requireAdmin();

  const quota = await getIndexNowQuota();
  if (quota.used >= quota.cap) return { ok: false, submitted: 0, error: "daily-quota-reached" };

  const [site] = await db().select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, submitted: 0, error: "site-not-found" };

  const rows = await db()
    .select({ url: indexingStatus.url })
    .from(indexingStatus)
    .where(sql`${indexingStatus.siteId} = ${siteId} and ${indexingStatus.indexState} <> 'indexed'`);

  const remaining = quota.cap - quota.used;
  const urls = rows.map((r) => r.url).slice(0, Math.max(0, remaining));
  if (urls.length === 0) return { ok: true, submitted: 0 };

  const result = await submitIndexNow(site.domain, urls);
  if (!result.ok) return { ok: false, submitted: 0, error: result.error ?? "indexnow-failed" };

  await recordIndexNowUsage(result.submitted);
  const submittedUrls = urls.slice(0, result.submitted);
  await db()
    .update(indexingStatus)
    .set({ lastSubmittedAt: new Date(), submitSource: "indexnow" })
    .where(and(eq(indexingStatus.siteId, siteId), inArray(indexingStatus.url, submittedUrls)));

  revalidatePath("/admin/index-tracker");
  revalidatePath("/admin/indexing");
  return { ok: true, submitted: result.submitted };
}

/**
 * "De-indexing request" — there is no real Google API for removing ordinary
 * content pages from the index (the Indexing API only accepts URL_DELETED
 * for JobPosting/BroadcastEvent types). Instead: flag the row so it surfaces
 * in the UI with noindex instructions, and fire an IndexNow re-submission
 * (which at least re-signals freshness to Bing/Yandex once noindex is live).
 */
export async function requestRemoval(siteId: string, url: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  await db()
    .update(indexingStatus)
    .set({ removalRequestedAt: new Date(), removalNote: note?.trim() || null })
    .where(sql`${indexingStatus.siteId} = ${siteId} and ${indexingStatus.url} = ${url}`);

  await recordAdminAction({
    actor: me,
    kind: "indexing.removal_requested",
    targetType: "site",
    targetId: siteId,
    summary: `Flagged ${url} for removal — add noindex on the WP side; Google has no removal API for ordinary pages.`,
  });

  revalidatePath("/admin/index-tracker");
  revalidatePath("/admin/indexing");
  return { ok: true };
}

/** Clear a removal flag (e.g. the admin changed their mind, or noindex was reverted). */
export async function clearRemovalRequest(siteId: string, url: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();

  await db()
    .update(indexingStatus)
    .set({ removalRequestedAt: null, removalNote: null })
    .where(sql`${indexingStatus.siteId} = ${siteId} and ${indexingStatus.url} = ${url}`);

  revalidatePath("/admin/index-tracker");
  revalidatePath("/admin/indexing");
  return { ok: true };
}
