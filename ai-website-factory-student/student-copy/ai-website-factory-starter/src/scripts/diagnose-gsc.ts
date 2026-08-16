/**
 * End-to-end GSC diagnostic. Reports whether:
 *   1. Google OAuth accounts are stored per site
 *   2. gsc_query_snapshots + gsc_page_snapshots + traffic_snapshots have rows
 *   3. The dashboard reader query window (last 28d / 12w) actually matches
 *   4. Whether the stored token is still fresh
 *
 * Read-only. Safe to run any time.
 *
 * Usage:
 *   npx tsx src/scripts/diagnose-gsc.ts
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  gscPageSnapshots,
  gscQuerySnapshots,
  integrationsAccounts,
  sites,
  trafficSnapshots,
} from "@/db/schema";

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

async function main(): Promise<void> {
  await ensureSchema();
  const d = db();
  const now = new Date();
  const cutoff28 = new Date(now.getTime() - 28 * 24 * 3600_000);
  const cutoff12w = new Date(now.getTime() - 12 * 7 * 24 * 3600_000);

  console.log("═══════════════════════════════════════════════════");
  console.log("GSC DIAGNOSTIC");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Now: ${now.toISOString()}`);
  console.log(`28-day cutoff: ${iso(cutoff28)}`);
  console.log(`12-week cutoff: ${iso(cutoff12w)}`);
  console.log();

  // Step 1: Sites in the network
  const siteRows = await d.select().from(sites);
  console.log(`STEP 1 · Sites in network: ${siteRows.length}`);
  for (const s of siteRows) {
    console.log(`  · ${s.slug} → ${s.domain} (id: ${s.id})`);
  }
  console.log();

  // Step 2: Google OAuth accounts
  const googleAccounts = await d
    .select()
    .from(integrationsAccounts)
    .where(eq(integrationsAccounts.provider, "google"));
  console.log(`STEP 2 · Google OAuth accounts: ${googleAccounts.length}`);
  for (const a of googleAccounts) {
    const site = siteRows.find((s) => s.id === a.siteId);
    const meta = a.metadata as Record<string, unknown> | null;
    console.log(`  · site: ${site?.slug ?? a.siteId}`);
    console.log(`    account_id_remote: ${a.accountIdRemote ?? "(null)"}`);
    console.log(`    has_access_token_ciphertext: ${!!a.accessTokenCiphertext}`);
    console.log(`    has_refresh_token_ciphertext: ${!!a.refreshTokenCiphertext}`);
    console.log(`    token_expires_at: ${a.tokenExpiresAt?.toISOString() ?? "(null)"}`);
    console.log(`    last_sync_at: ${a.lastSyncAt?.toISOString() ?? "(never)"}`);
    console.log(`    last_sync_status: ${a.lastSyncStatus ?? "(never)"}`);
    console.log(`    last_sync_error: ${a.lastSyncError ?? "(none)"}`);
    console.log(`    scopes: ${a.scopes ?? "(none)"}`);
    console.log(`    metadata.ga4_property_id: ${(meta?.ga4_property_id as string | undefined) ?? "(not set)"}`);
    console.log(`    metadata.gsc_site_url: ${(meta?.gsc_site_url as string | undefined) ?? "(not set)"}`);
  }
  console.log();

  // Step 3: GSC query snapshots — total count
  const [gscQueryTotal] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(gscQuerySnapshots);
  console.log(`STEP 3 · gsc_query_snapshots rows (all time): ${gscQueryTotal?.c ?? 0}`);

  const [gscQuery28d] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(gscQuerySnapshots)
    .where(gte(gscQuerySnapshots.snapshotDate, iso(cutoff28)));
  console.log(`  · rows within last 28d (${iso(cutoff28)}..): ${gscQuery28d?.c ?? 0}`);

  const [gscQuery12w] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(gscQuerySnapshots)
    .where(gte(gscQuerySnapshots.snapshotDate, iso(cutoff12w)));
  console.log(`  · rows within last 12w (${iso(cutoff12w)}..): ${gscQuery12w?.c ?? 0}`);

  const gscQueryDateRange = await d
    .select({
      minDate: sql<string>`min(${gscQuerySnapshots.snapshotDate})`,
      maxDate: sql<string>`max(${gscQuerySnapshots.snapshotDate})`,
    })
    .from(gscQuerySnapshots);
  console.log(`  · date range in table: ${gscQueryDateRange[0]?.minDate ?? "(empty)"} .. ${gscQueryDateRange[0]?.maxDate ?? "(empty)"}`);

  // Sample rows
  const gscSample = await d
    .select({
      siteId: gscQuerySnapshots.siteId,
      query: gscQuerySnapshots.query,
      snapshotDate: gscQuerySnapshots.snapshotDate,
      clicks: gscQuerySnapshots.clicks,
      impressions: gscQuerySnapshots.impressions,
    })
    .from(gscQuerySnapshots)
    .orderBy(desc(gscQuerySnapshots.snapshotDate))
    .limit(5);
  console.log("  · newest 5 rows:");
  for (const r of gscSample) {
    const site = siteRows.find((s) => s.id === r.siteId);
    console.log(`    [${r.snapshotDate}] site=${site?.slug ?? r.siteId} q="${r.query}" clicks=${r.clicks} impressions=${r.impressions}`);
  }
  console.log();

  // Step 4: GSC page snapshots
  const [gscPageTotal] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(gscPageSnapshots);
  const [gscPage28d] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(gscPageSnapshots)
    .where(gte(gscPageSnapshots.snapshotDate, iso(cutoff28)));
  console.log(`STEP 4 · gsc_page_snapshots rows: all=${gscPageTotal?.c ?? 0}, 28d=${gscPage28d?.c ?? 0}`);
  console.log();

  // Step 5: Traffic snapshots
  const [gscTrafficTotal] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.source, "gsc"));
  const [gscTraffic12w] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(trafficSnapshots)
    .where(and(
      eq(trafficSnapshots.source, "gsc"),
      gte(trafficSnapshots.snapshotDate, iso(cutoff12w)),
    ));
  console.log(`STEP 5 · traffic_snapshots (source='gsc') rows: all=${gscTrafficTotal?.c ?? 0}, 12w=${gscTraffic12w?.c ?? 0}`);

  const [ga4TrafficTotal] = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.source, "ga4"));
  console.log(`  · traffic_snapshots (source='ga4') rows: ${ga4TrafficTotal?.c ?? 0}`);
  console.log();

  // Step 6: Verdict
  console.log("═══════════════════════════════════════════════════");
  console.log("VERDICT");
  console.log("═══════════════════════════════════════════════════");
  const hasAccount = googleAccounts.length > 0;
  const hasQueryData28d = (gscQuery28d?.c ?? 0) > 0;
  const hasQueryDataEver = (gscQueryTotal?.c ?? 0) > 0;

  if (!hasAccount) {
    console.log("BLOCKER: no Google OAuth account row in integrations_accounts.");
    console.log("→ Connect GSC from /admin/sites/<slug> (or the Analytics screen).");
  } else if (!hasQueryDataEver) {
    console.log("BLOCKER: OAuth is stored but no GSC data has been synced yet.");
    console.log("→ Run: npm run sync:gsc");
    const stale = googleAccounts.find((a) => !a.lastSyncAt);
    if (stale) console.log("→ The account has never been synced (last_sync_at is null).");
    const failed = googleAccounts.find((a) => a.lastSyncStatus === "error");
    if (failed) {
      console.log(`→ Prior sync attempt failed: ${failed.lastSyncError ?? "(no message)"}`);
    }
  } else if (!hasQueryData28d) {
    console.log("BLOCKER: data exists but nothing lands inside the dashboard's 28-day window.");
    console.log(`→ Newest snapshot: ${gscQueryDateRange[0]?.maxDate}`);
    console.log(`→ Dashboard cutoff: ${iso(cutoff28)}`);
    console.log("→ Data is stale. Re-run: npm run sync:gsc");
  } else {
    console.log("PIPELINE OK: GSC data is present and within the dashboard window.");
    console.log("→ If dashboards still look empty, the frontend query is at fault. Share");
    console.log("  which specific screen looks empty and I'll trace its reader.");
  }
}

main().catch((err) => {
  console.error("DIAGNOSTIC_FAILED:", err instanceof Error ? err.message : String(err));
  console.error(err);
  process.exit(1);
});
