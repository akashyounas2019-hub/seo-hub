import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Search,
  MapPin,
  Plus,
  ArrowUpRight,
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
  Loader2,
} from "lucide-react";
import { useSite } from "@/lib/site-context";

export const Route = createFileRoute("/analytics/")({
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

type WidgetMetric = { label: string; value: string; icon: typeof Users };

type WidgetState = {
  connected: boolean;
  loading: boolean;
  error: string | null;
  metrics: WidgetMetric[] | null;
};

const WIDGET_META = {
  ga: { label: "Google Analytics", tagline: "Traffic · Engagement · Conversions", from: "#fb923c", to: "#f59e0b", icon: BarChart3, drillTo: "/analytics/google-analytics" as const },
  gsc: { label: "Search Console", tagline: "Impressions · Clicks · Position", from: "#22d3ee", to: "#3b82f6", icon: Search, drillTo: "/analytics/search-console" as const },
  gmb: { label: "Google Business Profile", tagline: "Calls · Directions · Reviews", from: "#a78bfa", to: "#ec4899", icon: MapPin, drillTo: "/analytics/business-profile" as const },
};

const AVAILABLE_PROVIDERS = [
  { id: "facebook", label: "Facebook", desc: "Page insights, ads, reach", icon: Facebook, from: "#60a5fa", to: "#3b82f6" },
  { id: "youtube", label: "YouTube", desc: "Views, watch time, subs", icon: Youtube, from: "#f87171", to: "#dc2626" },
  { id: "instagram", label: "Instagram", desc: "Reach, engagement, saves", icon: Instagram, from: "#f472b6", to: "#a855f7" },
  { id: "linkedin", label: "LinkedIn", desc: "Company page & post reach", icon: Linkedin, from: "#38bdf8", to: "#0ea5e9" },
  { id: "tiktok", label: "TikTok", desc: "Video views & follows", icon: Sparkles, from: "#22d3ee", to: "#ec4899" },
];

function AnalyticsPage() {
  const { currentSite } = useSite();
  const [showAdd, setShowAdd] = useState(false);

  const [ga, setGa] = useState<WidgetState>({ connected: false, loading: false, error: null, metrics: null });
  const [gsc, setGsc] = useState<WidgetState>({ connected: false, loading: false, error: null, metrics: null });
  const [gmb, setGmb] = useState<WidgetState>({ connected: false, loading: false, error: null, metrics: null });

  const propertyId = useMemo(() => {
    const match = (currentSite?.gaProperty || "").match(/\((\d+)\)/);
    return match ? match[1] : "";
  }, [currentSite?.gaProperty]);

  useEffect(() => {
    if (!currentSite?.gaConnected || !propertyId) {
      setGa({ connected: false, loading: false, error: null, metrics: null });
      return;
    }
    setGa((s) => ({ ...s, connected: true, loading: true, error: null }));
    fetch(`/api/google/ga4?propertyId=${propertyId}&startDate=28daysAgo&endDate=today`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok) {
          setGa({ connected: true, loading: false, error: data?.error || "Failed to load", metrics: null });
          return;
        }
        const vals = data?.overview?.rows?.[0]?.metricValues as { value: string }[] | undefined;
        if (!vals) {
          setGa({ connected: true, loading: false, error: null, metrics: [] });
          return;
        }
        const sessions = parseInt(vals[1]?.value || "0", 10);
        const conversions = parseInt(vals[5]?.value || "0", 10);
        const rawDur = parseFloat(vals[4]?.value || "0");
        const durationSecs = sessions > 0 && rawDur > 1000 ? Math.round(rawDur / sessions) : Math.round(rawDur);
        setGa({
          connected: true,
          loading: false,
          error: null,
          metrics: [
            { label: "Sessions (28d)", value: sessions.toLocaleString(), icon: Users },
            { label: "Avg engagement", value: `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`, icon: Eye },
            { label: "Conversions", value: conversions.toLocaleString(), icon: MousePointerClick },
          ],
        });
      })
      .catch((err) => setGa({ connected: true, loading: false, error: err.message, metrics: null }));
  }, [currentSite?.gaConnected, propertyId]);

  useEffect(() => {
    if (!currentSite?.gscConnected) {
      setGsc({ connected: false, loading: false, error: null, metrics: null });
      return;
    }
    setGsc((s) => ({ ...s, connected: true, loading: true, error: null }));
    fetch(`/api/google/search-console?siteUrl=${encodeURIComponent(currentSite.gscDomain || "")}&startDate=28daysAgo`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok) {
          setGsc({ connected: true, loading: false, error: data?.error || "Failed to load", metrics: null });
          return;
        }
        const s = data.summary;
        setGsc({
          connected: true,
          loading: false,
          error: null,
          metrics: [
            { label: "Impressions", value: s.impressions.toLocaleString(), icon: Eye },
            { label: "Clicks", value: s.clicks.toLocaleString(), icon: MousePointerClick },
            { label: "Avg position", value: String(s.position), icon: TrendingUp },
          ],
        });
      })
      .catch((err) => setGsc({ connected: true, loading: false, error: err.message, metrics: null }));
  }, [currentSite?.gscConnected, currentSite?.gscDomain]);

  useEffect(() => {
    if (!currentSite?.gbpConnected) {
      setGmb({ connected: false, loading: false, error: null, metrics: null });
      return;
    }
    setGmb((s) => ({ ...s, connected: true, loading: true, error: null }));
    fetch("/api/google/gbp-insights")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok === false && !data.location) {
          setGmb({ connected: true, loading: false, error: data?.error || "Failed to load", metrics: null });
          return;
        }
        const metrics: WidgetMetric[] = [];
        if (data.performance?.ok) {
          const series = data.performance.series || [];
          const sum = (metric: string) => {
            const entry = series.find((s: any) => s.dailyMetricTimeSeries?.dailyMetric === metric);
            const values = entry?.dailyMetricTimeSeries?.timeSeries?.datedValues || [];
            return values.reduce((acc: number, v: any) => acc + (parseInt(v.value || "0", 10) || 0), 0);
          };
          metrics.push({ label: "Calls", value: sum("CALL_CLICKS").toLocaleString(), icon: Phone });
          metrics.push({ label: "Directions", value: sum("BUSINESS_DIRECTION_REQUESTS").toLocaleString(), icon: Navigation });
        }
        if (data.reviews?.ok && data.reviews.totalReviewCount != null) {
          metrics.push({
            label: data.reviews.averageRating ? `Reviews (${data.reviews.averageRating}★)` : "Reviews",
            value: String(data.reviews.totalReviewCount),
            icon: Star,
          });
        }
        setGmb({ connected: true, loading: false, error: null, metrics });
      })
      .catch((err) => setGmb({ connected: true, loading: false, error: err.message, metrics: null }));
  }, [currentSite?.gbpConnected]);

  const widgets = [
    { id: "ga" as const, meta: WIDGET_META.ga, state: ga },
    { id: "gsc" as const, meta: WIDGET_META.gsc, state: gsc },
    { id: "gmb" as const, meta: WIDGET_META.gmb, state: gmb },
  ];

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Unified Insights
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Analytics</h1>
            <p className="mt-1 text-sm text-slate-400">
              Real traffic, search visibility and local performance for {currentSite?.label || "the current site"} —
              aggregated from your connected Google properties.
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
          {widgets.map((w) => (
            <WidgetCard key={w.id} meta={w.meta} state={w.state} />
          ))}
          <AddWidgetCard onClick={() => setShowAdd(true)} />
        </section>

        <div aria-hidden className="h-16" />
      </div>

      {showAdd && <AddWidgetModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function WidgetCard({ meta, state }: { meta: (typeof WIDGET_META)[keyof typeof WIDGET_META]; state: WidgetState }) {
  const Icon = meta.icon;
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_25px_rgba(34,211,238,0.08)]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(to right, ${meta.from}, ${meta.to})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.09] blur-3xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${meta.from}, transparent 70%)` }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-950 shadow"
            style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">{meta.label}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{meta.tagline}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
            state.connected
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border-slate-700 bg-slate-900/60 text-slate-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${state.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
          {state.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {/* Metrics / states */}
      <div className="mt-4 min-h-[70px]">
        {!state.connected ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 text-[11px] text-slate-500">
            Connect this site's {meta.label} in Knowledge Base / Site settings to see real metrics here.
          </div>
        ) : state.loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-[11px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading real data…
          </div>
        ) : state.error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">{state.error}</div>
        ) : !state.metrics || state.metrics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-3 text-[11px] text-slate-500">
            No data for this period yet.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {state.metrics.map((m) => {
              const MIcon = m.icon;
              return (
                <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <MIcon className="h-3 w-3" /> {m.label}
                  </div>
                  <div className="mt-1 text-base font-semibold tabular-nums text-white">{m.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Last 28 days</div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 transition group-hover:text-cyan-200">
          Drill down
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );

  return (
    <Link to={meta.drillTo} className="block h-full">
      {inner}
    </Link>
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
              These integrations are not built yet — no OAuth flow exists for them in this app. Connecting them here
              is not possible until that's implemented.
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
                <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-left opacity-60">
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
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-500">
                    Coming soon
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4 text-[11px] text-slate-500">
          <div className="inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-emerald-300" />
            Google integrations above use real OAuth service-account credentials
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
