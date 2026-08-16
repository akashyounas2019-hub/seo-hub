import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  aiUsage,
  seoActions,
  seoAudits,
  seoFindings,
  seoProposals,
  sites,
} from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconSparkle } from "@/components/ui/Icon";
import { formatMicroUsd } from "@/lib/ai-pricing";
import { listSkills } from "@/lib/seo-skills";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { getThinContentReport } from "@/lib/thin-content";
import { getDoorwayRiskReport } from "@/lib/doorway-risk";
import { rollbackProposalAction } from "@/app/actions/seo-rollback";
import { Pagination, pageParams, type SearchParams } from "@/components/ui/Pagination";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";
import { SeoGroupCard } from "./SeoGroupCard";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600_000;

export default async function SeoInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const sp = await searchParams;
  // Proposals inbox paginates over the full pending set (kept-as-grouped below).
  const { page, perPage } = pageParams(sp, 50);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  // ── Cost meter ────────────────────────────────────────────────────────
  // Aggregate ai_usage for the current calendar month, broken down only at
  // the row level — Postgres is happy summing a million ints, this stays
  // sub-millisecond.
  const [monthSpend] = await d
    .select({
      cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
      calls: sql<number>`count(*)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.agent, "seo_scan"), gte(aiUsage.createdAt, startOfMonth)));

  // ── Activity counts ────────────────────────────────────────────────────
  const [auditsThisWeek] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(seoAudits)
    .where(gte(seoAudits.createdAt, weekAgo));
  const [appliedYesterday] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(seoActions)
    .where(and(eq(seoActions.success, true), gte(seoActions.createdAt, dayAgo)));
  const [openProposals] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(seoProposals)
    .where(eq(seoProposals.status, "pending"));

  // ── Pending proposals inbox ────────────────────────────────────────────
  const inboxRows = await d
    .select({
      id: seoProposals.id,
      kind: seoProposals.kind,
      payload: seoProposals.payload,
      rationale: seoProposals.rationale,
      siteSlug: sites.slug,
      siteName: sites.name,
      siteDomain: sites.domain,
      createdAt: seoProposals.createdAt,
      model: seoProposals.model,
    })
    .from(seoProposals)
    .innerJoin(sites, eq(sites.id, seoProposals.siteId))
    .where(eq(seoProposals.status, "pending"))
    .orderBy(desc(seoProposals.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Full pending count drives both the KPI tile and the pager total.
  const totalPending = openProposals?.n ?? inboxRows.length;

  // ── Recent successful applies (auto + manual) ──────────────────────────
  const appliedRows = await d
    .select({
      id: seoActions.id,
      kind: seoActions.kind,
      appliedVia: seoActions.appliedVia,
      siteSlug: sites.slug,
      siteName: sites.name,
      createdAt: seoActions.createdAt,
      pluginResponse: seoActions.pluginResponse,
    })
    .from(seoActions)
    .innerJoin(sites, eq(sites.id, seoActions.siteId))
    .where(eq(seoActions.success, true))
    .orderBy(desc(seoActions.createdAt))
    .limit(20);

  // ── Per-site rollup of open work ───────────────────────────────────────
  const perSiteRollup = await d
    .select({
      siteId: sites.id,
      siteSlug: sites.slug,
      siteName: sites.name,
      open: sql<number>`coalesce(sum(case when ${seoProposals.status} = 'pending' then 1 else 0 end), 0)::int`,
      applied: sql<number>`coalesce(sum(case when ${seoProposals.status} = 'applied' then 1 else 0 end), 0)::int`,
      failed: sql<number>`coalesce(sum(case when ${seoProposals.status} = 'failed' then 1 else 0 end), 0)::int`,
      lastAt: sql<Date | null>`max(${seoProposals.createdAt})`,
    })
    .from(sites)
    .leftJoin(seoProposals, eq(seoProposals.siteId, sites.id))
    .groupBy(sites.id, sites.slug, sites.name)
    .orderBy(desc(sql`max(${seoProposals.createdAt})`));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tightish text-text">SEO autopilot</h1>
          <p className="mt-1 text-sm text-text-muted">
            AI agent auditing & fixing the network on a schedule. Anything risky waits in the inbox below for your approval.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-accent-tint px-2 py-1 text-xs font-medium uppercase tracking-[0.04em] text-accent">
          <IconSparkle size={12} /> Phase 1 · alt text
        </span>
      </header>

      <AuditReportingScoutTabs />

      {/* ── Stat strip ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SeoStat label="Spend · MTD" value={formatMicroUsd(Number(monthSpend?.cost ?? 0))} tone="accent" />
        <SeoStat label="Scans · 7d" value={auditsThisWeek?.n ?? 0} tone="info" />
        <SeoStat label="Applied · 24h" value={appliedYesterday?.n ?? 0} tone="success" />
        <SeoStat label="Awaiting approval" value={openProposals?.n ?? 0} tone={openProposals && openProposals.n > 0 ? "warning" : "neutral"} />
      </section>

      {/* ── Pending inbox ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tightish text-text">Awaiting approval</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Grouped by kind. Safe groups bulk-approve in one click. Blocked groups (visual / content) need eyes-on review.
            </p>
          </div>
          <span className="text-xs text-text-faint tabular-nums">
            {totalPending > perPage
              ? `Showing ${inboxRows.length} of ${totalPending}`
              : `${totalPending} item${totalPending === 1 ? "" : "s"}`}
          </span>
        </div>
        {totalPending === 0 ? (
          <EmptyState
            glyph="spark"
            title="Inbox is clear"
            description="When the agent proposes a fix that isn't on the auto-apply list, it'll show up here for one-click approval."
          />
        ) : (
          <>
            <SeoGroupedInbox rows={inboxRows} />
            <Pagination
              basePath="/admin/seo"
              page={page}
              totalItems={totalPending}
              perPage={perPage}
              searchParams={sp}
            />
          </>
        )}
      </section>

      {/* ── Recent applied feed ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tightish text-text">Recently applied</h2>
        {appliedRows.length === 0 ? (
          <p className="text-xs text-text-faint">
            No fixes applied yet. Run <code className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-xs">npm run seo:scan</code> on the VPS or trigger one from a site detail page once that ships.
          </p>
        ) : (
          <RowList>
            {appliedRows.map((a) => {
              const proposalId = (a.pluginResponse as Record<string, unknown> | null)?._proposal_id as string | undefined;
              return (
                <Row key={a.id}>
                  <Pill tone={a.appliedVia === "auto" ? "accent" : "success"}>{a.appliedVia}</Pill>
                  <span className="text-sm text-text">{a.kind.replace(/_/g, " ")}</span>
                  <span className="font-mono text-xs text-text-faint">{a.siteSlug}</span>
                  <span className="ml-auto text-xs text-text-faint">{formatRelative(a.createdAt)}</span>
                  {proposalId ? (
                    <form action={rollbackProposalAction}>
                      <input type="hidden" name="proposalId" value={proposalId} />
                      <input type="hidden" name="reason" value="manual-rollback" />
                      <button
                        type="submit"
                        className="ml-2 inline-flex h-6 items-center rounded-sm border border-border bg-surface px-2 text-xs font-medium text-text-faint hover:border-danger hover:text-danger"
                      >
                        Rollback
                      </button>
                    </form>
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        )}
      </section>

      {/* ── Per-site rollup ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tightish text-text">Sites</h2>
        <RowList footer={`${perSiteRollup.length} site${perSiteRollup.length === 1 ? "" : "s"}`}>
          {perSiteRollup.map((s) => (
            <Row key={s.siteId} href={`/admin/sites/${s.siteSlug}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-text">{s.siteName}</span>
                  <span className="font-mono text-xs text-text-faint">{s.siteSlug}</span>
                </div>
                <div className="mt-0.5 text-xs text-text-faint">
                  {s.lastAt ? `Last activity ${formatRelative(s.lastAt)}` : "No SEO activity yet"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.open > 0 ? <Pill tone="warning">{s.open} open</Pill> : null}
                {s.applied > 0 ? <Pill tone="success">{s.applied} applied</Pill> : null}
                {s.failed > 0 ? <Pill tone="danger">{s.failed} failed</Pill> : null}
              </div>
            </Row>
          ))}
        </RowList>
      </section>

      {/* ── Site-wide quality risk: thin content + doorway near-dupes ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ThinContentPanel />
        <DoorwayRiskPanel />
      </div>

      {/* ── Competitor intel (read-only) ── */}
      <CompetitorIntel />

      {/* ── Installed skills (what the agent knows) ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tightish text-text">Skills installed</h2>
        <p className="text-xs text-text-faint">
          Each skill below is a methodology module the agent reaches for when its audit kind matches.
          New skills are added as later phases unlock.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {listSkills().map((s) => (
            <div key={s.slug} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-text">{s.title}</span>
                <Pill tone={s.phase === 1 ? "success" : s.phase <= 3 ? "accent" : "neutral"}>
                  Phase {s.phase}
                </Pill>
              </div>
              <div className="mt-0.5 font-mono text-xs text-text-faint">{s.slug}</div>
              <div className="mt-1 text-xs text-text-faint">
                Applies to: {s.appliesTo.length === 0 ? "manual only" : s.appliesTo.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-text-faint">
        Phase 1 ships alt-text auto-fix only. Phase 2 adds meta titles, descriptions, and schema; Phase 7 adds visual design (proposal-only, never auto). See <Link href="/admin/settings" className="text-accent hover:underline">/admin/settings</Link> to manage the Anthropic key that pays for these calls.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Thin-content panel — site-wide quality risk.
//
// Since the 2024 core update folded the Helpful Content system into core
// ranking, quality is judged at the domain level: a few thin pages can drag
// the WHOLE site down. This surfaces, per site, how many published content
// pages fall under the word-count floor, with the worst offenders so the
// operator can prune-or-improve. Signal: site_pages.word_count (synced from
// each WP site). Threshold lives in @/lib/thin-content.
// ──────────────────────────────────────────────────────────────────────

async function ThinContentPanel() {
  const report = await getThinContentReport(5);

  // Only sites that actually have synced pages are worth showing — a site
  // with 0 catalogued pages just hasn't run sync:inventory yet.
  const scored = report.sites.filter((s) => s.totalPages > 0);

  const headline =
    report.sitesAtRisk > 0
      ? `${report.sitesAtRisk} site${report.sitesAtRisk === 1 ? "" : "s"} have thin-content risk`
      : report.sitesWithThin > 0
        ? `${report.sitesWithThin} site${report.sitesWithThin === 1 ? "" : "s"} carry a few thin pages`
        : "No thin-content risk detected";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tightish text-text">Thin-content risk</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Since the 2024 core update folded Helpful Content into core ranking, a cluster of thin pages drags the{" "}
            <em>whole</em> domain. Pages under{" "}
            <span className="font-medium text-text">{report.threshold} words</span> are flagged — prune or improve them.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium ${
            report.sitesAtRisk > 0
              ? "bg-danger-tint text-danger"
              : report.sitesWithThin > 0
                ? "bg-warning-tint text-warning"
                : "bg-success-tint text-success"
          }`}
        >
          {headline}
        </span>
      </div>

      {scored.length === 0 ? (
        <EmptyState
          glyph="spark"
          title="No page catalogue yet"
          description="Run npm run sync:inventory on the VPS (or wait for the nightly cron) to pull each site's page list, then thin-content risk shows up here."
        />
      ) : (
        <RowList footer={`${report.totalThinPages} thin page${report.totalThinPages === 1 ? "" : "s"} across ${scored.length} site${scored.length === 1 ? "" : "s"} · threshold ${report.threshold} words`}>
          {scored.map((s) => {
            const countColor =
              s.verdict === "at_risk"
                ? "text-danger"
                : s.verdict === "watch"
                  ? "text-warning"
                  : "text-success";
            const pct = Math.round(s.thinRatio * 100);
            return (
              <Row key={s.siteId} href={`/admin/sites/${s.siteSlug}/pages`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{s.siteName}</span>
                    <span className="font-mono text-xs text-text-faint">{s.siteSlug}</span>
                    {s.verdict === "at_risk" ? (
                      <Pill tone="danger">at risk</Pill>
                    ) : s.verdict === "watch" ? (
                      <Pill tone="warning">watch</Pill>
                    ) : (
                      <Pill tone="success">clean</Pill>
                    )}
                  </div>
                  {s.worst.length > 0 ? (
                    <div className="mt-0.5 truncate text-xs text-text-faint">
                      Worst:{" "}
                      {s.worst
                        .map((p) => `${p.slug || "/"} (${p.wordCount}w)`)
                        .slice(0, 3)
                        .join(" · ")}
                      {s.thinPages > 3 ? ` · +${s.thinPages - 3} more` : ""}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-text-faint">
                      All {s.totalPages} pages clear the {report.threshold}-word floor.
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`tnum text-xs font-medium ${countColor}`}>
                    {s.thinPages}/{s.totalPages}
                  </span>
                  <span className="tnum w-10 text-right text-xs text-text-faint">{pct}%</span>
                </div>
              </Row>
            );
          })}
        </RowList>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Doorway-risk panel — site-wide near-duplicate (template) risk.
//
// Google's doorway / scaled-content-abuse policy (enforced hard by the May
// 2026 core update) punishes "swap-the-city-name" pages: a fleet of pages
// that share a template and differ only by the city/area token. The REAL
// body-similarity detector (doorway-detector.ts) runs automatically in the
// publish gauntlet, but it needs body text — which live `site_pages` lacks.
// So this panel surfaces an honest PROXY on live data: a title/slug
// near-duplicate signal. Pages whose normalized titles are ≥80% similar
// (token-set / trigram, ignoring the place token) are clustered; a site
// carrying clusters is flagged. Logic lives in @/lib/doorway-risk.
// ──────────────────────────────────────────────────────────────────────

async function DoorwayRiskPanel() {
  const report = await getDoorwayRiskReport(3);

  // Only sites with synced pages are worth showing — a site with 0 catalogued
  // pages just hasn't run sync:inventory yet.
  const scored = report.sites.filter((s) => s.totalPages > 0);

  const headline =
    report.sitesAtRisk > 0
      ? `${report.sitesAtRisk} site${report.sitesAtRisk === 1 ? "" : "s"} have doorway risk`
      : report.sitesWithClusters > 0
        ? `${report.sitesWithClusters} site${report.sitesWithClusters === 1 ? "" : "s"} carry near-duplicate clusters`
        : "No doorway risk detected";

  const pctThreshold = Math.round(report.threshold * 100);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tightish text-text">Doorway risk</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Near-duplicate pages (same template, only the city swapped) are Google&rsquo;s &ldquo;doorway&rdquo; spam
            pattern — what the May 2026 core update punished. Pages sharing near-identical titles are clustered; make
            each genuinely unique or consolidate.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium ${
            report.sitesAtRisk > 0
              ? "bg-danger-tint text-danger"
              : report.sitesWithClusters > 0
                ? "bg-warning-tint text-warning"
                : "bg-success-tint text-success"
          }`}
        >
          {headline}
        </span>
      </div>

      {scored.length === 0 ? (
        <EmptyState
          glyph="spark"
          title="No page catalogue yet"
          description="Run npm run sync:inventory on the VPS (or wait for the nightly cron) to pull each site's page list, then doorway risk shows up here."
        />
      ) : (
        <RowList footer={`${report.totalClusteredPages} clustered page${report.totalClusteredPages === 1 ? "" : "s"} across ${scored.length} site${scored.length === 1 ? "" : "s"} · title signal ≥ ${pctThreshold}% · full body-similarity check runs automatically at publish`}>
          {scored.map((s) => {
            const countColor =
              s.verdict === "at_risk"
                ? "text-danger"
                : s.verdict === "watch"
                  ? "text-warning"
                  : "text-success";
            const pct = Math.round(s.clusterRatio * 100);
            const top = s.worstClusters[0];
            return (
              <Row key={s.siteId} href={`/admin/sites/${s.siteSlug}/pages`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-text">{s.siteName}</span>
                    <span className="font-mono text-xs text-text-faint">{s.siteSlug}</span>
                    {s.verdict === "at_risk" ? (
                      <Pill tone="danger">at risk</Pill>
                    ) : s.verdict === "watch" ? (
                      <Pill tone="warning">watch</Pill>
                    ) : (
                      <Pill tone="success">clean</Pill>
                    )}
                  </div>
                  {top ? (
                    <div className="mt-0.5 truncate text-xs text-text-faint">
                      Worst:{" "}
                      {top.pages
                        .map((p) => p.slug || "/")
                        .slice(0, 3)
                        .join(" · ")}
                      {top.pages.length > 3 ? ` · +${top.pages.length - 3} more` : ""}
                      {` (${top.similarityPct}% alike)`}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-text-faint">
                      No near-duplicate clusters across {s.totalPages} pages.
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`tnum text-xs font-medium ${countColor}`}>
                    {s.clusteredPages}/{s.totalPages}
                  </span>
                  <span className="tnum w-10 text-right text-xs text-text-faint">{pct}%</span>
                </div>
              </Row>
            );
          })}
        </RowList>
      )}
    </section>
  );
}

async function CompetitorIntel() {
  const d = db();
  const rows = await d
    .select({
      id: seoFindings.id,
      siteSlug: sites.slug,
      siteName: sites.name,
      summary: seoFindings.summary,
      url: seoFindings.url,
      payload: seoFindings.payload,
      createdAt: seoFindings.createdAt,
    })
    .from(seoFindings)
    .innerJoin(sites, eq(sites.id, seoFindings.siteId))
    .where(eq(seoFindings.code, "competitor-teardown"))
    .orderBy(desc(seoFindings.createdAt))
    .limit(12);
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tightish text-text">Competitor intel</h2>
        <p className="text-xs text-text-faint">
          No competitor teardowns yet. Add competitor URLs to a site at <code className="font-mono text-xs">seo_policies.competitors</code> (one per line), then run{" "}
          <code className="font-mono text-xs">npm run seo:scan -- --kind=competitor</code>. Suggested cadence: monthly.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tightish text-text">Competitor intel</h2>
        <span className="text-xs text-text-faint">Read-only · monthly cadence</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => {
          const payload = (r.payload ?? {}) as Record<string, unknown>;
          const compUrl = typeof payload.competitor_url === "string" ? (payload.competitor_url as string) : "";
          const they = Array.isArray(payload.they_do_better) ? (payload.they_do_better as string[]) : [];
          const adopt = Array.isArray(payload.adopt) ? (payload.adopt as Array<{ what: string; effort: string; rationale: string }>) : [];
          return (
            <div key={r.id} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">{r.siteName}</div>
                  <a href={compUrl} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs text-accent hover:underline">{compUrl}</a>
                </div>
                <span className="shrink-0 text-xs text-text-faint">{formatRelative(r.createdAt)}</span>
              </div>
              {they.length > 0 ? (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-[0.04em] text-text-faint">They do better</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-text">
                    {they.slice(0, 3).map((t, i) => <li key={i}>• {t}</li>)}
                  </ul>
                </div>
              ) : null}
              {adopt.length > 0 ? (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-[0.04em] text-text-faint">Adopt</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-text">
                    {adopt.slice(0, 3).map((a, i) => (
                      <li key={i}>
                        <span className="mr-1 rounded-sm bg-surface-2 px-1 py-0.5 text-xs uppercase tracking-wide text-text-faint">{a.effort}</span>
                        {a.what}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SeoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "neutral" | "accent" | "success" | "info" | "warning";
}) {
  const numColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)",
        }}
      />
      <div className="text-xs uppercase tracking-[0.10em] font-semibold text-text-faint">{label}</div>
      <div className={`mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight ${numColor}`}>
        {value}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Grouped inbox — bundles proposals by kind, collapses blocked groups,
// surfaces bulk approve/reject. Visual-CSS proposals are tagged as
// blocked because the schema marks them manual-review-only.
// ──────────────────────────────────────────────────────────────────────

const KIND_META: Record<string, { label: string; blocked: boolean; reason?: string }> = {
  alt_text:         { label: "Alt text",         blocked: false },
  meta_title:       { label: "Meta title",       blocked: false },
  meta_description: { label: "Meta description", blocked: false },
  schema_inject:    { label: "Schema inject",    blocked: false },
  content_rewrite:  { label: "Content rewrite",  blocked: true,
    reason: "Content rewrites need human review — bulk approve disabled by policy." },
  visual_css:       { label: "Visual / CSS",     blocked: true,
    reason: "Visual changes need a human eyeball — bulk approve disabled by policy." },
};

type InboxRow = {
  id: string;
  kind: string;
  payload: unknown;
  rationale: string | null;
  siteSlug: string;
  siteName: string;
  siteDomain: string;
  createdAt: Date;
  model: string;
};

function SeoGroupedInbox({ rows }: { rows: InboxRow[] }) {
  // Group by kind in encounter order.
  const groups = new Map<string, InboxRow[]>();
  for (const r of rows) {
    if (!groups.has(r.kind)) groups.set(r.kind, []);
    groups.get(r.kind)!.push(r);
  }

  // Sort: safe groups first (so bulk-approve targets land at the top), then blocked.
  const ordered = Array.from(groups.entries()).sort(([a], [b]) => {
    const ablock = KIND_META[a]?.blocked ? 1 : 0;
    const bblock = KIND_META[b]?.blocked ? 1 : 0;
    if (ablock !== bblock) return ablock - bblock;
    return groups.get(b)!.length - groups.get(a)!.length;
  });

  return (
    <div className="space-y-3">
      {ordered.map(([kind, items]) => {
        const meta = KIND_META[kind] ?? { label: kind.replace(/_/g, " "), blocked: false };
        const previewItems = items.slice(0, 25).map((p) => ({
          id: p.id,
          siteName: p.siteName,
          siteDomain: p.siteDomain,
          siteSlug: p.siteSlug,
          createdAtIso: p.createdAt.toISOString(),
          preview: renderInlinePreview(p),
        }));
        return (
          <SeoGroupCard
            key={kind}
            kind={kind}
            label={meta.label}
            tone={meta.blocked ? "blocked" : "safe"}
            items={previewItems}
            reason={meta.reason}
          />
        );
      })}
    </div>
  );
}

function renderInlinePreview(p: InboxRow): React.ReactNode {
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  const before = typeof payload.before === "string" ? payload.before : null;
  const after = typeof payload.after === "string" ? payload.after : null;
  const alt = typeof payload.alt === "string" ? payload.alt : null;
  const observation = typeof payload.observation === "string" ? payload.observation : null;
  const suggestion = typeof payload.suggestion === "string" ? payload.suggestion : null;
  const schemaType = typeof payload.schema_type === "string" ? payload.schema_type : null;

  if (p.kind === "alt_text" && alt) {
    return <span>&ldquo;{truncate(alt, 100)}&rdquo;</span>;
  }
  if ((p.kind === "meta_title" || p.kind === "meta_description") && before !== null && after !== null) {
    return (
      <span>
        <span className="text-text-muted line-through">{truncate(before, 60) || "(empty)"}</span>
        <span className="mx-1 text-text-faint">→</span>
        <span>{truncate(after, 80)}</span>
      </span>
    );
  }
  if (p.kind === "schema_inject" && schemaType) {
    return <span>Inject <code className="font-mono text-xs">{schemaType}</code> JSON-LD</span>;
  }
  if (p.kind === "visual_css" && (observation || suggestion)) {
    return <span className="text-text-muted">{truncate(observation ?? suggestion ?? "", 150)}</span>;
  }
  if (p.kind === "content_rewrite" && typeof payload.brief === "string") {
    return <span className="text-text-muted">{truncate(payload.brief as string, 150)}</span>;
  }
  return <span className="text-text-faint">{truncate(p.rationale ?? "", 150)}</span>;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}
