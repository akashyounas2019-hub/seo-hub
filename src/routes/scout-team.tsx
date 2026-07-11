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
  Crown,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import leaderBot from "@/assets/leader-bot.png";

export const Route = createFileRoute("/scout-team")({
  head: () => ({
    meta: [
      { title: "Scout Team — AKS SEO Console" },
      {
        name: "description",
        content:
          "Scout Leader orchestrating seven specialist scouts around a live-office command floor.",
      },
      { property: "og:title", content: "Scout Team — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Central Scout Leader connected to Keyword, Content, Designing, Local, Competitor, Audit and Technical scouts.",
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
  activity: string;
  status: string;
  /** angle in degrees, 0 = top, clockwise */
  angle: number;
};

const SCOUTS: Scout[] = [
  {
    id: "keyword",
    title: "Keyword Scout",
    role: "Query Intelligence",
    icon: Search,
    accent: "from-cyan-400 to-sky-500",
    activity: "Mining 428 long-tail queries",
    status: "Engaged",
    angle: 0,
  },
  {
    id: "content",
    title: "Content Scout",
    role: "Editorial Radar",
    icon: FileText,
    accent: "from-violet-400 to-fuchsia-500",
    activity: "Drafting brief · move-in checklist",
    status: "Writing",
    angle: 51.4,
  },
  {
    id: "design",
    title: "Designing Scout",
    role: "Visual Systems",
    icon: Palette,
    accent: "from-pink-400 to-rose-500",
    activity: "Prototyping hero layout",
    status: "Sketching",
    angle: 102.8,
  },
  {
    id: "local",
    title: "Local Business Scout",
    role: "GBP & Citations",
    icon: MapPin,
    accent: "from-emerald-400 to-teal-500",
    activity: "Sweeping 42 UAE directories",
    status: "Scanning",
    angle: 154.3,
  },
  {
    id: "competitor",
    title: "Competitor Scout",
    role: "SERP Surveillance",
    icon: Target,
    accent: "from-amber-400 to-orange-500",
    activity: "Diffing 6 rival sitemaps",
    status: "Tracking",
    angle: 205.7,
  },
  {
    id: "audit",
    title: "Audit & Reporting Scout",
    role: "Insights Desk",
    icon: ClipboardCheck,
    accent: "from-indigo-400 to-blue-500",
    activity: "Compiling weekly exec report",
    status: "Reporting",
    angle: 257.1,
  },
  {
    id: "technical",
    title: "Technical Scout",
    role: "Crawl & Performance",
    icon: Wrench,
    accent: "from-rose-400 to-red-500",
    activity: "Running Lighthouse on 32 pages",
    status: "Auditing",
    angle: 308.6,
  },
];

function ScoutTeamPage() {
  const [clock, setClock] = useState("");
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

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
      {/* ambient office glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
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
        {/* Command header */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 ring-1 ring-cyan-400/30">
              <Radio className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Scout Team · Command Floor
              </h1>
              <p className="text-xs text-slate-400">
                1 leader orchestrating 7 scouts · Dubai HQ
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              All desks online
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-slate-300">
              <Wifi className="h-3.5 w-3.5 text-cyan-300" /> Mesh 1.2 Gb/s
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 font-mono text-slate-300">
              <Coffee className="h-3.5 w-3.5 text-amber-300" /> {clock} GST
            </span>
          </div>
        </header>

        {/* Floor stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Scouts", v: "7", icon: Activity },
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

        {/* Constellation */}
        <div className="mt-8 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Scout Leader · Team Mesh</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <Constellation />

        {/* Roster */}
        <div className="mt-10 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Roster · Live Status</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCOUTS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                style={{
                  animation: `deskIn .5s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms both`,
                }}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-3 transition hover:-translate-y-0.5 hover:border-cyan-500/40"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${s.accent}`} />
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${s.accent} shadow`}>
                    <Icon className="h-4 w-4 text-slate-950" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {s.title}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">
                      {s.activity}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "ledPulse 1.6s ease-in-out infinite" }} />
                    {s.status}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {s.role}
                  </span>
                </div>
              </div>
            );
          })}
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
        @keyframes orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -60; }
        }
        @keyframes pulseRing {
          0% { transform: scale(0.8); opacity: .55; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes packet {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function Constellation() {
  // Viewbox coordinate system
  const W = 1000;
  const H = 640;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 320; // horizontal orbit radius (inset so avatars + labels stay inside)
  const ry = 210; // vertical orbit radius

  const nodes = SCOUTS.map((s) => {
    const rad = ((s.angle - 90) * Math.PI) / 180; // 0deg = top
    return {
      ...s,
      x: cx + rx * Math.cos(rad),
      y: cy + ry * Math.sin(rad),
    };
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-950/40 backdrop-blur">
      {/* floor texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.12), transparent 60%), linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 42px 42px, 42px 42px",
        }}
      />

      <div className="relative aspect-[1000/640] w-full">
        {/* SVG links + rings */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
              <stop offset="70%" stopColor="rgba(34,211,238,0)" />
            </radialGradient>
            <linearGradient id="linkGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(34,211,238,0.9)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0.6)" />
            </linearGradient>
          </defs>

          {/* central floor glow */}
          <circle cx={cx} cy={cy} r={220} fill="url(#floorGlow)" />

          {/* orbit rings */}
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeDasharray="4 6"
          />
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx * 0.62}
            ry={ry * 0.62}
            fill="none"
            stroke="rgba(148,163,184,0.12)"
            strokeDasharray="2 8"
          />

          {/* connection lines leader ↔ scouts */}
          {nodes.map((n) => (
            <g key={n.id}>
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke="rgba(34,211,238,0.28)"
                strokeWidth={1.2}
              />
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke="url(#linkGrad)"
                strokeWidth={1.6}
                strokeDasharray="6 10"
                style={{ animation: "dashFlow 3.2s linear infinite" }}
              />
            </g>
          ))}

          {/* node halos */}
          {nodes.map((n) => (
            <circle
              key={`halo-${n.id}`}
              cx={n.x}
              cy={n.y}
              r={44}
              fill="rgba(34,211,238,0.05)"
              stroke="rgba(34,211,238,0.25)"
              strokeWidth={1}
            />
          ))}
        </svg>

        {/* Animated packets travelling on each link */}
        {nodes.map((n) => {
          const angle = Math.atan2(n.y - cy, n.x - cx);
          const dx = n.x - cx;
          const dy = n.y - cy;
          return (
            <span
              key={`pkt-${n.id}`}
              className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]"
              style={{
                left: `${(cx / W) * 100}%`,
                top: `${(cy / H) * 100}%`,
                transform: `translate(-50%, -50%)`,
                offsetPath: `path('M 0 0 L ${dx} ${dy}')`,
                animation: `packet ${3 + (Math.abs(angle) % 1.5)}s linear infinite`,
                animationDelay: `${(SCOUTS.indexOf(n) * 0.35).toFixed(2)}s`,
              }}
            />
          );
        })}

        {/* Leader in the center */}
        <div
          className="absolute"
          style={{
            left: `${(cx / W) * 100}%`,
            top: `${(cy / H) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* pulse rings */}
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/40" style={{ animation: "pulseRing 2.6s ease-out infinite" }} />
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/40" style={{ animation: "pulseRing 2.6s ease-out infinite", animationDelay: "1.1s" }} />

          <div className="relative flex flex-col items-center">
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-cyan-500/30 via-violet-500/30 to-cyan-500/30 blur-2xl" />
              <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-2xl border border-cyan-400/50 bg-slate-950/80 shadow-[0_0_50px_rgba(34,211,238,0.45)] ring-1 ring-cyan-400/40">
                <img
                  src={leaderBot}
                  alt="Scout Leader"
                  className="h-full w-full object-contain"
                  width={512}
                  height={512}
                />
                <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-slate-950 bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.7)]">
                  <Crown className="h-3.5 w-3.5 text-slate-950" />
                </span>
              </div>
            </div>
            <div className="mt-3 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-1 text-center backdrop-blur">
              <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                Main Agent
              </div>
              <div className="text-sm font-semibold text-white">
                Scout Leader
              </div>
            </div>
          </div>
        </div>

        {/* Scout nodes — avatar is dead-centered on the node point; label floats beside it */}
        {nodes.map((n, i) => {
          const Icon = n.icon;
          const leftSide = n.x < cx;
          return (
            <div
              key={n.id}
              className="pointer-events-none absolute"
              style={{
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
                transform: "translate(-50%, -50%)",
                animation: `deskIn .5s cubic-bezier(0.22,1,0.36,1) ${150 + i * 90}ms both`,
              }}
            >
              {/* Avatar — perfectly centered on the point */}
              <div className="relative h-16 w-16">
                <span
                  className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/25"
                  style={{ animation: "pulseRing 3.2s ease-out infinite", animationDelay: `${i * 0.25}s` }}
                />
                <div className="relative h-16 w-16 overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-slate-700/70 shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                  <div className={`absolute inset-0 bg-gradient-to-br ${n.accent} opacity-30`} />
                  <img
                    src={agentBot}
                    alt=""
                    className="relative h-full w-full object-contain"
                    loading="lazy"
                    width={512}
                    height={512}
                  />
                </div>
                {/* status LED */}
                <span
                  className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                  style={{ animation: "ledPulse 1.6s ease-in-out infinite" }}
                />
                {/* role icon badge */}
                <span className={`absolute -bottom-1 ${leftSide ? "-left-1" : "-right-1"} grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br ${n.accent} ring-2 ring-slate-950`}>
                  <Icon className="h-3 w-3 text-slate-950" />
                </span>
              </div>

              {/* Label — absolutely positioned beside the avatar, does not shift it */}
              <div
                className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 sm:block ${
                  leftSide ? "right-full mr-3 text-right" : "left-full ml-3 text-left"
                }`}
              >
                <div className="rounded-lg border border-slate-800 bg-slate-950/85 px-2.5 py-1.5 backdrop-blur">
                  <div className="whitespace-nowrap text-[11px] font-semibold leading-tight text-white">
                    {n.title}
                  </div>
                  <div className="whitespace-nowrap text-[9px] uppercase tracking-wider text-cyan-300/70">
                    {n.role}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
