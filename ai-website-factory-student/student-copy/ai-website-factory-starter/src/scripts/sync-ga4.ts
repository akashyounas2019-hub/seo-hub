/**
 * GA4 (Google Analytics 4) sync — daily CLI cron.
 *
 * Pulls the last 28 days of daily sessions / users / conversions / engagement
 * rate per connected site into `traffic_snapshots` (`source='ga4'`).
 *
 * Business logic lives in `src/lib/ga4-sync.ts` so the per-site "Sync now"
 * button shares the exact same code path.
 *
 * Prereq: each site's `integrations_accounts.metadata.ga4_property_id` must
 * be set (numeric, e.g. "312345678"). Sites without one are skipped and
 * logged as "no-property-id".
 *
 * Usage:
 *   npm run sync:ga4                 # every site, last 28d
 *   npm run sync:ga4 -- --site=slug  # one site
 *   npm run sync:ga4 -- --days=90    # override lookback window
 *
 * Suggested cron: `10 4 * * *` (daily 04:10 UTC — right after GSC).
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { sites } from "../db/schema";
import { syncGa4ForSite } from "../lib/ga4-sync";
import { stampSyncStatus } from "../lib/gsc-sync";

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
    console.log("[sync:ga4] no matching sites");
    return;
  }

  console.log(
    `[sync:ga4] syncing ${targetSites.length} site${targetSites.length === 1 ? "" : "s"} · last ${days} days`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const site of targetSites) {
    const result = await syncGa4ForSite(site, days);
    if (result.ok) {
      console.log(`[sync:ga4]   ✓ ${site.slug} · ${result.written} days · property=${result.propertyId}`);
      await stampSyncStatus(site.id, "ok", null);
      ok++;
    } else if (result.reason === "not-connected" || result.reason === "no-property-id") {
      console.log(`[sync:ga4]   · ${site.slug} · skipped (${result.error})`);
      skipped++;
    } else {
      console.warn(`[sync:ga4]   ✗ ${site.slug} · ${result.error}`);
      await stampSyncStatus(site.id, "error", result.error);
      failed++;
    }
  }

  console.log(`[sync:ga4] done · ok=${ok} skipped=${skipped} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sync:ga4] fatal:", err);
    process.exit(1);
  });
