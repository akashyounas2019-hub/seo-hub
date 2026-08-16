import Link from "next/link";
import { and, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, trafficSnapshots, siteHealthAudits, pageHealthIssues } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  IconChartBar,
  IconCheckCircle,
  IconTrendingDown,
} from "@/components/ui/Icon";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";
import { RunSectionWatchButton } from "./RunSectionWatchButton";

export const dynamic = "force-dynamic";

/**
 * Compares each site's last-7-days clicks vs prior 7 days. Flags drops >30%
 * (yellow) or >60% (red) — early-warning for Google core-update damage on the
 * EMD network. If you ever see ~half the sites flagged the same week, you've
 * been hit by an algorithmic update and need to react fast.
 */
export default async function SeoHealthPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const yyyy_mm_dd = (date: Date) => date.toISOString().slice(0, 10);
  const today = new Date();
  const last7Start = yyyy_mm_dd(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
  const prior7Start = yyyy_mm_dd(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));

  // Pull all GSC snapshots in the last 14 days, aggregate per site. We keep the
  // raw daily rows (sorted by date) so each site with data gets a real
  // 14-day clicks sparkline alongside its week-over-week delta.
  const snapshots = await d
    .select({
      siteId: trafficSnapshots.siteId,
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
    })
    .from(trafficSnapshots)
    .where(
      and(
        eq(trafficSnapshots.source, "gsc"),
        gte(trafficSnapshots.snapshotDate, prior7Start),
      ),
    )
    .orderBy(trafficSnapshots.snapshotDate);

  type Bucket = {
    last7: number;
    prior7: number;
    last7Impr: number;
    prior7Impr: number;
    // Latest non-null average position seen in each window (lower = better).
    last7Pos: number | null;
    prior7Pos: number | null;
    // Daily clicks across the whole 14-day window, in date order.
    dailyClicks: number[];
  };
  const perSite = new Map<string, Bucket>();
  for (const s of snapshots) {
    const clicks = Number(s.metrics?.clicks ?? 0);
    const impr = Number(s.metrics?.impressions ?? 0);
    const posRaw = s.metrics?.position;
    const pos = posRaw != null && Number.isFinite(Number(posRaw)) ? Number(posRaw) : null;
    const bucket =
      perSite.get(s.siteId) ??
      ({ last7: 0, prior7: 0, last7Impr: 0, prior7Impr: 0, last7Pos: null, prior7Pos: null, dailyClicks: [] } as Bucket);
    bucket.dailyClicks.push(clicks);
    if (s.snapshotDate >= last7Start) {
      bucket.last7 += clicks;
      bucket.last7Impr += impr;
      if (pos != null) bucket.last7Pos = pos;
    } else {
      bucket.prior7 += clicks;
      bucket.prior7Impr += impr;
      if (pos != null) bucket.prior7Pos = pos;
    }
    perSite.set(s.siteId, bucket);
  }

  const siteIds = Array.from(perSite.keys());
  const siteRows =
    siteIds.length > 0
      ? await d
          .select({ id: sites.id, slug: sites.slug, name: sites.name, city: sites.city })
          .from(sites)
          .where(inArray(sites.id, siteIds))
      : [];

  const enriched = siteRows
    .map((s) => {
      const b = perSite.get(s.id)!;
      const clickDelta = b.prior7 > 0 ? (b.last7 - b.prior7) / b.prior7 : null;
      const imprDelta = b.prior7Impr > 0 ? (b.last7Impr - b.prior7Impr) / b.prior7Impr : null;
      // Position delta is in ranks (negative = moved UP, which is good).
      const posDelta =
        b.last7Pos != null && b.prior7Pos != null ? b.last7Pos - b.prior7Pos : null;
      return { ...s, ...b, clickDelta, imprDelta, posDelta };
    })
    .sort((a, b) => (a.clickDelta ?? 0) - (b.clickDelta ?? 0));

  const red = enriched.filter((r) => r.clickDelta !== null && r.clickDelta <= -0.6);
  const yellow = enriched.filter(
    (r) => r.clickDelta !== null && r.clickDelta <= -0.3 && r.clickDelta > -0.6,
  );

  // Network-wide totals for the summary strip.
  const totalLast7 = enriched.reduce((sum, r) => sum + r.last7, 0);
  const totalPrior7 = enriched.reduce((sum, r) => sum + r.prior7, 0);
  const networkClickDelta = totalPrior7 > 0 ? (totalLast7 - totalPrior7) / totalPrior7 : null;
  const growing = enriched.filter((r) => r.clickDelta !== null && r.clickDelta >= 0.1).length;

  const ungatheredSites = await d
    .select({ id: sites.id, slug: sites.slug })
    .from(sites)
    .where(siteIds.length ? sql`${sites.id} not in (${sql.join(siteIds.map(id => sql`${id}`), sql`, `)})` : undefined);

  const hasTracked = enriched.length > 0;

  // ── Section Watch — per-site count of RED missing-section issues from each
  // site's LATEST audit. Folded into the structure dimension (issueKey
  // 'missing_section:*'). We resolve the latest audit per site, then count.
  const allSitesForSections = await d
    .select({ id: sites.id, slug: sites.slug, name: sites.name, city: sites.city })
    .from(sites);

  const sectionRows: Array<{
    id: string;
    slug: string;
    name: string;
    city: string | null;
    redMissing: number;
    runDate: string | null;
  }> = [];
  for (const s of allSitesForSections) {
    const [latest] = await d
      .select({ id: siteHealthAudits.id, runDate: siteHealthAudits.runDate })
      .from(siteHealthAudits)
      .where(eq(siteHealthAudits.siteId, s.id))
      .orderBy(desc(siteHealthAudits.createdAt))
      .limit(1);
    if (!latest) {
      sectionRows.push({ ...s, redMissing: 0, runDate: null });
      continue;
    }
    const [{ n }] = await d
      .select({ n: sql<number>`count(*)::int` })
      .from(pageHealthIssues)
      .where(
        and(
          eq(pageHealthIssues.auditId, latest.id),
          eq(pageHealthIssues.dimension, "structure"),
          eq(pageHealthIssues.severity, "red"),
          like(pageHealthIssues.issueKey, "missing_section:%"),
        ),
      );
    sectionRows.push({ ...s, redMissing: Number(n ?? 0), runDate: latest.runDate });
  }
  const sectionsWatched = sectionRows.filter((r) => r.runDate !== null);
  const sortedSectionRows = [...sectionRows].sort((a, b) => b.redMissing - a.redMissing);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO health"
        subtitle="Week-over-week GSC click change per site. Sharp drops are an early warning for a Google core-update hit — if half the network flags in one week, react fast: pause builds, audit content, file a reconsideration request if eligible."
      />

      <AuditReportingScoutTabs />

      {/* ── Section Watch — required-section coverage per site ─────────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-medium tracking-tightish text-text">Sections</h2>
            <p className="text-xs text-text-muted">
              Required sections missing per site, detected by the $0 vision watch.
              Counts are RED (mandatory) gaps from each site&rsquo;s latest audit.
            </p>
          </div>
          <RunSectionWatchButton />
        </div>
        {sectionsWatched.length === 0 ? (
          <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text-muted">
            No section watch has run yet. Click <span className="font-medium text-text">Run section watch</span> to queue
            the $0 vision pass — the Mac worker captures one page per type and flags the missing sections.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Site</th>
                  <th className="px-4 py-2.5 font-medium">City</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sections missing</th>
                  <th className="px-4 py-2.5 text-right font-medium">Last watched</th>
                </tr>
              </thead>
              <tbody>
                {sortedSectionRows.map((r) => (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/admin/sites/${r.slug}/health`} className="font-medium text-accent hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{r.city ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {r.runDate === null ? (
                        <span className="text-text-faint">—</span>
                      ) : r.redMissing === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">
                          Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium tabular-nums text-danger">
                          {r.redMissing} missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-muted">{r.runDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!hasTracked ? (
        <EmptyState
          glyph="search"
          title="No Search Console data yet"
          description="Connect Google Search Console on each site's detail page. It takes about two weeks of data to populate week-over-week comparisons here."
          action={{ label: "Add a site", href: "/admin/sites" }}
        />
      ) : (
      <>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Network clicks · 7d"
          hint={
            networkClickDelta === null
              ? "Need a prior week to compare"
              : `${networkClickDelta >= 0 ? "+" : ""}${(networkClickDelta * 100).toFixed(0)}% vs prior 7d`
          }
          value={totalLast7}
          tone={networkClickDelta !== null && networkClickDelta <= -0.3 ? "danger" : "neutral"}
          icon={<IconChartBar size={18} />}
        />
        <Stat
          label="Heavy drops"
          hint="≥ 60% week-over-week"
          value={red.length}
          tone="danger"
          icon={<IconTrendingDown size={18} />}
        />
        <Stat
          label="Moderate drops"
          hint="30–60% week-over-week"
          value={yellow.length}
          tone="warning"
          icon={<IconTrendingDown size={18} />}
        />
        <Stat
          label="Growing"
          hint={`+10% or more · of ${enriched.length} tracked`}
          value={growing}
          tone="neutral"
          icon={<IconChartBar size={18} />}
        />
      </section>

      {red.length > 0 || yellow.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-text-faint">
              <tr>
                <th className="px-4 py-2.5 font-medium">Site</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 text-right font-medium">Last 7d clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Prior 7d clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Δ clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Δ impressions</th>
              </tr>
            </thead>
            <tbody>
              {[...red, ...yellow].map((r) => (
                <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/sites/${r.slug}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{r.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.last7.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-muted">
                    {r.prior7.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeltaBadge delta={r.clickDelta} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeltaBadge delta={r.imprDelta} muted />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success-tint p-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <IconCheckCircle size={16} />
          </span>
          <div>
            <p className="text-sm font-medium text-text">The network is steady</p>
            <p className="mt-0.5 text-sm text-text-muted">
              No sites recorded a significant click drop this week.
            </p>
          </div>
        </div>
      )}

      {/* Full per-site readout — every site WITH GSC data, not just the ones
          that dropped. Shows the real clicks/impressions/position numbers plus
          a 14-day clicks sparkline so a steady or growing site is legible too. */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            All tracked sites
            <span className="tnum ml-1.5 text-text-faint/80">{enriched.length}</span>
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-4 py-2.5 font-medium">Site</th>
              <th className="px-4 py-2.5 font-medium">14-day clicks</th>
              <th className="px-4 py-2.5 text-right font-medium">Clicks 7d</th>
              <th className="px-4 py-2.5 text-right font-medium">Impr. 7d</th>
              <th className="px-4 py-2.5 text-right font-medium">Avg position</th>
              <th className="px-4 py-2.5 text-right font-medium">Δ clicks</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((r) => (
              <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link href={`/admin/sites/${r.slug}`} className="font-medium text-accent hover:underline">
                    {r.name}
                  </Link>
                  {r.city ? <span className="ml-1.5 text-xs text-text-faint">{r.city}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="text-text-muted">
                    <Sparkline data={r.dailyClicks} width={96} height={22} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.last7.toLocaleString()}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-muted">{r.last7Impr.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {r.last7Pos != null ? (
                    <span className="inline-flex items-baseline gap-1">
                      <span className="tabular-nums text-text">{r.last7Pos.toFixed(1)}</span>
                      {r.posDelta != null && Math.abs(r.posDelta) >= 0.1 ? (
                        // Negative posDelta = climbed in rank (good → success).
                        <span className={`tnum text-xs ${r.posDelta < 0 ? "text-success" : "text-danger"}`}>
                          {r.posDelta < 0 ? "▲" : "▼"}{Math.abs(r.posDelta).toFixed(1)}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeltaBadge delta={r.clickDelta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ungatheredSites.length > 0 ? (
        // Calm informational note — awaiting data is an expected state, not an
        // error. No alarm icon / warning wash.
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text">
            {ungatheredSites.length} site{ungatheredSites.length === 1 ? "" : "s"} awaiting search data.
          </span>{" "}
          Connect Google Search Console on each site&rsquo;s detail page — data takes about two weeks to populate this view.
        </div>
      ) : null}

      <p className="text-xs text-text-faint">
        Source: Google Search Console. Refreshed daily.
      </p>
      </>
      )}
    </div>
  );
}

function Stat({
  label,
  hint,
  value,
  tone,
  icon,
}: {
  label: string;
  hint: string;
  value: number;
  tone: "danger" | "warning" | "neutral";
  icon: React.ReactNode;
}) {
  const accent =
    tone === "danger"
      ? "bg-danger-tint text-danger"
      : tone === "warning"
        ? "bg-warning-tint text-warning"
        : "bg-accent-tint text-accent";
  const valueColor =
    value > 0 && tone === "danger"
      ? "text-danger"
      : value > 0 && tone === "warning"
        ? "text-warning"
        : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border p-5 transition-[border-color,background] hover:border-border-strong"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">{label}</span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${accent}`}>{icon}</span>
      </div>
      <div className={`mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight ${valueColor}`}>{value}</div>
      <div className="mt-2 text-xs text-text-faint">{hint}</div>
    </div>
  );
}

function DeltaBadge({ delta, muted }: { delta: number | null; muted?: boolean }) {
  if (delta === null) return <span className="text-text-faint">—</span>;
  const pct = (delta * 100).toFixed(0);
  const label = `${delta > 0 ? "+" : ""}${pct}%`;
  if (muted) {
    return <span className="tabular-nums text-text-muted">{label}</span>;
  }
  const cls =
    delta <= -0.6
      ? "bg-danger-tint text-danger"
      : delta <= -0.3
        ? "bg-warning-tint text-warning"
        : delta >= 0.1
          ? "bg-success-tint text-success"
          : "bg-surface-3 text-text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {label}
    </span>
  );
}
