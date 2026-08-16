/**
 * GSC (Search Console) sync — daily CLI cron.
 *
 * Pulls the last 28 days of daily clicks / impressions / CTR / avg position
 * per connected site into `traffic_snapshots` (`source='gsc'`). Business
 * logic lives in `src/lib/gsc-sync.ts` so the per-site "Sync now" button
 * shares the exact same code path.
 *
 * Usage:
 *   npm run sync:gsc                 # every site, last 28d
 *   npm run sync:gsc -- --site=slug  # one site
 *   npm run sync:gsc -- --days=90    # override lookback window
 *
 * Suggested cron: `0 4 * * *` (daily 04:00 UTC — GSC data has ~2-3 day delay).
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { sites } from "../db/schema";
import { stampSyncStatus, syncGscForSite } from "../lib/gsc-sync";

function parseArgs(): { siteSlug: string | null; days: number } {
  let siteSlug: string | null = null;
  let days = 28;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--site=")) siteSlug = arg.slice("--site=".length);
    else if (arg.startsWith("--days=")) {
      const n = Number.parseInt(arg.slice("--days=".length), 10);
      if (Number.isFinite(n) && n > 0 && n <= 365) days = n;
    }
  }
  return { siteSlug, days };
}

async function main() {
  await ensureSchema();
  const { siteSlug, days } = parseArgs();

  const targetSites = siteSlug
    ? await db()
        .select({ id: sites.id, slug: sites.slug, domain: sites.domain })
        .from(sites)
        .where(eq(sites.slug, siteSlug))
    : await db().select({ id: sites.id, slug: sites.slug, domain: sites.domain }).from(sites);

  if (targetSites.length === 0) {
    console.log("[sync:gsc] no matching sites");
    return;
  }

  console.log(
    `[sync:gsc] syncing ${targetSites.length} site${targetSites.length === 1 ? "" : "s"} · last ${days} days`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const site of targetSites) {
    const result = await syncGscForSite(site, days);
    if (result.ok) {
      console.log(`[sync:gsc]   ✓ ${site.slug} · ${result.written} days · ${result.property}`);
      await stampSyncStatus(site.id, "ok", null);
      ok++;
    } else if (result.reason === "not-connected") {
      console.log(`[sync:gsc]   · ${site.slug} · skipped (${result.error})`);
      skipped++;
    } else {
      console.warn(`[sync:gsc]   ✗ ${site.slug} · ${result.error}`);
      await stampSyncStatus(site.id, "error", result.error);
      failed++;
    }
  }

  console.log(`[sync:gsc] done · ok=${ok} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sync:gsc] fatal:", err);
    process.exit(1);
  });
