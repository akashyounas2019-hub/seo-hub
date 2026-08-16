/**
 * Page inventory sync — calls each site's plugin /seo-inventory endpoint
 * and refreshes the platform's `site_pages` catalogue.
 *
 * Usage:
 *   npm run sync:inventory                 # every site
 *   npm run sync:inventory -- --site=slug  # one site
 *
 * Suggested cron: `0 6 * * *` (daily 06:00 UTC, after GSC sync at 04:00).
 */
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { sitePages, sites } from "../db/schema";
import { callPlugin, WpPluginError, WpPluginNotConfiguredError } from "../lib/wp-plugin-client";

interface InventoryItem {
  id: number;
  slug: string;
  url: string;
  title: string;
  status: string;
  post_type: string;
  modified: string;
  word_count: number;
  has_design_override: boolean;
  parent_id: number;
}

interface InventoryResponse {
  ok: boolean;
  items?: InventoryItem[];
  count?: number;
  page?: number;
  pages?: number;
  total?: number;
  error?: string;
}

async function syncOne(site: { id: string; slug: string; domain: string }): Promise<{ synced: number; failed: boolean; error?: string }> {
  let page = 1;
  let pages = 1;
  let synced = 0;
  const seenPostIds = new Set<number>();

  while (page <= pages) {
    let resp: InventoryResponse;
    try {
      resp = await callPlugin<InventoryResponse>(site.id, {
        method: "GET",
        path: `/seo-inventory?page=${page}&per_page=200`,
      });
    } catch (err) {
      const msg =
        err instanceof WpPluginError ? `${err.reason}: ${err.message}`
        : err instanceof WpPluginNotConfiguredError ? err.message
        : err instanceof Error ? err.message
        : String(err);
      return { synced, failed: true, error: msg };
    }
    if (!resp.ok || !Array.isArray(resp.items)) {
      return { synced, failed: true, error: resp.error ?? "bad response" };
    }
    pages = resp.pages ?? 1;

    for (const item of resp.items) {
      seenPostIds.add(item.id);
      const modifiedAt = item.modified ? new Date(item.modified) : null;
      await db()
        .insert(sitePages)
        .values({
          siteId: site.id,
          wpPostId: item.id,
          slug: item.slug,
          url: item.url,
          title: item.title,
          postType: item.post_type,
          status: item.status,
          modifiedAt,
          wordCount: item.word_count,
          hasDesignOverride: item.has_design_override,
          parentId: item.parent_id,
        })
        .onConflictDoUpdate({
          target: [sitePages.siteId, sitePages.wpPostId],
          set: {
            slug: item.slug,
            url: item.url,
            title: item.title,
            postType: item.post_type,
            status: item.status,
            modifiedAt,
            wordCount: item.word_count,
            hasDesignOverride: item.has_design_override,
            parentId: item.parent_id,
            lastSyncedAt: new Date(),
          },
        });
      synced += 1;
    }
    page += 1;
  }

  // Drop pages that the plugin no longer reports — they were deleted.
  if (seenPostIds.size > 0) {
    const ids = Array.from(seenPostIds);
    await db()
      .delete(sitePages)
      .where(
        and(
          eq(sitePages.siteId, site.id),
          sql`${sitePages.wpPostId} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
        ),
      );
  }

  return { synced, failed: false };
}

async function main(): Promise<void> {
  await ensureSchema();
  const args = process.argv.slice(2);
  const siteFlag = args.find((a) => a.startsWith("--site="));
  const siteSlug = siteFlag ? siteFlag.slice("--site=".length) : null;

  const allSites = await db().select({ id: sites.id, slug: sites.slug, domain: sites.domain }).from(sites).orderBy(sites.slug);
  const targets = siteSlug ? allSites.filter((s) => s.slug === siteSlug) : allSites;
  if (targets.length === 0) {
    console.error(siteSlug ? `No site with slug=${siteSlug}` : "No sites configured.");
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  let totalRows = 0;
  for (const site of targets) {
    const res = await syncOne(site);
    if (res.failed) {
      console.error(`[${site.slug}] FAILED: ${res.error}`);
      failed += 1;
    } else {
      console.log(`[${site.slug}] synced ${res.synced} pages`);
      ok += 1;
      totalRows += res.synced;
    }
  }
  console.log(`\nDone — ${ok} ok, ${failed} failed, ${totalRows} rows.`);
}

main().catch((err) => {
  console.error("[sync:inventory] crashed:", err);
  process.exit(1);
});
