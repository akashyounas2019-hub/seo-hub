import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  seoOutcomeSnapshots,
  seoProposals,
  sites,
} from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  // ─── Per-capability rollup ─────────────────────────────────────────
  // For each proposal kind, average the 14-day delta in impressions
  // + position vs the most-recent pre-apply snapshot we have for that
  // URL. Simplification: we treat the 7-day snapshot as the baseline
  // when it exists, then compute 14-day delta from it.
  const aggRows = await d
    .select({
      kind: seoProposals.kind,
      n: sql<number>`count(distinct ${seoProposals.id})::int`,
      clicks_avg: sql<number>`avg(${seoOutcomeSnapshots.clicks})::int`,
      impressions_avg: sql<number>`avg(${seoOutcomeSnapshots.impressions})::int`,
      // Position is stored ×1000 — convert back here.
      position_avg_milli: sql<number>`avg(${seoOutcomeSnapshots.positionMilli})::int`,
      // We compare the 14-day window to ALL captured snapshots — the
      // resulting trend is approximate but lets us see whether things
      // are moving in the right direction per capability.
    })
    .from(seoProposals)
    .innerJoin(seoOutcomeSnapshots, eq(seoOutcomeSnapshots.proposalId, seoProposals.id))
    .where(eq(seoOutcomeSnapshots.daysAfter, 14))
    .groupBy(seoProposals.kind);

  // ─── Per-proposal detail (latest 30 with outcomes) ────────────────
  const detailRows = await d
    .select({
      proposalId: seoProposals.id,
      kind: seoProposals.kind,
      payload: seoProposals.payload,
      appliedAt: seoProposals.appliedAt,
      siteSlug: sites.slug,
      siteName: sites.name,
      daysAfter: seoOutcomeSnapshots.daysAfter,
      clicks: seoOutcomeSnapshots.clicks,
      impressions: seoOutcomeSnapshots.impressions,
      positionMilli: seoOutcomeSnapshots.positionMilli,
      criticConfidence: seoProposals.criticConfidence,
    })
    .from(seoProposals)
    .innerJoin(sites, eq(sites.id, seoProposals.siteId))
    .innerJoin(seoOutcomeSnapshots, eq(seoOutcomeSnapshots.proposalId, seoProposals.id))
    .where(eq(seoProposals.status, "applied"))
    .orderBy(desc(seoOutcomeSnapshots.capturedAt))
    .limit(60);

  return (
    <div className="space-y-7">
      <header className="brand-rule">
        <Link href="/admin/seo" className="text-xs text-text-faint hover:text-text">
          ← SEO autopilot
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">
          Outcomes
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Did the agent&apos;s fixes actually help? Each applied proposal gets GSC snapshots at 7, 14, and 30 days after apply. This is the truth layer — if a capability is producing fixes that don&apos;t move the needle, you&apos;ll see it here before you trust it further.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Per-capability 14-day averages</h2>
        {aggRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-5 text-xs text-text-muted">
            No outcome snapshots yet. Once auto-applied fixes are 14 days old, the cron will start filling this in.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aggRows.map((r) => (
              <div key={r.kind} className="rounded-lg border border-border bg-surface p-4">
                <div className="text-xs uppercase tracking-[0.06em] text-text-faint">{r.kind.replace(/_/g, " ")}</div>
                <div className="mt-2 text-2xl font-medium tabular-nums text-text">{r.n}</div>
                <div className="text-xs text-text-muted">applied · 14d avg</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="tabular-nums text-text">{r.clicks_avg ?? 0}</div>
                    <div className="text-text-faint">clicks</div>
                  </div>
                  <div>
                    <div className="tabular-nums text-text">{r.impressions_avg ?? 0}</div>
                    <div className="text-text-faint">impressions</div>
                  </div>
                  <div>
                    <div className="tabular-nums text-text">{((r.position_avg_milli ?? 0) / 1000).toFixed(1)}</div>
                    <div className="text-text-faint">avg position</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium text-text">Latest snapshots</h2>
        {detailRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-5 text-xs text-text-muted">
            No data yet — see above.
          </div>
        ) : (
          <RowList footer={`${detailRows.length} snapshot${detailRows.length === 1 ? "" : "s"}`}>
            {detailRows.map((r) => {
              const payload = (r.payload ?? {}) as Record<string, unknown>;
              const url = typeof payload.page_url === "string" ? payload.page_url : "";
              return (
                <Row key={`${r.proposalId}-${r.daysAfter}`} className="!items-start py-2.5">
                  <Pill tone="info">{r.kind.replace(/_/g, " ")}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm text-text">{r.siteName}</span>
                      <span className="font-mono text-xs text-text-faint">{r.siteSlug}</span>
                      <span className="text-xs text-text-faint">· +{r.daysAfter}d</span>
                    </div>
                    {url ? (
                      <div className="mt-0.5 truncate font-mono text-xs text-text-faint">{url}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                    <span><span className="text-text-faint">clicks </span>{r.clicks}</span>
                    <span><span className="text-text-faint">imp </span>{r.impressions}</span>
                    <span><span className="text-text-faint">pos </span>{(r.positionMilli / 1000).toFixed(1)}</span>
                    {r.criticConfidence !== null ? (
                      <Pill tone={r.criticConfidence >= 80 ? "success" : r.criticConfidence >= 60 ? "warning" : "danger"}>
                        critic {r.criticConfidence}
                      </Pill>
                    ) : null}
                    <span className="text-text-faint">{r.appliedAt ? formatRelative(r.appliedAt) : ""}</span>
                  </div>
                </Row>
              );
            })}
          </RowList>
        )}
      </section>
    </div>
  );
}
