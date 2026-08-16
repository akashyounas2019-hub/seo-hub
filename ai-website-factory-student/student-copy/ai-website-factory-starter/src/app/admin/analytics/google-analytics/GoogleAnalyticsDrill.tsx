"use client";

/**
 * GA4 drilldown UI. Dark cyan-grid canvas. Range selector, 4 hero ring-KPIs,
 * secondary metric strip, Sessions vs Users weekly chart, Rising / Dropping /
 * Engagement columns, Top Channels bars, Devices bars, Top Performing Pages
 * table, Top Countries bars.
 */
import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, Users, Clock, TrendingUp, Zap,
  MonitorSmartphone, Globe, AlertTriangle,
} from "lucide-react";

export type GADrillProps = {
  range: "7d" | "14v14" | "28d" | "3m" | "6m" | "12m";
  empty: boolean;
  hero: {
    sessions: { value: number; delta: number };
    users:    { value: number; delta: number };
    avgEngagement: { value: number; delta: number };
    conversions:   { value: number; delta: number };
  };
  secondary: {
    revenue: number;
    revenueDelta: number;
    bounceRate: number;
    pagesPerSession: number;
    newUsers: number;
    returningUsers: number;
    keyEvents: number;
    keyEventsDelta: number;
  };
  chartWeekly: { label: string; sessions: number; users: number }[];
  risingPages:  { page: string; delta: number }[];
  droppingPages: { page: string; delta: number }[];
  engagementAlerts: string[];
  topChannels: { label: string; value: number }[];
  devices:     { label: string; value: number }[];
  topPages:    { page: string; views: number; sessions: number }[];
  topCountries: { label: string; value: number }[];
};

const RANGES: { id: GADrillProps["range"]; label: string }[] = [
  { id: "7d",    label: "Last 7 days" },
  { id: "14v14", label: "14 vs 14" },
  { id: "28d",   label: "Last 28 days" },
  { id: "3m",    label: "Last 3 months" },
  { id: "6m",    label: "Last 6 months" },
  { id: "12m",   label: "Last 12 months" },
];

export function GoogleAnalyticsDrill(p: GADrillProps) {
  const router = useRouter();
  const params = useSearchParams();
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
      <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full blur-3xl bg-orange-500/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full blur-3xl bg-cyan-500/10" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin/analytics" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
              <ArrowLeft className="w-3.5 h-3.5" /> All properties
            </Link>
            <h1 className="mt-2 text-4xl font-light">Google Analytics</h1>
            <p className="mt-2 text-sm text-slate-400 max-w-2xl">
              GA4 traffic, engagement and conversion metrics across every connected site.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
            {RANGES.map((r) => {
              const active = p.range === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    const sp = new URLSearchParams(params?.toString() ?? "");
                    sp.set("range", r.id);
                    router.push(`?${sp.toString()}`);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs transition ${
                    active ? "bg-orange-500/20 text-orange-200 border border-orange-500/30" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </header>

        {p.empty && <EmptyBanner href="/admin/analytics" note="No GA4 samples in traffic_snapshots yet — run npm run sync:ga4 to backfill." />}

        {/* Hero KPI ring row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <RingKpi color="#f97316" label="Sessions"       value={fmt(p.hero.sessions.value)}       delta={p.hero.sessions.delta}       icon={<Users className="w-4 h-4" />} />
          <RingKpi color="#f59e0b" label="Users"          value={fmt(p.hero.users.value)}          delta={p.hero.users.delta}          icon={<Users className="w-4 h-4" />} />
          <RingKpi color="#06b6d4" label="Avg Engagement" value={fmtDuration(p.hero.avgEngagement.value)} delta={p.hero.avgEngagement.delta} icon={<Clock className="w-4 h-4" />} />
          <RingKpi color="#22c55e" label="Conversions"    value={fmt(p.hero.conversions.value)}    delta={p.hero.conversions.delta}    icon={<TrendingUp className="w-4 h-4" />} />
        </div>

        {/* Secondary strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label="Revenue" value={`AED ${fmt(p.secondary.revenue)}`} delta={p.secondary.revenueDelta} />
          <MiniStat label="Bounce Rate" value={`${(p.secondary.bounceRate * 100).toFixed(1)}%`} />
          <MiniStat label="Pages / Session" value={p.secondary.pagesPerSession.toFixed(2)} />
          <MiniStat label="New vs Returning" value={`${fmt(p.secondary.newUsers)} / ${fmt(p.secondary.returningUsers)}`} />
          <MiniStat label="Key Events" value={fmt(p.secondary.keyEvents)} delta={p.secondary.keyEventsDelta} />
        </div>

        {/* Weekly Sessions vs Users chart */}
        <Card title="Sessions vs Users (weekly)">
          <WeeklyLineChart data={p.chartWeekly} />
        </Card>

        {/* Insight columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <InsightColumn title="Rising pages" tone="up" items={p.risingPages.map((r) => ({ label: r.page, value: `${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)}%` }))} />
          <InsightColumn title="Dropping pages" tone="down" items={p.droppingPages.map((r) => ({ label: r.page, value: `${r.delta.toFixed(1)}%` }))} />
          <InsightColumn title="Engagement alerts" tone="warn" items={p.engagementAlerts.map((a) => ({ label: a, value: "" }))} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Top Channels">
            <BarList rows={p.topChannels} color="#f97316" />
          </Card>
          <Card title="Devices">
            <BarList rows={p.devices} color="#06b6d4" />
          </Card>
        </div>

        <Card title="Top Performing Pages">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left py-2 pl-1">Page</th>
                <th className="text-right py-2">Views</th>
                <th className="text-right py-2 pr-1">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {p.topPages.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-slate-500">No pages yet</td></tr>
              )}
              {p.topPages.map((row) => (
                <tr key={row.page} className="border-t border-white/[0.06]">
                  <td className="py-2 pl-1 text-slate-300 truncate max-w-[520px]">{row.page}</td>
                  <td className="py-2 text-right">{fmt(row.views)}</td>
                  <td className="py-2 pr-1 text-right text-slate-400">{fmt(row.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Top Countries">
          <BarList rows={p.topCountries} color="#a855f7" />
        </Card>
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

function EmptyBanner({ href, note }: { href: string; note: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{note}</span>
      <Link href={href} className="ml-auto text-xs underline underline-offset-4">Back</Link>
    </div>
  );
}

function RingKpi({ color, label, value, delta, icon }: { color: string; label: string; value: string; delta: number; icon: React.ReactNode }) {
  const positive = delta > 0;
  const pct = Math.max(0, Math.min(100, Math.abs(delta)));
  const r = 24, C = 2 * Math.PI * r;
  const off = C - (pct / 100) * C;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
            <circle cx="30" cy="30" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
            <circle cx="30" cy="30" r={r} stroke={color} strokeWidth="6" fill="none" strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">{icon}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
          <div className="text-2xl font-light tracking-tight">{value}</div>
          <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${positive ? "text-emerald-400" : delta === 0 ? "text-slate-500" : "text-red-400"}`}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : delta === 0 ? "•" : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 text-base font-light tracking-tight">{value}</div>
      {delta != null && (
        <div className={`text-[10px] mt-0.5 ${delta > 0 ? "text-emerald-400" : delta === 0 ? "text-slate-500" : "text-red-400"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}%
        </div>
      )}
    </div>
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

function WeeklyLineChart({ data }: { data: { label: string; sessions: number; users: number }[] }) {
  const w = 900, h = 260, pad = 32;
  const usable = data.slice(-12);
  if (usable.length === 0) return <div className="py-16 text-center text-slate-500 text-sm">No weekly data</div>;
  const max = Math.max(1, ...usable.flatMap((d) => [d.sessions, d.users]));
  const step = (w - pad * 2) / Math.max(1, usable.length - 1);
  const proj = (val: number) => h - pad - (val / max) * (h - pad * 2);
  const line = (key: "sessions" | "users") =>
    usable.map((d, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${proj(d[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-64">
      <defs>
        <linearGradient id="ga-sessions" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#f97316" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* horizontal guides */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      <path d={`${line("sessions")} L${(pad + (usable.length - 1) * step).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`} fill="url(#ga-sessions)" />
      <path d={line("sessions")} stroke="#f97316" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line("users")}    stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {usable.map((d, i) => (
        <text key={d.label} x={pad + i * step} y={h - 6} textAnchor="middle" fontSize="9" fill="rgba(148,163,184,0.7)">{d.label.slice(5)}</text>
      ))}
      {/* legend */}
      <g transform={`translate(${pad}, 12)`}>
        <rect x="0" y="0" width="8" height="8" fill="#f97316" rx="2" />
        <text x="12" y="8" fontSize="10" fill="rgba(226,232,240,0.8)">Sessions</text>
        <rect x="80" y="0" width="8" height="8" fill="#06b6d4" rx="2" />
        <text x="92" y="8" fontSize="10" fill="rgba(226,232,240,0.8)">Users</text>
      </g>
    </svg>
  );
}

/* ─────────── formatting ─────────── */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}
function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}m ${s}s`;
}
