"use client";

/**
 * Google Business Profile drilldown. Dark cyan-grid canvas + 4 hero KPIs,
 * Profile Views vs Calls weekly chart, Top Search Queries table, Customer
 * Actions bars, Photo Views split, and Recent Reviews cards.
 */
import Link from "next/link";
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, Eye, Phone, Navigation,
  Star, MessageSquare, Globe as GlobeIcon, Camera, AlertTriangle,
} from "lucide-react";

export type BPDrillProps = {
  empty: boolean;
  hero: {
    profileViews: { value: number; delta: number };
    calls:        { value: number; delta: number };
    directions:   { value: number; delta: number };
    reviews:      { value: number; delta: number; avgRating: number };
  };
  chartWeekly: { label: string; views: number; calls: number }[];
  topQueries: { query: string; views: number; actions: number }[];
  customerActions: {
    websiteVisits: number;
    calls: number;
    directions: number;
    messages: number;
  };
  photoViews: { owner: number; customer: number };
  recentReviews: { name: string; rating: number; date: string; text: string }[];
};

export function BusinessProfileDrill(p: BPDrillProps) {
  const total = p.customerActions.websiteVisits + p.customerActions.calls + p.customerActions.directions + p.customerActions.messages;
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
      <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full blur-3xl bg-fuchsia-500/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full blur-3xl bg-cyan-500/10" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-10 space-y-8">
        <header>
          <Link href="/admin/analytics" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" /> All properties
          </Link>
          <h1 className="mt-2 text-4xl font-light">Google Business Profile</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Local search visibility, customer actions and reviews across every listed location. 28-day rolling window.
          </p>
        </header>

        {p.empty && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>No Business Profile samples in traffic_snapshots yet — connect a listing and let the daily sync populate.</span>
          </div>
        )}

        {/* Hero KPI ring row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <RingKpi color="#a855f7" label="Profile Views" value={fmt(p.hero.profileViews.value)} delta={p.hero.profileViews.delta} icon={<Eye className="w-4 h-4" />} />
          <RingKpi color="#06b6d4" label="Calls"         value={fmt(p.hero.calls.value)}         delta={p.hero.calls.delta}         icon={<Phone className="w-4 h-4" />} />
          <RingKpi color="#22c55e" label="Directions"    value={fmt(p.hero.directions.value)}    delta={p.hero.directions.delta}    icon={<Navigation className="w-4 h-4" />} />
          <RingKpi
            color="#f59e0b"
            label={`Reviews${p.hero.reviews.avgRating ? ` · ${p.hero.reviews.avgRating.toFixed(1)}★` : ""}`}
            value={fmt(p.hero.reviews.value)}
            delta={p.hero.reviews.delta}
            icon={<Star className="w-4 h-4" />}
          />
        </div>

        {/* Views vs Calls weekly */}
        <Card
          title="Profile Views vs Calls (12 weeks)"
          right={<Legend items={[{ color: "#a855f7", label: "Profile Views" }, { color: "#06b6d4", label: "Calls" }]} />}
        >
          <ViewsCallsChart data={p.chartWeekly} />
        </Card>

        {/* Top Search Queries */}
        <Card title="Top Search Queries">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="text-left py-2 pl-1">Query</th>
                <th className="text-right py-2">Profile Views</th>
                <th className="text-right py-2 pr-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {p.topQueries.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-slate-500">No queries yet</td></tr>
              )}
              {p.topQueries.map((row) => (
                <tr key={row.query} className="border-t border-white/[0.06]">
                  <td className="py-2 pl-1 text-slate-300 truncate max-w-[520px]">{row.query}</td>
                  <td className="py-2 text-right">{fmt(row.views)}</td>
                  <td className="py-2 pr-1 text-right text-slate-400">{fmt(row.actions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Customer Actions">
            <BarList
              rows={[
                { icon: <GlobeIcon className="w-3.5 h-3.5" />,      label: "Website visits", value: p.customerActions.websiteVisits, color: "#06b6d4" },
                { icon: <Phone className="w-3.5 h-3.5" />,          label: "Calls",          value: p.customerActions.calls,         color: "#22c55e" },
                { icon: <Navigation className="w-3.5 h-3.5" />,     label: "Directions",     value: p.customerActions.directions,    color: "#a855f7" },
                { icon: <MessageSquare className="w-3.5 h-3.5" />,  label: "Messages",       value: p.customerActions.messages,      color: "#f59e0b" },
              ]}
              total={total}
            />
          </Card>
          <Card title="Photo Views">
            <div className="space-y-4">
              <PhotoStat icon={<Camera className="w-4 h-4 text-cyan-300" />} label="Owner-uploaded" value={p.photoViews.owner} tone="cyan" />
              <PhotoStat icon={<Camera className="w-4 h-4 text-fuchsia-300" />} label="Customer-uploaded" value={p.photoViews.customer} tone="fuchsia" />
            </div>
          </Card>
          <Card title="Snapshot">
            <ul className="space-y-2 text-sm">
              <SnapshotRow label="Total 28-day actions" value={fmt(total)} />
              <SnapshotRow label="Avg rating" value={p.hero.reviews.avgRating ? `${p.hero.reviews.avgRating.toFixed(2)} / 5` : "—"} />
              <SnapshotRow label="Call-to-view ratio" value={p.hero.profileViews.value > 0 ? `${((p.hero.calls.value / p.hero.profileViews.value) * 100).toFixed(2)}%` : "—"} />
              <SnapshotRow label="Direction-to-view ratio" value={p.hero.profileViews.value > 0 ? `${((p.hero.directions.value / p.hero.profileViews.value) * 100).toFixed(2)}%` : "—"} />
            </ul>
          </Card>
        </div>

        {/* Recent Reviews */}
        <Card title="Recent Reviews">
          {p.recentReviews.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No reviews yet in this window.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {p.recentReviews.map((rv, i) => (
                <ReviewCard key={`${rv.name}-${rv.date}-${i}`} review={rv} />
              ))}
            </div>
          )}
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

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-3 text-[11px] text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
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

function BarList({ rows, total }: { rows: { icon: React.ReactNode; label: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0;
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300 flex items-center gap-1.5">{r.icon}{r.label}</span>
              <span className="text-slate-500">{fmt(r.value)} · {pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PhotoStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "cyan" | "fuchsia" }) {
  const bg = tone === "cyan" ? "bg-cyan-500/10" : "bg-fuchsia-500/10";
  return (
    <div className={`rounded-xl border border-white/10 ${bg} px-4 py-3 flex items-center justify-between`}>
      <div className="flex items-center gap-2">{icon}<span className="text-sm text-slate-200">{label}</span></div>
      <span className="text-lg font-light tracking-tight">{fmt(value)}</span>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </li>
  );
}

function ReviewCard({ review }: { review: { name: string; rating: number; date: string; text: string } }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-xs">
            {review.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-sm text-slate-200">{review.name}</div>
            <div className="text-[10px] text-slate-500">{review.date}</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} />
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-300 leading-relaxed">{review.text}</p>
    </div>
  );
}

function ViewsCallsChart({ data }: { data: { label: string; views: number; calls: number }[] }) {
  const w = 900, h = 260, pad = 32;
  if (data.length === 0) return <div className="py-16 text-center text-slate-500 text-sm">No weekly data</div>;
  const maxViews = Math.max(1, ...data.map((d) => d.views));
  const maxCalls = Math.max(1, ...data.map((d) => d.calls));
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const proj = (v: number, m: number) => h - pad - (v / m) * (h - pad * 2);
  const line = (key: "views" | "calls", m: number) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${proj(d[key], m).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-64">
      <defs>
        <linearGradient id="bp-views" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)} stroke="rgba(255,255,255,0.05)" />
      ))}
      <path d={`${line("views", maxViews)} L${(pad + (data.length - 1) * step).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`} fill="url(#bp-views)" />
      <path d={line("views", maxViews)} stroke="#a855f7" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line("calls", maxCalls)} stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
