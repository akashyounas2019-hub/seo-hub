/**
 * GSC Deep-Dive dashboard at /admin/gsc.
 *
 * Layout — mirrors the BI-dashboard reference:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Filter rail   │  4 KPI cards + 1 Indexed-pages KPI = 5-wide strip   │
 *   │  (date range,  ├──────────────────────────────────────┬──────────────┤
 *   │   region,      │ Big performance chart (90 days)      │ Indexing     │
 *   │   comparison)  │                                      │ coverage     │
 *   │                │                                      │ donut        │
 *   │                ├───────────────────┬──────────────────┴──────────────┤
 *   │                │ Pages ranking up  │ Pages ranking down              │
 *   │                ├───────────────────┼─────────────────────────────────┤
 *   │                │ Keywords up       │ Keywords down                   │
 *   │                ├───────────────────┴─────────────────────────────────┤
 *   │                │ Indexing issues table                                │
 *   └────────────────┴──────────────────────────────────────────────────────┘
 *
 * All widgets are dark (`#0a1428` panel) with cyan (`#22d3ee`) accents to
 * match the project's brand while distinguishing the GSC section from the
 * generic dashboard theme.
 */
import Link from "next/link";
import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { syncAllGscNowAction } from "@/app/actions/sync";
import { RankingPerformanceWidget } from "./RankingPerformanceWidget";
import {
  loadKpiTotals,
  loadMoverLists,
  loadPerformanceSeries,
} from "@/lib/gsc-deep-dive";
import {
  loadIndexingCoverage,
  loadRecentIssues,
  type IndexingBucket,
  type IndexingIssueRow,
} from "@/lib/gsc-indexing";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CYAN = "#22d3ee"; // Tailwind cyan-400
const CYAN_DIM = "#0891b2"; // cyan-600
const PANEL_BG = "#0a1428"; // near-black navy
const PANEL_BG_ELEVATED = "#0f1c33";
const BORDER = "rgba(34, 211, 238, 0.15)"; // faint cyan hairline

const RANGE_DAYS: Record<string, number> = { "7d": 7, "28d": 28, "90d": 90 };

export default async function GscDeepDivePage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await ensureSchema();
  await requireAdmin();

  const rangeRaw = typeof searchParams.range === "string" ? searchParams.range : "28d";
  const range = rangeRaw in RANGE_DAYS ? rangeRaw : "28d";
  const days = RANGE_DAYS[range];

  const [kpis, series, movers, coverage, issues] = await Promise.all([
    loadKpiTotals(days),
    loadPerformanceSeries(Math.max(days, 90)),
    loadMoverLists(10),
    loadIndexingCoverage(),
    loadRecentIssues(15),
  ]);

  const indexedCount = coverage.buckets.find((b) => b.key === "indexed")?.count ?? 0;
  const totalKpis = [
    ...kpis,
    {
      label: "Indexed pages",
      value: indexedCount.toLocaleString(),
      delta: null,
      positiveIsGood: true,
    },
  ];

  return (
    <div
      className="min-h-full -m-6 p-6 sm:-m-8 sm:p-8"
      style={{ background: PANEL_BG, color: "#e2e8f0" }}
    >
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/dashboard-overview" className="text-xs text-cyan-400/70 hover:text-cyan-300">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-medium tracking-tightish" style={{ color: "#f1f5f9" }}>
            Search Console — Deep dive
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            UAE / Dubai search performance · every metric in one place
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action={syncAllGscNowAction}>
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: "rgba(34, 211, 238, 0.12)",
                borderColor: "rgba(34, 211, 238, 0.35)",
                color: CYAN,
              }}
            >
              Sync GSC now
            </button>
          </form>
          <RangeSelector current={range} />
        </div>
      </header>

      {/* Flash banners */}
      {typeof searchParams.ok === "string" && searchParams.ok.startsWith("synced-") ? (
        <div
          className="mb-6 rounded-lg border p-3 text-xs"
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            borderColor: "rgba(16, 185, 129, 0.35)",
            color: "#a7f3d0",
          }}
        >
          Sync complete — {searchParams.ok.replace("synced-", "").replace("-of-", " of ")}{" "}
          sites refreshed. Movers below may take a moment to appear.
        </div>
      ) : null}
      {searchParams.error === "no-connected-sites" ? (
        <div
          className="mb-6 rounded-lg border p-3 text-xs"
          style={{
            background: "rgba(244, 63, 94, 0.1)",
            borderColor: "rgba(244, 63, 94, 0.35)",
            color: "#fecaca",
          }}
        >
          No sites are connected to Google. Open a site page and click{" "}
          <span className="font-mono">Connect Google</span> first, then come back.
        </div>
      ) : null}

      {/* KPI strip — 5 cards, matches the BI reference top row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {totalKpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {/* Main row: performance chart + indexing donut */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <PerformanceChart series={series} />
        <IndexingCoveragePanel coverage={coverage} />
      </div>

      {/* Global empty-state banner if no snapshot data at all — placed BEFORE
          the mover widgets so it's immediately obvious what to do. */}
      {!movers.hasData ? <NoMoverDataBanner /> : null}

      {/* Ranking & Performance — the six mover widgets are consolidated into
          one tabbed card so the operator can toggle between the three views
          (Pages / Keywords / CTR) without scrolling. */}
      <div className="mb-6">
        <RankingPerformanceWidget
          pagesUp={movers.pagesUp}
          pagesDown={movers.pagesDown}
          queriesUp={movers.queriesUp}
          queriesDown={movers.queriesDown}
          ctrPagesUp={movers.ctrPagesUp}
          ctrPagesDown={movers.ctrPagesDown}
        />
      </div>

      {/* Indexing issues */}
      <IssuesTable issues={issues} />

      {/* Data-honesty disclosure */}
      <p className="mt-6 text-[10px] text-slate-500">
        Metrics are pulled directly from the Search Console API, filtered to UAE
        traffic. Search Console has a 24-72 hour data delay and anonymises
        low-volume queries — some very-long-tail data will not appear even
        after a sync.
      </p>
    </div>
  );
}

function NoMoverDataBanner() {
  return (
    <div
      className="mb-6 rounded-xl border p-4"
      style={{
        background: "rgba(34, 211, 238, 0.06)",
        borderColor: "rgba(34, 211, 238, 0.3)",
      }}
    >
      <p className="text-sm font-medium" style={{ color: CYAN }}>
        No mover snapshots yet — one click fixes this
      </p>
      <p className="mt-1.5 text-xs text-slate-300">
        The tables below are empty because the per-query and per-page snapshot
        buckets haven&apos;t been populated for your connected sites yet. Click{" "}
        <span className="font-mono text-cyan-300">Sync GSC now</span> above.
        Each sync writes two windows (recent + prior), so the movers will
        appear immediately after the first successful sync.
      </p>
    </div>
  );
}

/* ─────────── KPI Card ─────────── */

function KpiCard({
  kpi,
}: {
  kpi: { label: string; value: string; delta: number | null; positiveIsGood: boolean };
}) {
  const deltaColor =
    kpi.delta == null
      ? "text-slate-500"
      : kpi.delta > 0
        ? "text-emerald-400"
        : "text-rose-400";
  const sign = kpi.delta != null && kpi.delta > 0 ? "+" : "";
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4"
      style={{ background: PANEL_BG_ELEVATED, borderColor: BORDER }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${CYAN}, transparent)` }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {kpi.label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums leading-none tracking-tight"
        style={{ color: "#f1f5f9" }}
      >
        {kpi.value}
      </p>
      <p className={`mt-2 text-[11px] tabular-nums ${deltaColor}`}>
        {kpi.delta != null ? `${sign}${kpi.delta.toFixed(1)}% vs prior period` : "—"}
      </p>
    </div>
  );
}

/* ─────────── Performance chart ─────────── */

type Series = Awaited<ReturnType<typeof loadPerformanceSeries>>;

function PerformanceChart({ series }: { series: Series }) {
  const width = 720;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 26, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const points = series;
  const maxClicks = Math.max(1, ...points.map((p) => p.clicks));
  const maxImpressions = Math.max(1, ...points.map((p) => p.impressions));

  function xFor(i: number): number {
    if (points.length <= 1) return padding.left + innerW / 2;
    return padding.left + (i / (points.length - 1)) * innerW;
  }
  function yClicks(v: number): number {
    return padding.top + innerH - (v / maxClicks) * innerH;
  }
  function yImpr(v: number): number {
    return padding.top + innerH - (v / maxImpressions) * innerH;
  }

  const clicksPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yClicks(p.clicks)}`).join(" ");
  const imprPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yImpr(p.impressions)}`).join(" ");

  // Area fill under clicks
  const clicksArea =
    clicksPath +
    ` L${xFor(points.length - 1)},${padding.top + innerH} L${xFor(0)},${padding.top + innerH} Z`;

  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: PANEL_BG_ELEVATED, borderColor: BORDER }}
    >
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>
            Performance over time
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Clicks (filled) and impressions (line), last 90 days
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: CYAN }} />
            Clicks
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-4 rounded-full border-dashed"
              style={{ background: CYAN_DIM }}
            />
            Impressions
          </span>
        </div>
      </header>

      {points.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-slate-400" style={{ borderColor: BORDER }}>
          No performance data yet. Run <span className="font-mono">Sync GSC now</span> on a
          connected site to populate this chart.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: "500px" }}>
            <defs>
              <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CYAN} stopOpacity="0.35" />
                <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => (
              <line
                key={i}
                x1={padding.left}
                x2={width - padding.right}
                y1={padding.top + innerH * frac}
                y2={padding.top + innerH * frac}
                stroke="rgba(148, 163, 184, 0.1)"
                strokeWidth="1"
              />
            ))}
            {/* Clicks area */}
            <path d={clicksArea} fill="url(#clicksFill)" />
            {/* Impressions line (dashed) */}
            <path d={imprPath} fill="none" stroke={CYAN_DIM} strokeWidth="1.4" strokeDasharray="4 3" />
            {/* Clicks line */}
            <path d={clicksPath} fill="none" stroke={CYAN} strokeWidth="2" />
            {/* Y-axis labels */}
            {[maxClicks, Math.round(maxClicks / 2), 0].map((v, i) => (
              <text
                key={i}
                x={padding.left - 6}
                y={padding.top + innerH * (i / 2) + 4}
                fontSize="9"
                fill="#94a3b8"
                textAnchor="end"
              >
                {v.toLocaleString()}
              </text>
            ))}
            {/* X-axis labels: first, middle, last */}
            {[0, Math.floor(points.length / 2), points.length - 1]
              .filter((i) => i >= 0 && points[i])
              .map((i) => (
                <text
                  key={i}
                  x={xFor(i)}
                  y={height - 8}
                  fontSize="9"
                  fill="#94a3b8"
                  textAnchor="middle"
                >
                  {points[i].date.slice(5)}
                </text>
              ))}
          </svg>
        </div>
      )}
    </section>
  );
}

/* ─────────── Indexing coverage donut ─────────── */

function IndexingCoveragePanel({
  coverage,
}: {
  coverage: { buckets: IndexingBucket[]; total: number; hasData: boolean };
}) {
  const size = 180;
  const radius = 72;
  const stroke = 24;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const toneColors: Record<IndexingBucket["tone"], string> = {
    good: CYAN,
    warn: "#facc15", // yellow-400
    bad: "#f87171", // red-400
    neutral: "#64748b", // slate-500
  };

  let cumulative = 0;
  const arcs = coverage.buckets.map((b) => {
    const frac = coverage.total > 0 ? b.count / coverage.total : 0;
    const dash = `${frac * circumference} ${circumference}`;
    const rotation = (cumulative / coverage.total) * 360;
    cumulative += b.count;
    return { bucket: b, dash, rotation, frac };
  });

  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: PANEL_BG_ELEVATED, borderColor: BORDER }}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>
          Indexing coverage
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">
          All tracked URLs across every site
        </p>
      </header>

      {coverage.hasData ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="rgba(148, 163, 184, 0.1)"
                strokeWidth={stroke}
              />
              {arcs.map((a, i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={toneColors[a.bucket.tone]}
                  strokeWidth={stroke}
                  strokeDasharray={a.dash}
                  transform={`rotate(${a.rotation} ${cx} ${cy})`}
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-2xl font-semibold tabular-nums" style={{ color: "#f1f5f9" }}>
                  {coverage.total.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">URLs</p>
              </div>
            </div>
          </div>
          <ul className="flex-1 space-y-1.5">
            {coverage.buckets.map((b) => (
              <li key={b.key} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: toneColors[b.tone] }}
                />
                <span className="flex-1 truncate text-slate-300">{b.label}</span>
                <span className="tabular-nums text-slate-400">{b.count.toLocaleString()}</span>
                <span className="w-10 text-right text-[10px] tabular-nums text-slate-500">
                  {coverage.total > 0
                    ? `${((b.count / coverage.total) * 100).toFixed(1)}%`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-xs text-slate-400" style={{ borderColor: BORDER }}>
          <p style={{ color: "#e2e8f0" }}>No indexing data collected yet.</p>
          <p className="mt-1">
            Open{" "}
            <Link href="/admin/indexing" className="text-cyan-400 hover:text-cyan-300 underline">
              Indexing tracker
            </Link>{" "}
            and click <span className="font-mono">Run sweep</span>, or run{" "}
            <span className="font-mono">npm run health:sweep</span> from the terminal.
          </p>
        </div>
      )}
    </section>
  );
}

/* ─────────── Issues table ─────────── */

function IssuesTable({ issues }: { issues: IndexingIssueRow[] }) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ background: PANEL_BG_ELEVATED, borderColor: BORDER }}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>
          Indexing issues
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">
          URLs not in the index — sorted by most recent inspection
        </p>
      </header>
      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-slate-400" style={{ borderColor: BORDER }}>
          <p style={{ color: "#e2e8f0" }}>
            No indexing issues on record.
          </p>
          <p className="mt-1">
            If this is a fresh install, the tracker hasn&apos;t inspected any URLs
            yet. Open{" "}
            <Link href="/admin/indexing" className="text-cyan-400 hover:text-cyan-300 underline">
              Indexing tracker
            </Link>{" "}
            to run the sweep — issues (if any) will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2 text-left font-medium">URL</th>
                <th className="pb-2 text-left font-medium">State</th>
                <th className="pb-2 text-left font-medium">Coverage detail</th>
                <th className="pb-2 text-right font-medium">HTTP</th>
                <th className="pb-2 text-right font-medium">Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: BORDER }}>
              {issues.map((r, i) => (
                <tr key={i} style={{ borderColor: BORDER }}>
                  <td className="max-w-[280px] truncate py-2 text-slate-200" title={r.url}>
                    {r.url}
                  </td>
                  <td className="py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                      style={{
                        background: "rgba(250, 204, 21, 0.12)",
                        color: "#facc15",
                      }}
                    >
                      {r.indexState}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate py-2 text-slate-400" title={r.coverageState ?? ""}>
                    {r.coverageState ?? "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-300">
                    {r.httpStatus ?? "—"}
                  </td>
                  <td className="py-2 text-right text-slate-400">
                    {r.lastCheckedAt ? formatRelative(r.lastCheckedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─────────── Range selector ─────────── */

function RangeSelector({ current }: { current: string }) {
  const options = [
    { id: "7d", label: "Last 7 days" },
    { id: "28d", label: "Last 28 days" },
    { id: "90d", label: "Last 90 days" },
  ];
  return (
    <div
      className="flex items-center gap-1 rounded-full border p-1"
      style={{ background: PANEL_BG_ELEVATED, borderColor: BORDER }}
    >
      {options.map((o) => {
        const active = o.id === current;
        return (
          <Link
            key={o.id}
            href={`/admin/gsc?range=${o.id}`}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
              active ? "text-slate-900" : "text-slate-400 hover:text-slate-200"
            }`}
            style={active ? { background: CYAN } : undefined}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
