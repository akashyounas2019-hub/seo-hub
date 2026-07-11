import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Radio,
  Activity,
  Zap,
  Wifi,
  ChevronRight,
  Sparkles,
  PlayCircle,
  Settings2,
  Download,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import { SCOUTS, getScout, type Scout } from "@/lib/scouts";

export const Route = createFileRoute("/scout-team/$scoutId")({
  head: ({ params }) => {
    const s = getScout(params.scoutId);
    const title = s
      ? `${s.title} · Profile — Scout Team`
      : "Scout — Scout Team";
    const desc = s
      ? `${s.title} workspace: ${s.tabs.map((t) => t.label).join(", ")}.`
      : "Scout profile workspace.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  loader: ({ params }) => {
    const scout = getScout(params.scoutId);
    if (!scout) throw notFound();
    return { scoutId: scout.id };
  },
  notFoundComponent: ScoutNotFound,
  component: ScoutProfilePage,
});


function ScoutNotFound() {
  const { scoutId } = Route.useParams();
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
          Scout not found
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          No scout registered as “{scoutId}”
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Head back to the command floor and pick an active scout.
        </p>
        <Link
          to="/scout-team"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/20"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Scout Team
        </Link>
      </div>
    </div>
  );
}

function ScoutProfilePage() {
  const { scout } = Route.useLoaderData() as { scout: Scout };
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(scout.tabs[0].id);
  const [clock, setClock] = useState("");

  useEffect(() => {
    setActiveTab(scout.tabs[0].id);
  }, [scout.id]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const tab = scout.tabs.find((t) => t.id === activeTab) ?? scout.tabs[0];
  const TabIcon = tab.icon;
  const ScoutIcon = scout.icon;
  const peers = SCOUTS.filter((s) => s.id !== scout.id);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-200">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link to="/scout-team" className="inline-flex items-center gap-1 hover:text-cyan-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Scout Team
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-300">{scout.title}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-cyan-300">{tab.label}</span>
        </nav>

        {/* Hero */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className={`h-1 w-full bg-gradient-to-r ${scout.accent}`} />
          <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            {/* Avatar */}
            <div className="relative">
              <div className={`absolute -inset-3 rounded-3xl bg-gradient-to-r ${scout.accent} opacity-30 blur-2xl`} />
              <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-cyan-300/40 bg-slate-950/90 ring-1 ring-slate-700/70 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
                <div className={`absolute inset-0 bg-gradient-to-br ${scout.accent} opacity-30`} />
                <img
                  src={agentBot}
                  alt=""
                  className="relative block h-[68px] w-[68px] object-contain"
                />
                <span
                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                  style={{ animation: "ledPulse 1.6s ease-in-out infinite" }}
                />
                <span className={`absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br ${scout.accent} ring-1 ring-slate-950`}>
                  <ScoutIcon className="h-3 w-3 text-slate-950" />
                </span>
              </div>
            </div>

            {/* Identity */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "ledPulse 1.6s ease-in-out infinite" }} />
                  {scout.status}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  <ScoutIcon className="h-3 w-3 text-cyan-300" />
                  {scout.role}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  <Radio className="h-3 w-3 text-cyan-300" />
                  {clock} GST
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {scout.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                {scout.mission}
              </p>
              <div className="mt-3 text-xs text-slate-500">
                Currently: <span className="text-slate-300">{scout.activity}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${scout.accent} px-3 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110`}>
                <PlayCircle className="h-4 w-4" /> Run new task
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
                <Download className="h-4 w-4" /> Export
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
                <Settings2 className="h-4 w-4" /> Configure
              </button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-px bg-slate-800 sm:grid-cols-4">
            {[
              { k: "Tabs", v: String(scout.tabs.length), icon: Activity },
              { k: "Signals / hr", v: "48", icon: Radio },
              { k: "Tasks in-flight", v: "6", icon: Zap },
              { k: "Uptime", v: "99.98%", icon: Wifi },
            ].map((s) => (
              <div key={s.k} className="bg-slate-950/70 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {s.k}
                  </div>
                  <s.icon className="h-3.5 w-3.5 text-cyan-300/70" />
                </div>
                <div className="mt-1 text-lg font-semibold text-white">{s.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 backdrop-blur">
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-slate-800 p-2">
            {scout.tabs.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`group inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white ring-1 ring-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                      : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-100"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${scout.accent} ${
                      isActive ? "opacity-100" : "opacity-60 group-hover:opacity-90"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-950" />
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab body */}
          <div key={tab.id} className="grid gap-4 p-5 lg:grid-cols-3" style={{ animation: "fadeInUp .35s ease both" }}>
            {/* Primary panel */}
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                    Workspace
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${scout.accent}`}>
                      <TabIcon className="h-4 w-4 text-slate-950" />
                    </span>
                    <h2 className="text-lg font-semibold text-white">{tab.label}</h2>
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-slate-400">{tab.summary}</p>
                </div>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20">
                  <Sparkles className="h-3.5 w-3.5" /> Ask scout
                </button>
              </div>

              {/* Metrics */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {tab.metrics.map((m) => (
                  <div key={m.label} className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${scout.accent}`} />
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      {m.label}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">{m.value}</div>
                    {m.delta ? (
                      <div className="mt-0.5 text-[10px] font-medium text-emerald-300">
                        {m.delta}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Signal chart (decorative) */}
              <div className="mt-5 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                  <span>Signal · last 24h</span>
                  <span className="font-mono text-slate-400">live</span>
                </div>
                <SignalChart accent={scout.accent} seed={scout.id + tab.id} />
              </div>
            </div>

            {/* Activity feed */}
            <aside className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                    Activity
                  </div>
                  <div className="text-sm font-semibold text-white">
                    Recent from {tab.label}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "ledPulse 1.6s ease-in-out infinite" }} />
                  live
                </span>
              </div>

              <ol className="mt-4 space-y-3">
                {tab.activity.map((a, i) => (
                  <li key={i} className="relative pl-5">
                    <span className={`absolute left-0 top-1.5 h-2 w-2 rounded-full bg-gradient-to-br ${scout.accent}`} />
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      {a.time} ago
                    </div>
                    <div className="text-sm text-slate-200">{a.text}</div>
                  </li>
                ))}
              </ol>

              <button className="mt-4 w-full rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200">
                View full log
              </button>
            </aside>
          </div>
        </div>

        {/* Peer scouts */}
        <div className="mt-8 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Jump to another scout</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {peers.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() =>
                  navigate({ to: "/scout-team/$scoutId", params: { scoutId: p.id } })
                }
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/40"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${p.accent}`} />
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${p.accent}`}>
                    <Icon className="h-3.5 w-3.5 text-slate-950" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      {p.title}
                    </div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                      {p.role}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div aria-hidden className="h-16" />
      </div>

      <style>{`
        @keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function SignalChart({ accent, seed }: { accent: string; seed: string }) {
  // deterministic pseudo-random so the chart matches per tab
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return (h & 0x7fffffff) / 0x7fffffff;
  };
  const W = 600;
  const H = 120;
  const N = 40;
  const pts = Array.from({ length: N }, (_, i) => {
    const x = (i / (N - 1)) * W;
    const base = H * 0.6;
    const y = base - Math.sin(i / 3 + rand() * 0.6) * 22 - rand() * 18;
    return [x, y] as const;
  });
  const path = pts
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;
  const gradId = `sig-${seed}`;
  const strokeId = `sigStroke-${seed}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(34,211,238,1)" />
          <stop offset="100%" stopColor="rgba(139,92,246,1)" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={W}
          y1={H * f}
          y2={H * f}
          stroke="rgba(148,163,184,0.12)"
          strokeDasharray="2 6"
        />
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* end dot */}
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={3.5}
        fill="rgba(34,211,238,1)"
      />
      {/* accent tag for compiler awareness (kept out of DOM) */}
      <title>{accent}</title>
    </svg>
  );
}
