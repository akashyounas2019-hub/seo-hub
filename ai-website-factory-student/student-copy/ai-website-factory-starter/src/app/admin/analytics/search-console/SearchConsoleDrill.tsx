"use client";

/**
 * Search Console drilldown UI. Dark cyan-grid canvas + 4 metric cards with
 * mini-sparkline, Clicks vs Impressions weekly chart with CTR overlay,
 * three insight columns (CTR up / CTR down / Position dropped), Top Ranking
 * Keywords table, Top Performing Pages table, Devices + Countries.
 */
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, AlertTriangle, MousePointerClick, Eye, Percent, Hash } from "lucide-react";

export type GSCDrillProps = {
  empty: boolean;
  hero: {
    clicks:      { value: number; delta: number; spark: number[] };
    impressions: { value: number; delta: number; spark: number[] };
    ctr:         { value: number; delta: number; spark: number[] };
    position:    { value: number; delta: number; spark: number[]; inverted: true };
  };
  chartWeekly: { label: string; clicks: number; impressions: number; ctr: number }[];
  ctrRising:  { query: string; delta: number }[];
  ctrDropping: { query: string; delta: number }[];
  posDropping: { query: string; from: number; to: number }[];
  topQueries: { query: string; clicks: number; ctr: number; position: number; trend: number }[];
  topPages:   { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
  devices:      { label: string; value: number }[];
  topCountries: { label: string; value: number }[];
};

export function SearchConsoleDrill(p: GSCDrillProps) {
  return (
    <div className="relative min-h-screen bg-[#05070d] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full blur-3xl bg-cyan-500/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full blur-3xl bg-blue-600/10" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-10 space-y-8">
        <header>
          <Link href="/admin/analytics" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" /> All properties
          </Link>
          <h1 className="mt-2 text-4xl font-light">Search Console</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Impressions, clicks, click-through rate and average rank position across every verified property. Rolling 28-day window
            unless otherwise noted.
          </p>
        </header>

        {p.empty && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>No GSC snapshots yet — run <code className="text-amber-300 font-mono">npm run sync:gsc</code> to backfill.</span>
          </div>
        )}

        {/* Hero cards with sparklines */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={<MousePointerClick className="w-4 h-4" />} label="Clicks"      value={fmt(p.hero.clicks.value)}   delta={p.hero.clicks.delta}   spark={p.hero.clicks.spark}      color="#06b6d4" />
          <MetricCard icon={<Eye className="w-4 h-4" />}               label="Impressions" value={fmt(p.hero.impressions.value)} delta={p.hero.impressions.delta} spark={p.hero.impressions.spark} color="#22d3ee" />
          <MetricCard icon={<Percent className="w-4 h-4" />}           label="CTR"         value={`${(p.hero.ctr.value * 100).toFixed(2)}%`} delta={p.hero.ctr.delta} spark={p.hero.ctr.spark} color="#a855f7" />
          <MetricCard icon={<Hash className="w-4 h-4" />}              label="Avg Position" value={p.hero.position.value > 0 ? p.hero.position.value.toFixed(1) : "—"} delta={p.hero.position.delta} spark={p.hero.position.spark} color="#f97316" inverted />
        </div>

        {/* Clicks vs Impressions chart */}
        <Card title="Clicks vs Impressions (12 weeks)" right={<Legend items={[{ color: "#06b6d4", label: "Clicks" }, { color: "#22d3ee", label: "Impressions" }, { color: "#a855f7", label: "CTR" }]} />}>
          <ClicksImpressionsChart data={p.chartWeekly} />
        </Card>

        {/* Insight columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <InsightColumn title="CTR increased" tone="up"   items={p.ctrRising.map((r) => ({ label: r.query, value: `+${r.delta.toFixed(1)}%` }))} />
          <InsightColumn title="CTR decreased" tone="down" items={p.ctrDropping.map((r) => ({ label: r.query, value: `${r.delta.toFixed(1)}%` }))} />
          <InsightColumn title="Dropped in rank" tone="warn" items={p.posDropping.map((r) => ({ label: r.query, value: `${r.from.toFixed(1)} → ${r.to.toFixed(1)}` }))} />
        </div>

        {/* Top Ranking Keywords */}
        <Card title="Top Ranking Keywords">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left py-2 pl-1">Query</th>
                <th className="text-right py-2">Clicks</th>
                <th className="text-right py-2">CTR</th>
                <th className="text-right py-2">Pos</th>
                <th className="text-right py-2 pr-1">Trend</th>
              </tr>
            </thead>
            <tbody>
              {p.topQueries.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">No queries yet</td></tr>
              )}
              {p.topQueries.map((row) => (
                <tr key={row.query} className="border-t border-white/[0.06]">
                  <td className="py-2 pl-1 text-slate-300 truncate max-w-[420px]">{row.query}</td>
                  <td className="py-2 text-right">{fmt(row.clicks)}</td>
                  <td className="py-2 text-right text-slate-400">{(row.ctr * 100).toFixed(2)}%</td>
                  <td className="py-2 text-right text-slate-400">{row.position > 0 ? row.position.toFixed(1) : "—"}</td>
                  <td className={`py-2 pr-1 text-right ${row.trend > 0 ? "text-emerald-400" : row.trend < 0 ? "text-red-400" : "text-slate-500"}`}>
                    {row.trend > 0 ? "▲" : row.trend < 0 ? "▼" : "•"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Top Performing Pages */}
        <Card title="Top Performing Pages">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left py-2 pl-1">Page</th>
                <th className="text-right py-2">Clicks</th>
                <th className="text-right py-2">Impressions</th>
                <th className="text-right py-2">CTR</th>
                <th className="text-right py-2 pr-1">Pos</th>
              </tr>
            </thead>
            <tbody>
              {p.topPages.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">No pages yet</td></tr>
              )}
              {p.topPages.map((row) => (
                <tr key={row.page} className="border-t border-white/[0.06]">
                  <td className="py-2 pl-1 text-slate-300 truncate max-w-[420px]">{row.page}</td>
                  <td className="py-2 text-right">{fmt(row.clicks)}</td>
                  <td className="py-2 text-right text-slate-400">{fmt(row.impressions)}</td>
                  <td className="py-2 text-right text-slate-400">{(row.ctr * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-1 text-right text-slate-400">{row.position > 0 ? row.position.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Devices"><BarList rows={p.devices} color="#06b6d4" /></Card>
          <Card title="Top Countries"><BarList rows={p.topCountries} color="#a855f7" /></Card>
        </div>
      </div>
    </div>
  );
}

/* ─────────── atoms ─────────── */

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-3 text-[11px] text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

function MetricCard({ icon, label, value, delta, spark, color, inverted }: { icon: React.ReactNode; label: string; value: string; delta: number; spark: number[]; color: string; inverted?: boolean }) {
  const positive = inverted ? delta > 0 : delta > 0;
  const w = 200, h = 40, pad = 3;
  const max = Math.max(1, ...spark);
  const min = Math.min(0, ...spark);
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
  const step = (w - pad * 2) / Math.max(1, spark.length - 1);
  const points = spark.map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - norm(v) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">{icon}{label}</div>
        <div className={`text-[11px] flex items-center gap-1 ${positive ? "text-emerald-400" : delta === 0 ? "text-slate-500" : "text-red-400"}`}>
          {positive ? <ArrowUpRight className="w-3 h-3" /> : delta === 0 ? "•" : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(delta)}{typeof delta === "number" && Math.abs(delta) < 10 ? "" : "%"}
        </div>
      </div>
      <div className="mt-1.5 text-2xl font-light tracking-tight">{value}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-2">
        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    </div>
  );
}

function InsightColumn({ title, tone, items }: { title: string; tone: "up" | "down" | "warn"; items: { label: string; value: string }[] }) {
  const dot = tone === "up" ? "bg-emerald-400" : tone === "down" ? "bg-red-400" : "bg-amber-400";
  const val = tone === "up" ? "text-emerald-300" : tone === "down" ? "text-red-300" : "text-amber-300";
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {title}
      </div>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-xs text-slate-500 py-2">No signals in this range.</li>}
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-300 truncate">{it.label}</span>
            <span className={`text-xs font-mono ${val} shrink-0`}>{it.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BarList({ rows, color }: { rows: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div className="py-6 text-center text-slate-500 text-sm">No data yet</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{r.label}</span><span className="text-slate-500">{fmt(r.value)}</span></div>
          <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClicksImpressionsChart({ data }: { data: { label: string; clicks: number; impressions: number; ctr: number }[] }) {
  const w = 900, h = 260, pad = 32;
  if (data.length === 0) return <div className="py-16 text-center text-slate-500 text-sm">No weekly data</div>;
  const maxClicks = Math.max(1, ...data.map((d) => d.clicks));
  const maxImpr   = Math.max(1, ...data.map((d) => d.impressions));
  const maxCTR    = Math.max(0.01, ...data.map((d) => d.ctr));
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const projClicks = (v: number) => h - pad - (v / maxClicks) * (h - pad * 2);
  const projImpr   = (v: number) => h - pad - (v / maxImpr) * (h - pad * 2);
  const projCTR    = (v: number) => h - pad - (v / maxCTR) * (h - pad * 2);
  const path = (proj: (v: number) => number, key: "clicks" | "impressions" | "ctr") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${proj(d[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-64">
      <defs>
        <linearGradient id="gsc-imp" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)} stroke="rgba(255,255,255,0.05)" />
      ))}
      <path d={`${path(projImpr, "impressions")} L${(pad + (data.length - 1) * step).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`} fill="url(#gsc-imp)" />
      <path d={path(projImpr, "impressions")} stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(projClicks, "clicks")}    stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(projCTR, "ctr")}          stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4 3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <text key={d.label} x={pad + i * step} y={h - 6} textAnchor="middle" fontSize="9" fill="rgba(148,163,184,0.7)">{d.label.slice(5)}</text>
      ))}
    </svg>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}
