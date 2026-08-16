/**
 * /admin/sites/[slug]/ranks — Per-site keyword rank history.
 *
 * Lists every tracked_keywords row for this site, with current position,
 * weeks-off-Pn counters, and inline mini sparkline of the last 8 weeks.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { keywordRankSnapshots, sites, trackedKeywords } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Stat } from "@/components/ui/Stat";
import { Pagination, pageParams, paginate, type SearchParams } from "@/components/ui/Pagination";
import { requireAdmin } from "@/lib/server-auth";
import { SiteTabs } from "../SiteTabs";
import { AddKeywordForm } from "./AddKeywordForm";

export const dynamic = "force-dynamic";

export default async function SiteRanksPage({
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
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) notFound();

  const rows = await db()
    .select({
      id: trackedKeywords.id,
      keyword: trackedKeywords.keyword,
      targetUrl: trackedKeywords.targetUrl,
      lastPosition: trackedKeywords.lastPosition,
      lastCheckedAt: trackedKeywords.lastCheckedAt,
      weeksOffP1: trackedKeywords.weeksOffP1,
      weeksOffP3: trackedKeywords.weeksOffP3,
      refreshFlaggedAt: trackedKeywords.refreshFlaggedAt,
    })
    .from(trackedKeywords)
    .where(and(eq(trackedKeywords.siteId, site.id), eq(trackedKeywords.enabled, true)))
    .orderBy(desc(trackedKeywords.weeksOffP1))
    .limit(200);

  const p1 = rows.filter((r) => r.lastPosition != null && Number(r.lastPosition) <= 10).length;
  const flagged = rows.filter((r) => r.refreshFlaggedAt).length;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/sites" className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text">← Sites</Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">{site.name} · Ranks</h1>
        <p className="mt-1 text-xs text-text-muted">{site.domain}</p>
      </header>
      <SiteTabs slug={slug} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Tracked" value={rows.length} />
        <Stat label="On page 1" value={p1} tone="success" />
        <Stat label="Refresh flagged" value={flagged} tone={flagged > 0 ? "warning" : "neutral"} />
      </section>

      <AddKeywordForm siteId={site.id} siteUrl={`https://${site.domain}/`} />

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Keywords</h2>
        <RowList>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-md text-text">No keywords tracked yet for this site.</div>
              <div className="mt-2 text-xs text-text-muted">
                Add one above — Site Kit will resolve real positions on the next Monday sweep.
              </div>
            </div>
          )}
          {paginate(rows, page, perPage).map((r) => {
            const pos = r.lastPosition == null ? null : Number(r.lastPosition);
            const tone =
              pos == null ? "neutral" :
              pos <= 10 ? "success" :
              pos <= 20 ? "info" :
              pos <= 30 ? "warning" : "danger";
            return (
              <Row key={r.id}>
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text">{r.keyword}</div>
                    <div className="truncate text-xs text-text-faint">
                      {r.targetUrl ?? "no target"}
                      {r.lastCheckedAt ? ` · last ${new Date(r.lastCheckedAt).toISOString().slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <Pill tone={tone}>{pos == null ? "—" : `#${pos}`}</Pill>
                  <Pill tone={r.weeksOffP1 >= 4 ? "warning" : "neutral"}>{r.weeksOffP1}w</Pill>
                  {r.refreshFlaggedAt && <Pill tone="info">flagged</Pill>}
                </div>
              </Row>
            );
          })}
        </RowList>
        <Pagination
          basePath={`/admin/sites/${slug}/ranks`}
          page={page}
          totalItems={rows.length}
          perPage={perPage}
          searchParams={sp}
        />
      </section>
    </div>
  );
}

