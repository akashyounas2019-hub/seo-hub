import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users,
  Search as SearchIcon,
  UserPlus,
  ClipboardList,
  Send,
  Filter,
  MapPin as MapPinIcon,
  Clock,
  Activity as ActivityIcon,
  Sparkles,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import { TEAM, teamStats, type TeamMember } from "@/lib/team";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team · SEO Fleet — AKS Console" },
      {
        name: "description",
        content:
          "Full SEO team roster — research, content, design, technical, and local specialists.",
      },
      { property: "og:title", content: "Team · SEO Fleet — AKS Console" },
      {
        property: "og:description",
        content: "Live status of every agent on the SEO team.",
      },
    ],
  }),
  component: TeamPage,
});

const statusStyle: Record<TeamMember["status"], string> = {
  Working: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  Online: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  Reviewing: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  Offline: "border-slate-700 bg-slate-900/60 text-slate-400",
};

function TeamPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | TeamMember["status"]>("all");
  const stats = teamStats();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TEAM.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (!s) return true;
      return (
        m.name.toLowerCase().includes(s) ||
        m.role.toLowerCase().includes(s) ||
        m.bio.toLowerCase().includes(s)
      );
    });
  }, [q, filter]);

  const summary = [
    { k: "Total", v: String(stats.total), tone: "text-white" },
    { k: "Working", v: String(stats.working), tone: "text-emerald-300" },
    { k: "Reviewing", v: String(stats.reviewing), tone: "text-amber-300" },
    { k: "Offline", v: String(stats.offline), tone: "text-slate-300" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-200">
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
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 ring-1 ring-cyan-400/30">
              <Users className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
                Roster
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                SEO Team · {TEAM.length} agents
              </h1>
              <p className="text-xs text-slate-400">
                Specialists across research, content, design, technical & local.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20">
              <UserPlus className="h-4 w-4" /> Add Agent
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
              <ClipboardList className="h-4 w-4" /> Assign Task
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110">
              <Send className="h-4 w-4" /> Dispatch Run
            </button>
          </div>
        </header>

        {/* Summary */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((s) => (
            <div
              key={s.k}
              className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/60 via-sky-500/40 to-transparent" />
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">
                  {s.k}
                </div>
                <ActivityIcon className="h-3.5 w-3.5 text-cyan-300/70" />
              </div>
              <div className={`mt-1 text-2xl font-semibold ${s.tone}`}>
                {s.v}
              </div>
            </div>
          ))}
        </section>

        {/* Filter bar */}
        <section className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2">
          <div className="relative flex flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3">
            <SearchIcon className="h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, role or focus…"
              className="w-full bg-transparent py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1 text-[11px]">
            <Filter className="mx-1 h-3.5 w-3.5 text-slate-500" />
            {(["all", "Working", "Online", "Reviewing", "Offline"] as const).map(
              (f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-2.5 py-1 transition ${
                      active
                        ? "bg-cyan-400 text-slate-950 font-semibold"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {f === "all" ? "All" : f}
                  </button>
                );
              },
            )}
          </div>
        </section>

        {/* Grid */}
        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => {
            const Icon = m.icon;
            return (
              <article
                key={m.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-400/40"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.accent}`}
                />
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      <div
                        className={`absolute -inset-2 rounded-2xl bg-gradient-to-br ${m.accent} opacity-25 blur-xl`}
                      />
                      <div className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-cyan-300/30 bg-slate-950/90 ring-1 ring-slate-700/70">
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${m.accent} opacity-25`}
                        />
                        <img
                          src={agentBot}
                          alt=""
                          className="relative h-11 w-11 object-contain"
                        />
                        <span
                          className={`absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br ${m.accent} ring-1 ring-slate-950`}
                        >
                          <Icon className="h-2.5 w-2.5 text-slate-950" />
                        </span>
                      </div>
                    </div>

                    {/* Identity */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyle[m.status]}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {m.status}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300">
                          <MapPinIcon className="h-3 w-3 text-cyan-300" />
                          {m.location}
                        </span>
                      </div>
                      <h3 className="mt-1.5 truncate text-base font-semibold text-white">
                        {m.name}
                      </h3>
                      <div className="text-[11px] uppercase tracking-wider text-cyan-300/70">
                        {m.role}
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">{m.bio}</p>

                  {/* Focus chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.focus.map((f) => (
                      <span
                        key={f}
                        className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {/* Metrics */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {m.metrics.map((k) => (
                      <div
                        key={k.label}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2"
                      >
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">
                          {k.label}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-white">
                          {k.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3" /> Updated 2m ago
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
                        View
                      </button>
                      <button
                        className={`inline-flex items-center gap-1 rounded-md bg-gradient-to-r ${m.accent} px-2 py-1 text-[11px] font-semibold text-slate-950 hover:brightness-110`}
                      >
                        <Sparkles className="h-3 w-3" /> Assign
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {filtered.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-800 p-10 text-center text-sm text-slate-400">
            No agents match this filter.
          </div>
        )}

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}
