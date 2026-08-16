/**
 * /admin/indexing/[slug] — Per-site not-indexed URL list.
 *
 * The actionable view: every URL that isn't indexed, its reason, when it was
 * last crawled, and when we last pinged IndexNow. Sorted worst-first.
 *
 * Each not-indexed URL is LEFT-joined to its `site_pages` catalogue row so the
 * table can show the page title, post type and word count (with a thin-content
 * flag < 600w) instead of a bare slug — that's the context that tells you
 * whether "crawled, not indexed" means "expand this thin page" or not.
 */
import Link from "next/link";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, ensureSchema } from "@/db/client";
import { sites, indexingStatus, sitePages } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { QuotaCard } from "@/components/ui/QuotaCard";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { getIndexNowQuota } from "@/lib/indexing/quota";
import { ResubmitButton } from "@/app/admin/index-tracker/ResubmitButton";
import { RemovalButton } from "@/app/admin/index-tracker/RemovalButton";

export const dynamic = "force-dynamic";

const THIN_WORDS = 600;

const STATE_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  indexed: "success",
  not_indexed: "danger",
  crawled_not_indexed: "warning",
  discovered: "warning",
  duplicate: "warning",
  excluded: "neutral",
  unknown: "neutral",
};

export default async function SiteIndexingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await ensureSchema();
  await requireAdmin();
  const { slug } = await params;
  const sp = await searchParams;
  const { page, perPage } = pageParams(sp, 50);

  const [site] = await db().select({ id: sites.id, name: sites.name, domain: sites.domain }).from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) notFound();

  const notIndexedWhere = and(eq(indexingStatus.siteId, site.id), ne(indexingStatus.indexState, "indexed"));

  // Full not-indexed count drives the headline; the table shows one page.
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(indexingStatus)
    .where(notIndexedWhere);

  // Summary strip — computed over the FULL not-indexed set (not just the page).
  const [summary] = await db()
    .select({
      submitted: sql<number>`count(*) filter (where ${indexingStatus.lastSubmittedAt} is not null)::int`,
      crawledNotIndexed: sql<number>`count(*) filter (where ${indexingStatus.indexState} = 'crawled_not_indexed')::int`,
      notInSitemap: sql<number>`count(*) filter (where ${indexingStatus.inSitemap} = false)::int`,
      fromGsc: sql<number>`count(*) filter (where ${indexingStatus.detectionSource} = 'gsc')::int`,
    })
    .from(indexingStatus)
    .where(notIndexedWhere);

  // Whether GSC reached this site at all — drives the "why UNKNOWN?" explainer.
  const gscConnected = (summary?.fromGsc ?? 0) > 0;
  const quota = await getIndexNowQuota();

  const rows = await db()
    .select({
      url: indexingStatus.url,
      indexState: indexingStatus.indexState,
      coverageState: indexingStatus.coverageState,
      httpStatus: indexingStatus.httpStatus,
      inSitemap: indexingStatus.inSitemap,
      lastCheckedAt: indexingStatus.lastCheckedAt,
      lastCrawlAt: indexingStatus.lastCrawlAt,
      lastSubmittedAt: indexingStatus.lastSubmittedAt,
      submitSource: indexingStatus.submitSource,
      removalRequestedAt: indexingStatus.removalRequestedAt,
      // Joined from the site_pages catalogue (same site + matching URL).
      pageTitle: sitePages.title,
      postType: sitePages.postType,
      wordCount: sitePages.wordCount,
      pageStatus: sitePages.status,
    })
    .from(indexingStatus)
    .leftJoin(
      sitePages,
      and(eq(sitePages.siteId, indexingStatus.siteId), eq(sitePages.url, indexingStatus.url)),
    )
    .where(notIndexedWhere)
    .orderBy(indexingStatus.indexState, desc(indexingStatus.lastCheckedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <section className="space-y-2 pt-2">
        <Link href="/admin/indexing" className="text-xs text-text-faint hover:text-text">← Indexing</Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">{site.name} · not-indexed pages</h1>
        <p className="text-xs text-text-muted">{site.domain} · {total} URL(s) not indexed</p>
      </section>

      {total === 0 ? (
        <div className="rounded-md border border-border bg-surface p-6 text-center text-md text-text-muted">
          Every scanned URL is indexed.
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-5">
            <Stat label="Not indexed" value={total} tone={total > 0 ? "warning" : "neutral"} />
            <Stat
              label="Crawled · not indexed"
              value={summary?.crawledNotIndexed ?? 0}
              tone={(summary?.crawledNotIndexed ?? 0) > 0 ? "danger" : "neutral"}
            />
            <Stat label="Submitted to IndexNow" value={summary?.submitted ?? 0} tone="info" />
            <Stat
              label="Missing from sitemap"
              value={summary?.notInSitemap ?? 0}
              tone={(summary?.notInSitemap ?? 0) > 0 ? "warning" : "neutral"}
            />
            <QuotaCard label="IndexNow quota" used={quota.used} cap={quota.cap} pct={quota.pct} tone={quota.tone} />
          </div>

          {!gscConnected && (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-xs text-text-muted">
              <span className="font-medium text-text">Why does STATE / REASON read “unknown”?</span>{" "}
              Search Console isn’t connected for this site yet, so we can only see that a URL is missing from
              Google’s index — not the authoritative reason. The real “why not indexed” (thin / duplicate /
              crawl-budget) comes from GSC URL Inspection. Connect it in the site’s settings to fill this in.
              IndexNow submission keeps running regardless and still speeds discovery.
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-faint">
                <tr>
                  <th className="px-3 py-2">Page</th>
                  <th className="px-3 py-2">State / reason</th>
                  <th className="px-3 py-2 text-right">Last crawl</th>
                  <th className="px-3 py-2 text-right">IndexNow</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const path = r.url.replace(/^https?:\/\/[^/]+/, "") || "/";
                  const thin = r.wordCount != null && r.wordCount < THIN_WORDS;
                  return (
                    <tr key={r.url} className="border-b border-border last:border-0 align-top">
                      <td className="max-w-[460px] px-3 py-2">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-accent hover:underline">
                          {r.pageTitle ?? path}
                        </a>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-text-faint">
                          {r.pageTitle && <span className="truncate text-xs">{path}</span>}
                          {r.postType && <Pill tone="neutral">{r.postType}</Pill>}
                          {r.wordCount != null && (
                            <span className="text-xs">{r.wordCount.toLocaleString()}w</span>
                          )}
                          {thin && <Pill tone="warning">thin</Pill>}
                          {r.pageStatus && r.pageStatus !== "publish" && (
                            <Pill tone="neutral">{r.pageStatus}</Pill>
                          )}
                          {!r.inSitemap && <Pill tone="warning">not in sitemap</Pill>}
                          {r.pageTitle == null && (
                            <span className="text-xs italic">not in page catalogue</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Pill tone={STATE_TONE[r.indexState] ?? "neutral"}>{r.indexState}</Pill>
                        {r.coverageState && <span className="ml-2 text-text-faint">{r.coverageState}</span>}
                        {r.httpStatus != null && r.httpStatus >= 400 && (
                          <span className="ml-2"><Pill tone="danger">HTTP {r.httpStatus}</Pill></span>
                        )}
                        {r.removalRequestedAt && (
                          <span className="ml-2"><Pill tone="warning">removal requested</Pill></span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-text-faint">
                        {r.lastCrawlAt ? formatRelative(r.lastCrawlAt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-text-faint">
                        {r.lastSubmittedAt ? formatRelative(r.lastSubmittedAt) : "not yet"}
                        {r.lastSubmittedAt && r.submitSource && (
                          <span className="ml-1 text-xs uppercase">{r.submitSource === "indexnow" ? "IN" : "API"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <ResubmitButton siteId={site.id} url={r.url} />
                          <RemovalButton siteId={site.id} url={r.url} requested={!!r.removalRequestedAt} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border px-3">
              <Pagination
                basePath={`/admin/indexing/${slug}`}
                page={page}
                totalItems={total}
                perPage={perPage}
                searchParams={sp}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
