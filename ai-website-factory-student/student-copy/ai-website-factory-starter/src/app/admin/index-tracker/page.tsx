/**
 * /admin/index-tracker — Flat, all-sites index status tracker with manual
 * resubmit actions. Complements /admin/indexing (the per-site aggregate
 * dashboard) with a single filterable list across the whole network and a
 * one-click "Resubmit to IndexNow" action per URL or per site.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { indexingStatus, sitePages, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { QuotaCard } from "@/components/ui/QuotaCard";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { formatRelative } from "@/lib/utils";
import { getIndexNowQuota } from "@/lib/indexing/quota";
import { ResubmitButton, ResubmitAllButton } from "./ResubmitButton";
import { RemovalButton } from "./RemovalButton";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  indexed: "Indexed",
  not_indexed: "Not indexed",
  crawled_not_indexed: "Crawled · not indexed",
  discovered: "Discovered",
  duplicate: "Duplicate",
  excluded: "Excluded",
  unknown: "Unknown",
};
const STATE_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  indexed: "success",
  not_indexed: "danger",
  crawled_not_indexed: "warning",
  discovered: "warning",
  duplicate: "warning",
  excluded: "neutral",
  unknown: "neutral",
};

export default async function IndexTrackerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await ensureSchema();
  await requireAdmin();
  const sp = await searchParams;
  const { page, perPage } = pageParams(sp, 50);
  const filter = (sp.state as string) || "all";

  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(indexingStatus);

  if (total === 0) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-6">
        <PageHeader
          title="Index Tracker"
          subtitle="Flat, network-wide index status with one-click resubmit to IndexNow. Complements the per-site Indexing dashboard."
        />
        <TechnicalScoutTabs />
        <EmptyState
          glyph="search"
          title="No indexing data yet"
          description="The daily sync hasn't catalogued any pages. This needs a page list to inspect — either the GYL Suite plugin's page catalogue or a publicly reachable sitemap — independent of whether Google is connected. Check the Indexing page for per-site sync errors."
          action={{ label: "Go to Indexing", href: "/admin/indexing" }}
        />
      </div>
    );
  }

  const [summary] = await db()
    .select({
      indexed: sql<number>`count(*) filter (where ${indexingStatus.indexState} = 'indexed')::int`,
      notIndexed: sql<number>`count(*) filter (where ${indexingStatus.indexState} <> 'indexed')::int`,
      submitted: sql<number>`count(*) filter (where ${indexingStatus.lastSubmittedAt} is not null)::int`,
      crawledNotIndexed: sql<number>`count(*) filter (where ${indexingStatus.indexState} = 'crawled_not_indexed')::int`,
      removalRequested: sql<number>`count(*) filter (where ${indexingStatus.removalRequestedAt} is not null)::int`,
    })
    .from(indexingStatus);

  const quota = await getIndexNowQuota();

  const stateWhere =
    filter === "removal_requested"
      ? sql`${indexingStatus.removalRequestedAt} is not null`
      : filter !== "all"
        ? eq(indexingStatus.indexState, filter)
        : undefined;

  const rows = await db()
    .select({
      siteId: indexingStatus.siteId,
      siteName: sites.name,
      siteDomain: sites.domain,
      url: indexingStatus.url,
      indexState: indexingStatus.indexState,
      coverageState: indexingStatus.coverageState,
      lastCheckedAt: indexingStatus.lastCheckedAt,
      lastSubmittedAt: indexingStatus.lastSubmittedAt,
      submitSource: indexingStatus.submitSource,
      pageTitle: sitePages.title,
      removalRequestedAt: indexingStatus.removalRequestedAt,
      removalNote: indexingStatus.removalNote,
    })
    .from(indexingStatus)
    .innerJoin(sites, eq(sites.id, indexingStatus.siteId))
    .leftJoin(sitePages, sql`${sitePages.siteId} = ${indexingStatus.siteId} and ${sitePages.url} = ${indexingStatus.url}`)
    .where(stateWhere)
    .orderBy(desc(indexingStatus.lastCheckedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const totalFiltered = filter === "all" ? total : await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(indexingStatus)
    .where(stateWhere)
    .then((r) => r[0]?.n ?? 0);

  // Group not-indexed counts per site for the "resubmit all" button.
  const notIndexedBySite = await db()
    .select({
      siteId: indexingStatus.siteId,
      n: sql<number>`count(*)::int`,
    })
    .from(indexingStatus)
    .where(sql`${indexingStatus.indexState} <> 'indexed'`)
    .groupBy(indexingStatus.siteId);
  const notIndexedCountBySite = new Map(notIndexedBySite.map((r) => [r.siteId, r.n]));

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "indexed", label: "Indexed" },
    { key: "not_indexed", label: "Not indexed" },
    { key: "crawled_not_indexed", label: "Crawled · not indexed" },
    { key: "discovered", label: "Discovered" },
    { key: "removal_requested", label: "Removal requested" },
  ];

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Index Tracker"
        subtitle="Flat, network-wide index status with one-click resubmit to IndexNow. Complements the per-site Indexing dashboard."
      />

      <TechnicalScoutTabs />

      {(summary?.removalRequested ?? 0) > 0 && (
        <div className="rounded-lg border border-warning/25 bg-warning-tint px-3 py-2 text-xs text-warning">
          <span className="font-medium">{summary?.removalRequested} page{summary?.removalRequested === 1 ? "" : "s"} flagged for removal.</span>{" "}
          Google has no removal API for ordinary content pages (it&apos;s scoped to JobPosting/BroadcastEvent only) — flagging a
          page here doesn&apos;t call Google. To actually remove a page from the index: add a <code className="text-text-faint">noindex</code>{" "}
          meta tag or header in WordPress (the GYL Suite plugin&apos;s SEO panel can do this per-page), then wait for Google to
          recrawl — IndexNow re-submission speeds that recrawl signal up for Bing/Yandex.
        </div>
      )}

      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-5">
        <Stat label="Total tracked" value={total} />
        <Stat label="Indexed" value={summary?.indexed ?? 0} suffix={`/ ${total}`} tone="success" />
        <Stat label="Not indexed" value={summary?.notIndexed ?? 0} tone={(summary?.notIndexed ?? 0) > 0 ? "danger" : "neutral"} />
        <Stat label="Submitted to IndexNow" value={summary?.submitted ?? 0} tone="info" />
        <QuotaCard
          label="IndexNow quota"
          used={quota.used}
          cap={quota.cap}
          pct={quota.pct}
          tone={quota.tone}
          hint={quota.tone === "danger" ? "Near daily cap — submissions will be blocked once reached." : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filterOptions.map((f) => (
          <a
            key={f.key}
            href={`/admin/index-tracker${f.key === "all" ? "" : `?state=${f.key}`}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-accent text-accent-fg"
                : "border border-border text-text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-3 py-2.5">Page</th>
              <th className="px-3 py-2.5">Site</th>
              <th className="px-3 py-2.5">State</th>
              <th className="px-3 py-2.5 text-right">Last checked</th>
              <th className="px-3 py-2.5 text-right">IndexNow</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const path = r.url.replace(/^https?:\/\/[^/]+/, "") || "/";
              return (
                <tr key={`${r.siteId}-${r.url}-${i}`} className="border-b border-border last:border-0 align-top">
                  <td className="max-w-[360px] px-3 py-2.5">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-accent hover:underline">
                      {r.pageTitle ?? path}
                    </a>
                    {r.pageTitle && <div className="truncate text-text-faint">{path}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-text-muted">
                    {r.siteName}
                    <div className="text-text-faint">{r.siteDomain}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tone={STATE_TONE[r.indexState] ?? "neutral"}>{STATE_LABEL[r.indexState] ?? r.indexState}</Pill>
                    {r.coverageState && <div className="mt-1 text-text-faint">{r.coverageState}</div>}
                    {r.removalRequestedAt && (
                      <div className="mt-1">
                        <Pill tone="warning">Removal requested {formatRelative(r.removalRequestedAt)}</Pill>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-faint">
                    {r.lastCheckedAt ? formatRelative(r.lastCheckedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-faint">
                    {r.lastSubmittedAt ? formatRelative(r.lastSubmittedAt) : "not yet"}
                    {r.submitSource && <span className="ml-1 uppercase">{r.submitSource === "indexnow" ? "IN" : "API"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {r.indexState !== "indexed" ? <ResubmitButton siteId={r.siteId} url={r.url} /> : null}
                      <RemovalButton siteId={r.siteId} url={r.url} requested={!!r.removalRequestedAt} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-border px-3">
          <Pagination
            basePath="/admin/index-tracker"
            page={page}
            totalItems={totalFiltered}
            perPage={perPage}
            searchParams={sp}
          />
        </div>
      </div>

      {notIndexedBySite.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Bulk resubmit by site</h2>
          <div className="space-y-2">
            {notIndexedBySite.map((s) => (
              <div key={s.siteId} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
                <span className="text-xs text-text-muted">{s.n} not-indexed URL{s.n === 1 ? "" : "s"}</span>
                <ResubmitAllButton siteId={s.siteId} count={notIndexedCountBySite.get(s.siteId) ?? 0} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
