import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart3,
  Search,
  MapPin,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Eye,
  MousePointerClick,
  Star,
  Phone,
  Navigation,
  TrendingUp,
  Facebook,
  Youtube,
  Instagram,
  Linkedin,
  Sparkles,
  Shield,
  X,
} from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — AKS SEO Console" },
      {
        name: "description",
        content:
          "Unified analytics dashboard: Google Analytics, Search Console and Google Business Profile, with drill-down SEO insights.",
      },
      { property: "og:title", content: "Analytics — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Traffic, search visibility and local performance across Google properties, in one professional dashboard.",
      },
    ],
  }),
  component: AnalyticsPage,
});

type Widget = {
  id: string;
  provider: "ga" | "gsc" | "gmb";
  label: string;
  tagline: string;
  from: string;
  to: string;
  icon: typeof BarChart3;
  status: "Connected";
  metrics: { label: string; value: string; delta: number; icon: typeof Users }[];
  spark: number[];
  drillTo?: string;
};

const WIDGETS: Widget[] = [
  {
    id: "ga",
    provider: "ga",
    label: "Google Analytics",
    tagline: "Traffic · Engagement · Conversions",
    from: "#fb923c",
    to: "#f59e0b",
    icon: BarChart3,
    status: "Connected",
    metrics: [
      { label: "Sessions (28d)", value: "48.2k", delta: 12.4, icon: Users },
      { label: "Avg engagement", value: "2m 41s", delta: 3.1, icon: Eye },
      { label: "Conversions", value: "1,624", delta: 8.7, icon: MousePointerClick },
    ],
    spark: [22, 28, 26, 34, 31, 40, 38, 46, 44, 52, 49, 58],
    drillTo: "/analytics/google-analytics",
  },
  {
    id: "gsc",
    provider: "gsc",
    label: "Search Console",
    tagline: "Impressions · Clicks · Position",
    from: "#22d3ee",
    to: "#3b82f6",
    icon: Search,
    status: "Connected",
    metrics: [
      { label: "Impressions", value: "312k", delta: 18.2, icon: Eye },
      { label: "Clicks", value: "14.7k", delta: 9.4, icon: MousePointerClick },
      { label: "Avg position", value: "11.4", delta: -1.6, icon: TrendingUp },
    ],
    spark: [12, 14, 18, 17, 22, 26, 24, 30, 34, 32, 38, 42],
    drillTo: "/analytics/search-console",
  },
  {
    id: "gmb",
    provider: "gmb",
    label: "Google Business Profile",
    tagline: "Calls · Directions · Reviews",
    from: "#a78bfa",
    to: "#ec4899",
    icon: MapPin,
    status: "Connected",
    metrics: [
      { label: "Calls", value: "482", delta: 22.1, icon: Phone },
      { label: "Directions", value: "1,204", delta: 14.3, icon: Navigation },
      { label: "Reviews (4.8★)", value: "312", delta: 5.9, icon: Star },
    ],
    spark: [8, 10, 9, 14, 12, 18, 20, 22, 21, 26, 28, 32],
    drillTo: "/analytics/business-profile",
  },
];

const AVAILABLE_PROVIDERS = [
  { id: "facebook", label: "Facebook", desc: "Page insights, ads, reach", icon: Facebook, from: "#60a5fa", to: "#3b82f6" },
  { id: "youtube", label: "YouTube", desc: "Views, watch time, subs", icon: Youtube, from: "#f87171", to: "#dc2626" },
  { id: "instagram", label: "Instagram", desc: "Reach, engagement, saves", icon: Instagram, from: "#f472b6", to: "#a855f7" },
  { id: "linkedin", label: "LinkedIn", desc: "Company page & post reach", icon: Linkedin, from: "#38bdf8", to: "#0ea5e9" },
  { id: "tiktok", label: "TikTok", desc: "Video views & follows", icon: Sparkles, from: "#22d3ee", to: "#ec4899" },
];

function AnalyticsPage() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Unified Insights
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Analytics</h1>
            <p className="mt-1 text-sm text-slate-400">
              Traffic, search visibility and local performance — securely aggregated across your connected properties.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300">
              <Shield className="h-3.5 w-3.5" /> Secure OAuth
            </span>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-4 w-4" /> Add new widget
            </button>
          </div>
        </div>

        {/* Widgets */}
        <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((w) => (
            <WidgetCard key={w.id} widget={w} />
          ))}
          <AddWidgetCard onClick={() => setShowAdd(true)} />
        </section>

        <div aria-hidden className="h-16" />
      </div>

      {showAdd && <AddWidgetModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function WidgetCard({ widget }: { widget: Widget }) {
  const Icon = widget.icon;
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_25px_rgba(34,211,238,0.08)]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(to right, ${widget.from}, ${widget.to})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.09] blur-3xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${widget.from}, transparent 70%)` }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-950 shadow"
            style={{ background: `linear-gradient(135deg, ${widget.from}, ${widget.to})` }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">{widget.label}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{widget.tagline}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {widget.status}
        </span>
      </div>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {widget.metrics.map((m) => {
          const MIcon = m.icon;
          const up = m.delta >= 0;
          return (
            <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                <MIcon className="h-3 w-3" /> {m.label}
              </div>
              <div className="mt-1 text-base font-semibold tabular-nums text-white">{m.value}</div>
              <div
                className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium ${
                  up ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(m.delta)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Sparkline */}
      <div className="mt-4">
        <Sparkline data={widget.spark} from={widget.from} to={widget.to} />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Last 12 weeks</div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 transition group-hover:text-cyan-200">
          {widget.drillTo ? "Drill down" : "View report"}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );

  return widget.drillTo ? (
    <Link to={widget.drillTo} className="block h-full">
      {inner}
    </Link>
  ) : (
    <div className="h-full">{inner}</div>
  );
}

function Sparkline({ data, from, to }: { data: number[]; from: string; to: string }) {
  const w = 300;
  const h = 56;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3] as const);
  const line = pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  const gid = `sg-${from.replace("#", "")}-${to.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${gid}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={from} stopOpacity="0.35" />
          <stop offset="100%" stopColor={from} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid}-fill)`} />
      <path d={line} fill="none" stroke={`url(#${gid})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AddWidgetCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/20 p-6 text-center transition hover:border-cyan-400/50 hover:bg-slate-900/50"
    >
      <div className="grid h-12 w-12 place-items-center rounded-full border border-slate-700 bg-slate-950/60 text-slate-400 transition group-hover:border-cyan-400/50 group-hover:text-cyan-200">
        <Plus className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Add new widget</div>
        <div className="mt-1 text-xs text-slate-500">Facebook · YouTube · Instagram · LinkedIn · TikTok</div>
      </div>
    </button>
  );
}

function AddWidgetModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Add a new widget</h2>
            <p className="mt-1 text-xs text-slate-400">
              Connect another data source. All access uses OAuth — your credentials stay with the provider.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AVAILABLE_PROVIDERS.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.id}>
                <button className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-950"
                      style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white leading-tight">{p.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{p.desc}</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-300 group-hover:border-cyan-400/40 group-hover:text-cyan-200">
                    Connect <ArrowUpRight className="h-3 w-3" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4 text-[11px] text-slate-500">
          <div className="inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-300" />
            Encrypted at rest · Revoke anytime
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
