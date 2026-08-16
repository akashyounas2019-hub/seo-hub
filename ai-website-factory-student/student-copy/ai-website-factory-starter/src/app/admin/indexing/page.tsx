/**
 * /admin/indexing — Network indexing dashboard.
 *
 * Per-site indexed ratio + the not-indexed URL list grouped by reason. The
 * reason (from GSC URL Inspection) is what tells you whether to fix content
 * ("Crawled - not indexed" = thin/dupe) or just wait ("Discovered" = crawl
 * budget). IndexNow submission state shows what we've already pushed.
 */
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, indexingStatus, sitePages } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { runIndexingSyncAction } from "@/app/actions/index-tracker";

const THIN_WORDS = 600;

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  indexed: "Indexed",
  not_indexed: "Not indexed",
  crawled_not_indexed: "Crawled · not indexed",
  discovered: "Discovered · not indexed",
  duplicate: "Duplicate",
  excluded: "Excluded",
  unknown: "Unknown",
};
const STATE_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  indexed: "success",
  not_indexed: "danger",
  crawled_not_indexed: "warning",
  discovered: "warning",
  duplicate: "warning",
  excluded: "neutral",
  unknown: "neutral",
};
const STATE_HINT: Record<string, string> = {
  crawled_not_indexed: "Google crawled it and judged it thin/duplicate. Fix: expand unique content, add internal links, consolidate near-dupes.",
  discovered: "Found but not yet crawled — usually crawl-budget. Fix: internal links from indexed pages, IndexNow (already submitting).",
  duplicate: "Google picked a different canonical. Fix: check canonical tags + make the page meaningfully different.",
  not_indexed: "Not in the index. Could be quality or a noindex/canonical issue — open the URL in GSC for the specific reason.",
  excluded: "Intentionally or technically excluded (noindex / redirect / robots). Usually expected.",
  unknown: "Couldn't determine — connect Google Search Console for the authoritative reason.",
};

export default async function IndexingPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; failed?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const failedReasonBySlug = new Map(
    (searchParams.failed ?? "")
      .split("|")
      .filter(Boolean)
      .map((pair) => {
        const [slug, ...rest] = pair.split("::");
        return [slug, rest.join("::")] as const;
      }),
  );
  const allSites = await db().select({ id: sites.id, slug: sites.slug, name: sites.name, domain: sites.domain }).from(sites);

  // Aggregate per site × state.
  const agg = await db()
    .select({
      siteId: indexingStatus.siteId,
      indexState: indexingStatus.indexState,
      n: sql<number>`count(*)::int`,
      detection: sql<string>`max(${indexingStatus.detectionSource})`,
      lastChecked: sql<Date>`max(${indexingStatus.lastCheckedAt})`,
      submitted: sql<number>`count(*) filter (where ${indexingStatus.lastSubmittedAt} is not null)::int`,
    })
    .from(indexingStatus)
    .groupBy(indexingStatus.siteId, indexingStatus.indexState);

  // Per-site thin-content count among NOT-indexed pages — joined to the page
  // catalogue by URL so we can show "N thin" on each card without a new column.
  const thinAgg = await db()
    .select({
      siteId: indexingStatus.siteId,
      thin: sql<number>`count(*)::int`,
    })
    .from(indexingStatus)
    .innerJoin(
      sitePages,
      and(eq(sitePages.siteId, indexingStatus.siteId), eq(sitePages.url, indexingStatus.url)),
    )
    .where(and(sql`${indexingStatus.indexState} <> 'indexed'`, sql`${sitePages.wordCount} < ${THIN_WORDS}`))
    .groupBy(indexingStatus.siteId);
  const thinBySite = new Map(thinAgg.map((r) => [r.siteId, r.thin]));

  type SiteAgg = {
    total: number;
    indexed: number;
    submitted: number;
    byState: Map<string, number>;
    detection: string;
    lastChecked: Date | null;
  };
  const bySite = new Map<string, SiteAgg>();
  for (const r of agg) {
    let s = bySite.get(r.siteId);
    if (!s) { s = { total: 0, indexed: 0, submitted: 0, byState: new Map(), detection: r.detection, lastChecked: r.lastChecked }; bySite.set(r.siteId, s); }
    s.total += r.n;
    s.submitted += r.submitted;
    s.byState.set(r.indexState, r.n);
    if (r.indexState === "indexed") s.indexed += r.n;
    if (r.lastChecked && (!s.lastChecked || r.lastChecked > s.lastChecked)) s.lastChecked = r.lastChecked;
  }

  const anyData = agg.length > 0;

  // Network roll-up for the summary strip.
  let netTotal = 0, netIndexed = 0, netSubmitted = 0, netThin = 0, netNoSitemap = 0;
  for (const s of bySite.values()) {
    netTotal += s.total;
    netIndexed += s.indexed;
    netSubmitted += s.submitted;
  }
  for (const n of thinBySite.values()) netThin += n;
  if (anyData) {
    const [{ noSitemap }] = await db()
      .select({ noSitemap: sql<number>`count(*) filter (where ${indexingStatus.inSitemap} = false)::int` })
      .from(indexingStatus);
    netNoSitemap = noSitemap ?? 0;
  }
  const netRatio = netTotal > 0 ? Math.round((netIndexed / netTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Indexing status"
        subtitle="Per-site indexed ratio from the daily sync. Where Search Console is connected, each not-indexed page carries its real reason. We auto-submit not-indexed pages to IndexNow — that speeds discovery, but doesn't override Google's quality call on thin pages."
        actions={
          <form action={runIndexingSyncAction}>
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-brand-navy-deep shadow-sm transition-colors hover:bg-accent-hover focus-visible:shadow-glow"
            >
              Run sync now
            </button>
          </form>
        }
      />

      {searchParams.ok ? (
        <div className="rounded-lg border border-success/25 bg-success-tint px-3 py-2 text-sm text-success">
          {{ "sync-ran": "Sync ran — index status below is fresh." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}
      {failedReasonBySlug.size > 0 ? (
        <div className="rounded-lg border border-warning/25 bg-warning-tint px-3 py-2 text-sm text-warning">
          {failedReasonBySlug.size} site{failedReasonBySlug.size === 1 ? "" : "s"} couldn&apos;t be synced this run:{" "}
          {[...failedReasonBySlug.entries()].map(([slug, reason]) => `${slug} (${reason})`).join("; ")}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-lg border border-danger/25 bg-danger-tint px-3 py-2 text-sm text-danger">
          {{ "sync-found-no-pages": "Sync ran but found no page URLs for any site — connect the GYL Suite plugin or check each site's sitemap." }[
            searchParams.error
          ] ?? searchParams.error}
        </div>
      ) : null}

      <TechnicalScoutTabs />

      {!anyData ? (
        <EmptyState
          glyph="search"
          title="No indexing data yet"
          description="The daily sync hasn't catalogued any pages. Connecting Search Console only sharpens the not-indexed reason — the sync first needs a page list, from either the GYL Suite plugin's page catalogue or a publicly reachable sitemap. Click “Run sync now” above to retry and see per-site errors."
        />
      ) : (
      <>
      <StatStrip columns={5}>
        <Stat label="URLs tracked" value={netTotal} />
        <Stat label="Indexed" value={netIndexed} suffix={`/ ${netTotal}`} tone={netRatio >= 70 ? "success" : netRatio >= 40 ? "warning" : "danger"} delta={`${netRatio}%`} deltaTone={netRatio >= 70 ? "up" : "neutral"} />
        <Stat label="Submitted to IndexNow" value={netSubmitted} tone="info" />
        <Stat label="Thin (< 600w)" value={netThin} tone={netThin > 0 ? "warning" : "neutral"} />
        <Stat label="Missing from sitemap" value={netNoSitemap} tone={netNoSitemap > 0 ? "warning" : "neutral"} />
      </StatStrip>
      <section className="space-y-3">
        {allSites.map((site) => {
          const a = bySite.get(site.id);
          if (!a) {
            const failReason = failedReasonBySlug.get(site.slug);
            return (
              <article key={site.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                <header className="flex items-baseline justify-between gap-2">
                  <Link href={`/admin/sites/${site.slug}`} className="text-sm font-medium text-text hover:underline">{site.name}</Link>
                  <span className="text-xs text-text-faint">{failReason ? "sync failed" : "not yet scanned"}</span>
                </header>
                {failReason ? (
                  <p className="mt-1 text-xs text-danger">
                    {failReason} — GSC/GA4 being connected doesn&apos;t help here: we couldn&apos;t find any page URLs to
                    inspect. Install the GYL Suite plugin on this site (feeds the page catalogue) or make sure{" "}
                    <code className="text-text-faint">/sitemap.xml</code> is publicly reachable.
                  </p>
                ) : null}
              </article>
            );
          }
          const ratio = a.total > 0 ? a.indexed / a.total : 0;
          const ratioTone = ratio >= 0.7 ? "success" : ratio >= 0.4 ? "warning" : "danger";
          const problemStates = ["crawled_not_indexed", "discovered", "duplicate", "not_indexed"] as const;
          const thin = thinBySite.get(site.id) ?? 0;
          return (
            <article key={site.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/admin/sites/${site.slug}`} className="text-sm font-medium text-text hover:underline">{site.name}</Link>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={ratioTone}>{a.indexed}/{a.total} indexed ({Math.round(ratio * 100)}%)</Pill>
                  {a.submitted > 0 && <Pill tone="info">{a.submitted} submitted</Pill>}
                  {thin > 0 && <Pill tone="warning">{thin} thin</Pill>}
                  <span className="text-xs text-text-faint">
                    {a.detection === "gsc" ? "GSC" : "HTTP-only"} · {a.lastChecked ? formatRelative(a.lastChecked) : "—"}
                  </span>
                </div>
              </header>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...a.byState.entries()]
                  .sort((x, y) => y[1] - x[1])
                  .map(([state, n]) => (
                    <Pill key={state} tone={STATE_TONE[state] ?? "neutral"}>
                      {STATE_LABEL[state] ?? state}: {n}
                    </Pill>
                  ))}
              </div>
              {/* Reason hints for the problem buckets present on this site */}
              <div className="mt-3 space-y-1">
                {problemStates
                  .filter((st) => (a.byState.get(st) ?? 0) > 0)
                  .map((st) => (
                    <p key={st} className="text-xs text-text-faint">
                      <span className="font-medium text-text-muted">{STATE_LABEL[st]} ({a.byState.get(st)}):</span> {STATE_HINT[st]}
                    </p>
                  ))}
                {a.detection !== "gsc" && (a.byState.get("unknown") ?? 0) > 0 && (
                  <p className="text-xs text-text-faint">
                    <span className="font-medium text-text-muted">Reason is “unknown”</span> because Search Console
                    isn’t connected here — we can see what’s missing from the index, but the authoritative “why”
                    needs GSC URL Inspection. IndexNow submission still runs.
                  </p>
                )}
              </div>
              <div className="mt-3">
                <Link
                  href={`/admin/indexing/${site.slug}`}
                  className="text-xs text-accent hover:underline"
                >
                  View not-indexed URLs →
                </Link>
              </div>
            </article>
          );
        })}
      </section>
      </>
      )}
    </div>
  );
}
