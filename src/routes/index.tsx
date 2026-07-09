import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Link2,
  Settings2,
  Search,
  ShieldCheck,
  Plus,
  Minus,
  Activity,
  X,
  Trash2,
  CalendarClock,
  ListTodo,
  Sparkles,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import leaderBot from "@/assets/leader-bot.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AKS SEO Team — Agent Hierarchy" },
      {
        name: "description",
        content:
          "Hierarchical dashboard of the AKS SEO Team Leader and its specialist sub-agents across On-Page, Off-Page, Technical, Research, and Audit.",
      },
      { property: "og:title", content: "AKS SEO Team — Agent Hierarchy" },
      {
        property: "og:description",
        content:
          "Explore the AKS SEO Team Leader agent and its sub-agent fleet.",
      },
    ],
  }),
  component: Index,
});

type Sub = { name: string; desc: string };
type Expert = {
  id: string;
  title: string;
  tag: string;
  icon: typeof FileText;
  accent: string;
  subs: Sub[];
};

const EXPERTS: Expert[] = [
  {
    id: "onpage",
    title: "On-Page Expert",
    tag: "Content & Structure",
    icon: FileText,
    accent: "from-cyan-400 to-sky-500",
    subs: [
      { name: "Meta Optimizer", desc: "Titles, descriptions, OG tags" },
      { name: "Content Strategist", desc: "Topical maps & briefs" },
      { name: "Internal Linker", desc: "Anchor & silo planning" },
      { name: "Schema Writer", desc: "JSON-LD structured data" },
    ],
  },
  {
    id: "offpage",
    title: "Off-Page Expert",
    tag: "Authority & Signals",
    icon: Link2,
    accent: "from-violet-400 to-fuchsia-500",
    subs: [
      { name: "Backlink Prospector", desc: "Link opportunity discovery" },
      { name: "Outreach Agent", desc: "Personalized pitches" },
      { name: "Digital PR", desc: "Brand mentions & citations" },
      { name: "Disavow Manager", desc: "Toxic link cleanup" },
    ],
  },
  {
    id: "technical",
    title: "Technical SEO Expert",
    tag: "Crawl & Performance",
    icon: Settings2,
    accent: "from-amber-400 to-orange-500",
    subs: [
      { name: "Crawl Analyst", desc: "Robots, sitemaps, indexation" },
      { name: "Core Web Vitals", desc: "LCP, INP, CLS tuning" },
      { name: "Rendering Bot", desc: "JS SEO & hydration checks" },
      { name: "Log File Parser", desc: "Bot behavior insights" },
    ],
  },
  {
    id: "research",
    title: "Researcher",
    tag: "Intelligence & Trends",
    icon: Search,
    accent: "from-emerald-400 to-teal-500",
    subs: [
      { name: "Keyword Miner", desc: "Volume, difficulty, intent" },
      { name: "SERP Analyst", desc: "Competitor SERP dissection" },
      { name: "Trend Watcher", desc: "Emerging query patterns" },
      { name: "Audience Profiler", desc: "Persona & intent mapping" },
    ],
  },
  {
    id: "auditor",
    title: "Auditor",
    tag: "Quality & Compliance",
    icon: ShieldCheck,
    accent: "from-rose-400 to-pink-500",
    subs: [
      { name: "Site Auditor", desc: "Full-site health scan" },
      { name: "Content QA", desc: "E-E-A-T & accuracy checks" },
      { name: "Compliance Bot", desc: "Guidelines & policy review" },
      { name: "Report Generator", desc: "Exec-ready summaries" },
    ],
  },
];

const DEFAULT_SKILLS: Record<string, string> = {
  onpage: "SEO copywriting, on-page optimization, schema markup, keyword targeting, content structuring",
  offpage: "Link building, digital PR, outreach, brand mentions, disavow management",
  technical: "Core Web Vitals, crawl budget, log analysis, JS rendering, indexation",
  research: "Keyword research, SERP analysis, competitor intelligence, trend detection",
  auditor: "Site auditing, E-E-A-T review, compliance, executive reporting",
};

type Task = { id: string; title: string; assignee: string; due: string; status: "pending" | "done" };

type ProfileState = Record<string, { skills: string; tasks: Task[] }>;

const STORAGE_KEY = "aks-agent-profiles-v1";

function loadProfiles(): ProfileState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function Index() {
  const [open, setOpen] = useState<string | null>("onpage");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileState>({});
  const [hydrated, setHydrated] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setProfiles(loadProfiles());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch {}
  }, [profiles, hydrated]);

  useEffect(() => {
    if (!open) return;
    const el = cardRefs.current[open];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const activeExpert = useMemo(
    () => EXPERTS.find((e) => e.id === profileId) ?? null,
    [profileId]
  );

  const getProfile = (id: string) =>
    profiles[id] ?? { skills: DEFAULT_SKILLS[id] ?? "", tasks: [] };

  const updateSkills = (id: string, skills: string) =>
    setProfiles((p) => ({ ...p, [id]: { ...getProfile(id), skills } }));

  const addTask = (id: string, task: Task) =>
    setProfiles((p) => ({
      ...p,
      [id]: { ...getProfile(id), tasks: [task, ...getProfile(id).tasks] },
    }));

  const toggleTask = (id: string, taskId: string) =>
    setProfiles((p) => ({
      ...p,
      [id]: {
        ...getProfile(id),
        tasks: getProfile(id).tasks.map((t) =>
          t.id === taskId ? { ...t, status: t.status === "done" ? "pending" : "done" } : t
        ),
      },
    }));

  const removeTask = (id: string, taskId: string) =>
    setProfiles((p) => ({
      ...p,
      [id]: {
        ...getProfile(id),
        tasks: getProfile(id).tasks.filter((t) => t.id !== taskId),
      },
    }));

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-blue-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-900/60 ring-1 ring-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
              <img src={agentBot} alt="" className="h-full w-full object-contain" loading="lazy" width={512} height={512} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-white">
                AKS Agent Console
              </h1>
              <p className="truncate text-xs text-slate-400">
                Hierarchical SEO Agent Orchestration
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-cyan-200">All agents online</span>
          </div>
        </header>

        {/* Leader */}
        <section className="mt-12 flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-cyan-500/20 blur-2xl" />
            <div className="relative flex items-center gap-4 rounded-2xl border border-cyan-400/30 bg-slate-950/70 px-6 py-5 backdrop-blur">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                <img src={leaderBot} alt="AKS SEO Team Leader bot" className="h-full w-full object-contain" width={512} height={512} />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                  Main Agent
                </div>
                <div className="text-xl font-semibold text-white">
                  AKS SEO Team Leader
                </div>
                <div className="text-xs text-slate-400">
                  Orchestrates 5 experts · 20 sub-agents
                </div>
              </div>
            </div>
          </div>

          {/* wiring: vertical drop + horizontal bus */}
          <div className="relative mt-2 w-full">
            <div className="mx-auto h-10 w-px bg-gradient-to-b from-cyan-300/80 to-cyan-400/40 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            {/* horizontal bus spanning across the 5 columns */}
            <div className="mx-auto hidden lg:block h-px w-[calc(100%-((100%/5)))] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
            {/* mobile bus */}
            <div className="mx-auto lg:hidden h-px w-4/5 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
          </div>
        </section>

        {/* Experts grid */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {EXPERTS.map((e) => {
            const Icon = e.icon;
            const isOpen = open === e.id;
            return (
              <div
                key={e.id}
                ref={(el) => {
                  cardRefs.current[e.id] = el;
                }}
                className="flex scroll-mt-24 flex-col"
              >
                {/* vertical drop from bus into card */}
                <div
                  className={`mx-auto w-px transition-all duration-500 ${
                    isOpen
                      ? "h-8 bg-gradient-to-b from-cyan-300 to-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                      : "h-8 bg-gradient-to-b from-cyan-400/50 to-transparent"
                  }`}
                />

                <button
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  aria-expanded={isOpen}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-300 ease-out ${
                    isOpen
                      ? "-translate-y-0.5 border-cyan-400/60 bg-slate-900/80 shadow-[0_0_40px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/30"
                      : "border-slate-800 bg-slate-900/40 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                  }`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${e.accent} transition-opacity duration-300 ${
                      isOpen ? "opacity-100" : "opacity-60"
                    }`}
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div
                        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-950/60 ring-1 transition-all duration-300 ${
                          isOpen
                            ? "scale-110 ring-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                            : "ring-slate-700/60 group-hover:scale-105 group-hover:ring-cyan-500/40"
                        }`}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${e.accent} opacity-20`} />
                        <img
                          src={agentBot}
                          alt=""
                          className="relative h-full w-full object-contain"
                          loading="lazy"
                          width={512}
                          height={512}
                        />
                      </div>
                      {/* Expand/collapse indicator */}
                      <div
                        className={`relative grid h-6 w-6 place-items-center rounded-full border transition-all duration-300 ${
                          isOpen
                            ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                            : "border-slate-700 bg-slate-900/60 text-slate-400 group-hover:border-cyan-500/40 group-hover:text-cyan-300"
                        }`}
                      >
                        <Plus
                          className={`absolute h-3.5 w-3.5 transition-all duration-300 ${
                            isOpen ? "rotate-90 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"
                          }`}
                        />
                        <Minus
                          className={`absolute h-3.5 w-3.5 transition-all duration-300 ${
                            isOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-90 opacity-0 scale-50"
                          }`}
                        />
                      </div>
                    </div>
                    {/* title row with icon adjacent */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br ${e.accent} shadow`}>
                        <Icon className="h-3.5 w-3.5 text-slate-950" />
                      </span>
                      <div className="text-sm font-semibold text-white leading-tight">
                        {e.title}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
                      {e.tag}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] text-cyan-300/80">
                        <Activity className="h-3 w-3" />
                        {e.subs.length} sub-agents
                      </div>
                      <span
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setProfileId(e.id);
                        }}
                        role="button"
                        className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/20"
                      >
                        Profile
                      </span>
                    </div>
                  </div>
                </button>

                {/* sub-agents */}
                <div
                  className={`grid transition-[grid-template-rows,margin,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isOpen
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "mt-0 grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    {/* sub-agent connector line */}
                    <div className="mx-auto -mt-1 mb-2 h-3 w-px bg-gradient-to-b from-cyan-400/40 to-transparent" />
                    <ul className="space-y-2 pt-1">
                      {e.subs.map((s, i) => (
                        <li
                          key={s.name}
                          className="group/sub relative rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 transition hover:translate-x-0.5 hover:border-cyan-500/40 hover:bg-slate-900/60"
                          style={{
                            animation: isOpen
                              ? `subIn .45s cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`
                              : undefined,
                          }}
                        >
                          {/* connector tick */}
                          <span
                            aria-hidden
                            className={`absolute -left-px top-1/2 h-px w-2 -translate-y-1/2 bg-gradient-to-r ${e.accent} opacity-70`}
                          />
                          <div className="flex items-center gap-2">
                            {/* small agent icon for hierarchy */}
                            <span className={`relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-700/60`}>
                              <span className={`absolute inset-0 bg-gradient-to-br ${e.accent} opacity-25`} />
                              <img src={agentBot} alt="" className="relative h-5 w-5 object-contain" loading="lazy" />
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${e.accent} shadow-[0_0_6px_rgba(34,211,238,0.6)]`}
                            />
                            <div className="text-xs font-medium text-slate-100">
                              {s.name}
                            </div>
                          </div>
                          <div className="mt-1 pl-8 text-[11px] text-slate-500">
                            {s.desc}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* footer stats */}
        <section className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Experts", v: "5" },
            { k: "Sub-agents", v: "20" },
            { k: "Avg. latency", v: "1.2s" },
            { k: "Tasks / day", v: "348" },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                {s.k}
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {s.v}
              </div>
            </div>
          ))}
        </section>
      </div>

      <ProfileDialog
        expert={activeExpert}
        profile={activeExpert ? getProfile(activeExpert.id) : null}
        onOpenChange={(o) => !o && setProfileId(null)}
        onSkillsChange={(s) => activeExpert && updateSkills(activeExpert.id, s)}
        onAddTask={(t) => activeExpert && addTask(activeExpert.id, t)}
        onToggleTask={(tid) => activeExpert && toggleTask(activeExpert.id, tid)}
        onRemoveTask={(tid) => activeExpert && removeTask(activeExpert.id, tid)}
      />

      <style>{`
        @keyframes subIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}

function ProfileDialog({
  expert,
  profile,
  onOpenChange,
  onSkillsChange,
  onAddTask,
  onToggleTask,
  onRemoveTask,
}: {
  expert: Expert | null;
  profile: { skills: string; tasks: Task[] } | null;
  onOpenChange: (open: boolean) => void;
  onSkillsChange: (s: string) => void;
  onAddTask: (t: Task) => void;
  onToggleTask: (id: string) => void;
  onRemoveTask: (id: string) => void;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");

  useEffect(() => {
    if (expert) {
      setTaskTitle("");
      setAssignee(expert.subs[0]?.name ?? "");
      setDue("");
    }
  }, [expert]);

  if (!expert || !profile) return null;
  const Icon = expert.icon;

  const submit = () => {
    if (!taskTitle.trim()) return;
    onAddTask({
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      assignee: assignee || expert.subs[0]?.name || "Unassigned",
      due: due || new Date().toISOString().slice(0, 16),
      status: "pending",
    });
    setTaskTitle("");
    setDue("");
  };

  return (
    <Dialog open={!!expert} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-cyan-400/20 bg-slate-950/95 text-slate-200 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white">
            <span className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-slate-900 ring-1 ring-cyan-400/40`}>
              <span className={`absolute inset-0 bg-gradient-to-br ${expert.accent} opacity-25`} />
              <img src={agentBot} alt="" className="relative h-8 w-8 object-contain" />
            </span>
            <span className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${expert.accent}`}>
                <Icon className="h-3.5 w-3.5 text-slate-950" />
              </span>
              {expert.title}
            </span>
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {expert.tag} · {expert.subs.length} sub-agents under this expert
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Skills */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-cyan-200">
              <Sparkles className="h-4 w-4" /> Skill set
            </Label>
            <Textarea
              value={profile.skills}
              onChange={(e) => onSkillsChange(e.target.value)}
              placeholder="Comma-separated skills this agent should master"
              className="min-h-[140px] resize-none border-slate-800 bg-slate-900/60 text-slate-100"
            />
            <p className="text-[11px] text-slate-500">Auto-saved locally as you type.</p>
          </div>

          {/* Assign + Schedule */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-cyan-200">
              <ListTodo className="h-4 w-4" /> Assign task
            </Label>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title (e.g. Audit homepage schema)"
              className="border-slate-800 bg-slate-900/60"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
              >
                {expert.subs.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <Input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="border-slate-800 bg-slate-900/60 pl-7"
                />
              </div>
            </div>
            <Button
              onClick={submit}
              className="w-full bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 hover:opacity-90"
            >
              <Plus className="mr-1 h-4 w-4" /> Schedule task
            </Button>
          </div>
        </div>

        {/* Task list */}
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-cyan-200">Scheduled tasks</Label>
            <span className="text-[11px] text-slate-500">
              {profile.tasks.filter((t) => t.status === "pending").length} pending
            </span>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {profile.tasks.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center text-xs text-slate-500">
                No tasks scheduled yet.
              </div>
            )}
            {profile.tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"
              >
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => onToggleTask(t.id)}
                  className="h-4 w-4 accent-cyan-400"
                />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${t.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-300">{t.assignee}</span>
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {t.due.replace("T", " ")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveTask(t.id)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                  aria-label="Remove task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
