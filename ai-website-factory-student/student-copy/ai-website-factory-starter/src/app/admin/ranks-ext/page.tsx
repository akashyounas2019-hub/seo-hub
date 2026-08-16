/**
 * /admin/ranks-ext — Network rank dashboard powered by daily SERP snapshots.
 *
 * Each tracked keyword × site gets a line: today's rank, 7-day delta, 30-day
 * mini trend. Click into a row to drill into the SERP top-10 history.
 *
 * Distinct from the existing /admin/keywords which is the manual-tracking
 * Phase 1.5 view. This page powers Phase 3 outcome tracking.
 */
import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, trackedKeywordsExt, serpSnapshots, backlinksSnapshots } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function rankTone(rank: number | null | undefined): "success" | "warning" | "danger" | "neutral" {
  if (rank == null) return "neutral";
  if (rank <= 3) return "success";
  if (rank <= 10) return "warning";
  return "danger";
}
function deltaTone(delta: number | null): "success" | "warning" | "danger" | "neutral" {
  if (delta == null || delta === 0) return "neutral";
  if (delta < 0) return "success"; // ranks went down (improved)
  return "danger";
}

export default async function RanksExtPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await ensureSchema();
  await requireAdmin();
  const sp = await searchParams;
  const { page, perPage } = pageParams(sp, 50);

  const since30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);

  // Full count of active trackers — drives the pager total.
  const [{ trackerTotal }] = await db()
    .select({ trackerTotal: sql<number>`count(*)::int` })
    .from(trackedKeywordsExt)
    .where(eq(trackedKeywordsExt.active, true));

  // Pull active tracker rows (one page) + latest 30 days of snapshots.
  const trackers = await db()
    .select({
      trackerId: trackedKeywordsExt.id,
      siteId: trackedKeywordsExt.siteId,
      siteSlug: sites.slug,
      siteName: sites.name,
      keyword: trackedKeywordsExt.keyword,
      deviceType: trackedKeywordsExt.deviceType,
    })
    .from(trackedKeywordsExt)
    .innerJoin(sites, eq(sites.id, trackedKeywordsExt.siteId))
    .where(eq(trackedKeywordsExt.active, true))
    .orderBy(trackedKeywordsExt.id)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const trackerIds = trackers.map((t) => t.trackerId);
  const recentSnaps = trackerIds.length > 0
    ? await db()
        .select({
          trackerId: serpSnapshots.trackedKeywordId,
          snapshotDate: serpSnapshots.snapshotDate,
          rank: serpSnapshots.rank,
        })
        .from(serpSnapshots)
        .where(and(gte(serpSnapshots.snapshotDate, since30)))
        .orderBy(serpSnapshots.snapshotDate)
    : [];

  const byTracker = new Map<string, Array<{ date: string; rank: number | null }>>();
  for (const s of recentSnaps) {
    const arr = byTracker.get(s.trackerId) ?? [];
    arr.push({ date: s.snapshotDate, rank: s.rank });
    byTracker.set(s.trackerId, arr);
  }

  // Network-wide backlink summary (latest snapshot per site).
  const latestBacklinks = await db()
    .select({
      siteId: backlinksSnapshots.siteId,
      maxDate: sql<string>`max(${backlinksSnapshots.snapshotDate})`.as("md"),
    })
    .from(backlinksSnapshots)
    .groupBy(backlinksSnapshots.siteId)
    .as("lbl");

  const blRows = await db()
    .select({
      siteId: backlinksSnapshots.siteId,
      siteSlug: sites.slug,
      siteName: sites.name,
      snapshotDate: backlinksSnapshots.snapshotDate,
      totalBacklinks: backlinksSnapshots.totalBacklinks,
      totalRefDomains: backlinksSnapshots.totalRefDomains,
      newBacklinks: backlinksSnapshots.newBacklinks,
      lostBacklinks: backlinksSnapshots.lostBacklinks,
      domainRank: backlinksSnapshots.domainRank,
    })
    .from(backlinksSnapshots)
    .innerJoin(latestBacklinks, eq(latestBacklinks.siteId, backlinksSnapshots.siteId))
    .innerJoin(sites, eq(sites.id, backlinksSnapshots.siteId))
    .where(eq(backlinksSnapshots.snapshotDate, latestBacklinks.maxDate));

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <section className="space-y-3 pt-2">
        <p className="text-xs text-text-faint">Network operations · SEO outcomes</p>
        <h1 className="text-3xl font-medium tracking-tightish text-text">SEO outcome tracking</h1>
        <p className="max-w-[68ch] text-md text-text-muted">
          Daily SERP rank tracking + weekly backlink snapshots, populated by external workers via the ingest endpoints.
          DataForSEO is the recommended source; any scraper works as long as it POSTs to{" "}
          <code className="font-mono text-xs">/api/ingest/serp-snapshots</code> with the bearer token.
        </p>
        {trackerTotal === 0 && (
          <p className="text-md text-warning">
            No tracked keywords yet. POST to <code className="font-mono">/api/ingest/serp-snapshots</code> and the keyword auto-registers.
          </p>
        )}
      </section>

      {/* Backlinks row */}
      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Backlinks</h2>
        {blRows.length === 0 ? (
          <div className="rounded-md border border-border bg-surface p-4 text-xs text-text-muted">
            No backlink snapshots yet.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {blRows.map((r) => (
              <article key={r.siteId} className="rounded-md border border-border bg-surface p-3 text-xs">
                <header className="flex items-baseline justify-between gap-2">
                  <Link href={`/admin/sites/${r.siteSlug}`} className="font-medium text-text hover:underline">
                    {r.siteName}
                  </Link>
                  <span className="text-xs text-text-faint">{r.snapshotDate}</span>
                </header>
                <div className="mt-2 grid grid-cols-2 gap-2 text-text-muted">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-text-faint">Backlinks</div>
                    <div className="text-sm text-text">{r.totalBacklinks.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-text-faint">Ref domains</div>
                    <div className="text-sm text-text">{r.totalRefDomains.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-text-faint">+New (week)</div>
                    <div className="text-success">+{r.newBacklinks.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-text-faint">−Lost</div>
                    <div className="text-danger">−{r.lostBacklinks.toLocaleString()}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Keyword ranks */}
      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Tracked keywords</h2>
        {trackerTotal === 0 ? null : (
          <div className="rounded-lg border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-faint">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">Keyword</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2 text-right">Latest rank</th>
                  <th className="px-3 py-2 text-right">7-day Δ</th>
                </tr>
              </thead>
              <tbody>
                {trackers.map((t) => {
                  const series = byTracker.get(t.trackerId) ?? [];
                  const latest = series[series.length - 1];
                  let delta: number | null = null;
                  if (series.length >= 2 && latest?.rank != null) {
                    const sevenAgo = series.find((s) =>
                      new Date(s.date).getTime() <= new Date(latest.date).getTime() - 6 * 24 * 3600_000
                    );
                    if (sevenAgo?.rank != null) delta = latest.rank - sevenAgo.rank;
                  }
                  return (
                    <tr key={t.trackerId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/admin/sites/${t.siteSlug}`} className="text-accent hover:underline">
                          {t.siteName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-medium text-text">{t.keyword}</td>
                      <td className="px-3 py-2 text-text-faint">{t.deviceType}</td>
                      <td className="px-3 py-2 text-right">
                        <Pill tone={rankTone(latest?.rank)}>{latest?.rank ?? "—"}</Pill>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {delta != null ? (
                          <Pill tone={deltaTone(delta)}>{delta > 0 ? `+${delta}` : delta}</Pill>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border px-3">
              <Pagination
                basePath="/admin/ranks-ext"
                page={page}
                totalItems={trackerTotal}
                perPage={perPage}
                searchParams={sp}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
