import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Search,
  FileText,
  Palette,
  MapPin,
  Target,
  ClipboardCheck,
  Wrench,
  Radio,
  Coffee,
  Wifi,
  Activity,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";

export const Route = createFileRoute("/scout-team")({
  head: () => ({
    meta: [
      { title: "Scout Team — AKS SEO Console" },
      {
        name: "description",
        content:
          "Live view of the Scout Team office: Keyword, Content, Designing, Local Business, Competitor, Audit & Reporting, and Technical scouts working in real time.",
      },
      { property: "og:title", content: "Scout Team — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Dynamic office environment showing every Scout agent actively engaged.",
      },
    ],
  }),
  component: ScoutTeamPage,
});

type Scout = {
  id: string;
  title: string;
  role: string;
  icon: typeof Search;
  accent: string;
  desk: string; // desk color chip
  activities: string[];
  metrics: { label: string; value: string }[];
};

const SCOUTS: Scout[] = [
  {
    id: "keyword",
    title: "Keyword Scout",
    role: "Query Intelligence",
    icon: Search,
    accent: "from-cyan-400 to-sky-500",
    desk: "bg-cyan-500/10",
    activities: [
      "Mining long-tail queries around 'villa deep cleaning dubai'",
      "Clustering 428 keywords by intent",
      "Scoring difficulty vs opportunity",
      "Pushing 12 wins to Content Scout",
    ],
    metrics: [
      { label: "Keywords tracked", value: "4,812" },
      { label: "New gaps", value: "37" },
    ],
  },
  {
    id: "content",
    title: "Content Scout",
    role: "Editorial Radar",
    icon: FileText,
    accent: "from-violet-400 to-fuchsia-500",
    desk: "bg-violet-500/10",
    activities: [
      "Drafting brief for 'move-in cleaning checklist'",
      "Auditing 18 pages for topical depth",
      "Flagging 3 pages of thin content",
      "Syncing outline with Designing Scout",
    ],
    metrics: [
      { label: "Briefs in-flight", value: "9" },
      { label: "Refresh queue", value: "22" },
    ],
  },
  {
    id: "design",
    title: "Designing Scout",
    role: "Visual Systems",
    icon: Palette,
    accent: "from-pink-400 to-rose-500",
    desk: "bg-pink-500/10",
    activities: [
      "Prototyping hero for 'office cleaning Dubai' landing",
      "Optimising 14 images for LCP",
      "Building schema-ready FAQ block",
      "Handing wireframe to Technical Scout",
    ],
    metrics: [
      { label: "Layouts shipped", value: "6" },
      { label: "Assets optimised", value: "148" },
    ],
  },
  {
    id: "local",
    title: "Local Business Scout",
    role: "GBP & Citations",
    icon: MapPin,
    accent: "from-emerald-400 to-teal-500",
    desk: "bg-emerald-500/10",
    activities: [
      "Sweeping 42 UAE directories for NAP drift",
      "Refreshing GBP posts across 3 branches",
      "Responding to 5 fresh reviews",
      "Watching grid rank in Business Bay",
    ],
    metrics: [
      { label: "Citations clean", value: "96%" },
      { label: "Avg. review score", value: "4.8" },
    ],
  },
  {
    id: "competitor",
    title: "Competitor Scout",
    role: "SERP Surveillance",
    icon: Target,
    accent: "from-amber-400 to-orange-500",
    desk: "bg-amber-500/10",
    activities: [
      "Diffing 6 competitor sitemaps",
      "Alerting: rival gained 12 new backlinks",
      "Snapshotting SERP for 'deep cleaning services'",
      "Feeding gaps to Keyword Scout",
    ],
    metrics: [
      { label: "Rivals watched", value: "8" },
      { label: "Movements today", value: "23" },
    ],
  },
  {
    id: "audit",
    title: "Audit & Reporting Scout",
    role: "Insights Desk",
    icon: ClipboardCheck,
    accent: "from-indigo-400 to-blue-500",
    desk: "bg-indigo-500/10",
    activities: [
      "Compiling weekly exec report",
      "Cross-checking GA4 vs Search Console",
      "Auto-tagging 14 anomalies",
      "Scheduling client PDF for 09:00 GST",
    ],
    metrics: [
      { label: "Reports queued", value: "4" },
      { label: "Anomalies flagged", value: "14" },
    ],
  },
  {
    id: "technical",
    title: "Technical Scout",
    role: "Crawl & Performance",
    icon: Wrench,
    accent: "from-rose-400 to-red-500",
    desk: "bg-rose-500/10",
    activities: [
      "Running Lighthouse on 32 templates",
      "Patching 7 broken canonical tags",
      "Compressing JS bundle by 84 KB",
      "Re-submitting sitemap to GSC",
    ],
    metrics: [
      { label: "CWV pass rate", value: "92%" },
      { label: "Errors open", value: "3" },
    ],
  },
];

function useTicker(len: number, intervalMs = 2600) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % len), intervalMs);
    return () => clearInterval(t);
  }, [len, intervalMs]);
  return i;
}

function ScoutTeamPage() {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
      {/* ambient office glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/4 h-[500px] w-[900px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        {/* Header — office reception */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 ring-1 ring-cyan-400/30">
              <Radio className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Scout Team · Live Office
              </h1>
              <p className="text-xs text-slate-400">
                7 scouts on the floor · Dubai HQ
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              All desks active
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-300">
              <Wifi className="h-3.5 w-3.5 text-cyan-300" /> Uplink 1.2 Gb/s
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 font-mono text-slate-300">
              <Coffee className="h-3.5 w-3.5 text-amber-300" /> {clock} GST
            </span>
          </div>
        </header>

        {/* Floor stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Scouts on floor", v: "7", icon: Activity },
            { k: "Tasks in-flight", v: "48", icon: Zap },
            { k: "Signals / hr", v: "312", icon: Radio },
            { k: "Uptime", v: "99.98%", icon: Wifi },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">
                  {s.k}
                </div>
                <s.icon className="h-3.5 w-3.5 text-cyan-300/70" />
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{s.v}</div>
            </div>
          ))}
        </section>

        {/* Office floor label */}
        <div className="mt-8 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Floor Plan · Scout Desks</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Desks grid */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SCOUTS.map((s, idx) => (
            <DeskCard key={s.id} scout={s} idx={idx} />
          ))}
        </section>

        <div aria-hidden className="h-16" />
      </div>

      <style>{`
        @keyframes deskIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes ledPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .35; }
        }
        @keyframes typing {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function DeskCard({ scout, idx }: { scout: Scout; idx: number }) {
  const Icon = scout.icon;
  const tick = useTicker(scout.activities.length, 2600 + (idx % 3) * 400);
  const activity = scout.activities[tick];

  return (
    <article
      style={{
        animation: `deskIn .5s cubic-bezier(0.22,1,0.36,1) ${idx * 70}ms both`,
      }}
      className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]"
    >
      {/* desk accent stripe */}
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${scout.accent}`} />

      {/* desk surface texture */}
      <div className={`absolute inset-x-0 top-0 h-24 ${scout.desk}`} />

      <div className="relative p-4">
        {/* Agent + status LED */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-950/70 ring-1 ring-slate-700/60`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${scout.accent} opacity-25`} />
                <img
                  src={agentBot}
                  alt=""
                  className="relative h-full w-full object-contain"
                  loading="lazy"
                  width={512}
                  height={512}
                />
              </div>
              {/* headset LED */}
              <span
                className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                style={{ animation: "ledPulse 1.6s ease-in-out infinite" }}
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-white leading-tight">
                {scout.title}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                {scout.role}
              </div>
            </div>
          </div>
          <span
            className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${scout.accent} shadow`}
            aria-hidden
          >
            <Icon className="h-4 w-4 text-slate-950" />
          </span>
        </div>

        {/* monitor / live activity */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
            Live
          </div>
          <p
            key={tick}
            className="mt-1.5 min-h-[2.5rem] text-xs text-slate-300"
            style={{ animation: "typing .35s ease-out both" }}
          >
            {activity}
            <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-cyan-300/80 align-middle" style={{ animation: "ledPulse 1s steps(2,end) infinite" }} />
          </p>
        </div>

        {/* metrics chips */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {scout.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {m.label}
              </div>
              <div className="text-sm font-semibold text-white">{m.value}</div>
            </div>
          ))}
        </div>

        {/* desk footer */}
        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
            <Activity className="h-3 w-3" /> Engaged
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/20"
          >
            Visit desk <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}
