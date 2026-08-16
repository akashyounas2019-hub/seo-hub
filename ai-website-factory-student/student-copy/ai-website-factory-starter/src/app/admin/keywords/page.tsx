/**
 * /admin/keywords — Unified keyword hub with three tabs:
 *   1. Keyword Scout  — network-wide tracked keywords from GSC / SEMrush
 *   2. Rank Tracker   — per-site rank tracking with GSC + SEMrush movement data
 *   3. Keyword Lists  — saved keyword lists for content planning
 */
import Link from "next/link";
import { eq, desc, inArray } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, trackedKeywords, trackedKeywordsExt, serpSnapshots } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { hasSemrushKey } from "@/lib/semrush";
import { Pagination, pageParams, paginate, type SearchParams } from "@/components/ui/Pagination";
import { SemrushResearch } from "./SemrushResearch";
import { KeywordTabs, type KeywordTab } from "./KeywordTabs";
import { getKeywordLists } from "@/app/actions/keyword-lists";
import { KeywordListActions } from "../keyword-lists/KeywordListActions";
import { RankTrackerView } from "./RankTrackerView";
import { ImportedKeywordsWidget } from "./ImportedKeywordsWidget";
import { KeywordListImport } from "./KeywordListImport";

export const dynamic = "force-dynamic";

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await ensureSchema();
  await requireAdmin();
  const sp = await searchParams;
  const tab = (sp.tab as KeywordTab) || "scout";
  const { page, perPage } = pageParams(sp, 50);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Keyword Scout"
        subtitle="Research, track, and organize keywords across your entire network — powered by GSC and SEMrush."
      />

      <KeywordTabs active={tab} />

      {tab === "scout" && (
        <ScoutView page={page} perPage={perPage} sp={sp} />
      )}
      {tab === "rank-tracker" && (
        <>
          <RankTrackerView />
          <ImportedKeywordsWidget />
        </>
      )}
      {tab === "lists" && (
        <ListsView />
      )}
    </div>
  );
}

/* ── Scout tab (original Keywords page content) ── */
async function ScoutView({ page, perPage, sp }: { page: number; perPage: number; sp: SearchParams }) {
  const rows = await db()
    .select({
      id: trackedKeywords.id,
      siteId: trackedKeywords.siteId,
      domain: sites.domain,
      keyword: trackedKeywords.keyword,
      targetUrl: trackedKeywords.targetUrl,
      location: trackedKeywords.location,
      device: trackedKeywords.device,
      source: trackedKeywords.source,
      lastPosition: trackedKeywords.lastPosition,
      lastCheckedAt: trackedKeywords.lastCheckedAt,
      weeksOffP1: trackedKeywords.weeksOffP1,
      weeksOffP2: trackedKeywords.weeksOffP2,
      weeksOffP3: trackedKeywords.weeksOffP3,
      refreshFlaggedAt: trackedKeywords.refreshFlaggedAt,
    })
    .from(trackedKeywords)
    .leftJoin(sites, eq(sites.id, trackedKeywords.siteId))
    .where(eq(trackedKeywords.enabled, true))
    .orderBy(desc(trackedKeywords.weeksOffP1), desc(trackedKeywords.weeksOffP3))
    .limit(500);

  const siteIds = Array.from(new Set(rows.map((r) => r.siteId)));
  const volBySiteKeyword = new Map<string, number>();
  const prevPosBySiteKeyword = new Map<string, number>();
  if (siteIds.length > 0) {
    const snaps = await db()
      .select({
        siteId: serpSnapshots.siteId,
        keyword: trackedKeywordsExt.keyword,
        rank: serpSnapshots.rank,
        searchVolume: serpSnapshots.searchVolume,
        snapshotDate: serpSnapshots.snapshotDate,
      })
      .from(serpSnapshots)
      .innerJoin(trackedKeywordsExt, eq(trackedKeywordsExt.id, serpSnapshots.trackedKeywordId))
      .where(inArray(serpSnapshots.siteId, siteIds))
      .orderBy(desc(serpSnapshots.snapshotDate))
      .limit(2000);
    const seenLatest = new Set<string>();
    const seenPrev = new Set<string>();
    for (const s of snaps) {
      const key = `${s.siteId}::${s.keyword.toLowerCase()}`;
      if (!seenLatest.has(key)) {
        seenLatest.add(key);
        if (s.searchVolume != null) volBySiteKeyword.set(key, s.searchVolume);
      } else if (!seenPrev.has(key)) {
        seenPrev.add(key);
        if (s.rank != null) prevPosBySiteKeyword.set(key, s.rank);
      }
    }
  }

  const totals = {
    tracked: rows.length,
    p1: rows.filter((r) => r.lastPosition != null && Number(r.lastPosition) <= 10).length,
    flagged: rows.filter((r) => r.refreshFlaggedAt).length,
    researched: rows.filter((r) => r.source && r.source !== "auto").length,
  };

  const allSites = await db()
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  return (
    <>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Tracked" value={totals.tracked} />
        <Stat label="On page 1" value={totals.p1} suffix={`/ ${totals.tracked}`} tone="success" />
        <Stat label="Refresh flagged" value={totals.flagged} tone={totals.flagged > 0 ? "warning" : "neutral"} />
        <Stat label="Researched" value={totals.researched} tone={totals.researched > 0 ? "info" : "neutral"} />
      </section>

      <SemrushResearch configured={hasSemrushKey()} sites={allSites} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tightish text-text">Worst offenders</h2>
        {rows.length > 0 && volBySiteKeyword.size === 0 && (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-text-muted">
            <span className="font-medium text-text">Search volume is blank</span> because no SERP snapshots
            have landed yet. Volume + week-over-week rank deltas fill in once the SEMrush sync runs against these keywords.
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState
            glyph="search"
            title="No tracked keywords yet"
            description="Add keywords on each site's detail page, or use SEMrush research above to discover and track keywords automatically."
            action={{ label: "Browse sites", href: "/admin/sites" }}
          />
        ) : (
          <RowList>
            {paginate(rows, page, perPage).map((r) => {
              const pos = r.lastPosition == null ? null : Number(r.lastPosition);
              const tone = pos == null ? "neutral" : pos <= 10 ? "success" : pos <= 20 ? "info" : pos <= 30 ? "warning" : "danger";
              const key = `${r.siteId}::${r.keyword.toLowerCase()}`;
              const vol = volBySiteKeyword.get(key);
              const prev = prevPosBySiteKeyword.get(key);
              const delta = pos != null && prev != null ? prev - pos : null;
              return (
                <Row key={r.id}>
                  <div className="flex w-full items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-md text-text">{r.keyword}</div>
                      <div className="truncate text-xs text-text-faint">
                        {r.domain ?? "—"} · {r.targetUrl ?? "no target url"}
                        {" · "}{r.location}/{r.device}
                        {" · last "}{r.lastCheckedAt ? new Date(r.lastCheckedAt).toISOString().slice(0, 10) : "never"}
                      </div>
                    </div>
                    {vol != null && <span className="hidden shrink-0 text-xs text-text-faint sm:inline">{vol.toLocaleString()}/mo</span>}
                    {delta != null && delta !== 0 && (
                      <span className={`tnum hidden shrink-0 text-xs font-medium sm:inline ${delta > 0 ? "text-success" : "text-danger"}`}>
                        {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}
                      </span>
                    )}
                    <Pill tone={r.source && r.source !== "auto" ? "info" : "neutral"}>
                      {r.source && r.source !== "auto" ? "researched" : "page-derived"}
                    </Pill>
                    <Pill tone={tone}>{pos == null ? "—" : `#${pos}`}</Pill>
                    <Pill tone={r.weeksOffP1 >= 4 ? "warning" : "neutral"}>
                      {r.weeksOffP1}w off P1
                    </Pill>
                    {r.refreshFlaggedAt && <Pill tone="info">flagged</Pill>}
                  </div>
                </Row>
              );
            })}
          </RowList>
        )}
        <Pagination
          basePath="/admin/keywords"
          page={page}
          totalItems={rows.length}
          perPage={perPage}
          searchParams={sp}
        />
      </section>
    </>
  );
}

/* ── Lists tab (keyword lists) ── */
async function ListsView() {
  const lists = await getKeywordLists();

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-text">Your Keyword Lists</h2>
          <KeywordListImport />
        </div>
        <KeywordListActions />
      </div>

      {lists.length === 0 ? (
        <EmptyState
          glyph="search"
          title="No keyword lists yet"
          description="Create your first list, then save keywords from Keyword Scout into it."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/admin/keyword-lists/${list.id}`}
              className="group flex flex-col rounded-xl bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-text group-hover:text-accent">
                    {list.name}
                  </h3>
                  {list.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                      {list.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
                  {list.keywordCount}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-faint">
                <span>{list.keywordCount} keyword{list.keywordCount === 1 ? "" : "s"}</span>
                <span>Created {new Date(list.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
