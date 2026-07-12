import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  Sparkles,
  Search,
  Filter,
  ChevronDown,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  CalendarClock,
  Bookmark,
  BookmarkPlus,
  GripVertical,
  Trash2,
  X,
  Flag,
  Timer,
  Layers,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { EXPERTS } from "@/lib/agents";
import agentBot from "@/assets/agent-bot.png";

export const Route = createFileRoute("/assign-tasks")({
  head: () => ({
    meta: [
      { title: "Assign Tasks — AKS SEO Console" },
      {
        name: "description",
        content:
          "Delegate SEO work across your agent fleet with templates, workload balancing, and a drag-and-drop Kanban board.",
      },
      { property: "og:title", content: "Assign Tasks — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Task allocation, workload management, and a professional Kanban workflow for the AKS agent fleet.",
      },
    ],
  }),
  component: AssignTasksPage,
});

// ------------ Types ------------

type Priority = "low" | "medium" | "high" | "critical";
type Status = "todo" | "inprogress" | "review" | "done";

type Task = {
  id: string;
  title: string;
  desc?: string;
  assignee: string; // agent title
  priority: Priority;
  status: Status;
  due?: string; // ISO date
  templateId?: string;
  createdAt: string;
};

type Template = {
  id: string;
  name: string;
  title: string;
  desc: string;
  defaultAssignee?: string;
  priority: Priority;
  builtIn?: boolean;
};

// ------------ Constants ------------

const STORAGE_KEY = "aks-assign-tasks-v1";

const SEED_TEMPLATES: Template[] = [
  {
    id: "tpl-audit",
    name: "Full-site technical audit",
    title: "Run full-site technical audit",
    desc: "Crawl the site, flag crawl blockers, canonicals, redirects, and CWV regressions. Export exec-ready report.",
    defaultAssignee: "Technical SEO Expert",
    priority: "high",
    builtIn: true,
  },
  {
    id: "tpl-brief",
    name: "Content brief for target keyword",
    title: "Draft content brief for {{keyword}}",
    desc: "Search intent, SERP outline, entities, internal-link targets, and word-count guidance.",
    defaultAssignee: "On-Page Expert",
    priority: "medium",
    builtIn: true,
  },
  {
    id: "tpl-outreach",
    name: "Link outreach campaign",
    title: "Launch outreach batch (25 prospects)",
    desc: "Enrich prospects, generate personalized pitches, queue for approval before send.",
    defaultAssignee: "Off-Page Expert",
    priority: "medium",
    builtIn: true,
  },
  {
    id: "tpl-refresh",
    name: "Refresh declining post",
    title: "Refresh declining post: {{url}}",
    desc: "Update stats, expand FAQ, add 2026 examples, re-run internal links.",
    defaultAssignee: "On-Page Expert",
    priority: "low",
    builtIn: true,
  },
  {
    id: "tpl-review",
    name: "Quarterly QA review",
    title: "QA review — top 20 landing pages",
    desc: "E-E-A-T, accuracy, compliance and schema checks. File issues into the fix queue.",
    defaultAssignee: "Auditor",
    priority: "high",
    builtIn: true,
  },
];

const SEED_TASKS: Task[] = [
  {
    id: "seed-1",
    title: "Fix 14 canonical mismatches",
    desc: "Self-referencing canonicals point to trailing-slash variants.",
    assignee: "Technical SEO Expert",
    priority: "high",
    status: "inprogress",
    due: isoDaysFromNow(1),
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-2",
    title: "Add FAQ schema to 12 top service pages",
    assignee: "On-Page Expert",
    priority: "medium",
    status: "todo",
    due: isoDaysFromNow(3),
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-3",
    title: "Pitch 5 UAE real-estate blogs",
    desc: "Personalized outreach for guest posts on move-in cleaning.",
    assignee: "Off-Page Expert",
    priority: "medium",
    status: "review",
    due: isoDaysFromNow(2),
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-4",
    title: "Ship XML sitemap v3 to GSC",
    assignee: "Technical SEO Expert",
    priority: "low",
    status: "done",
    due: isoDaysFromNow(-1),
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-5",
    title: "Reclaim 8 unlinked brand mentions",
    assignee: "Off-Page Expert",
    priority: "high",
    status: "todo",
    due: isoDaysFromNow(4),
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-6",
    title: "Improve LCP on /pricing (3.1s → <2.0s)",
    assignee: "Technical SEO Expert",
    priority: "critical",
    status: "inprogress",
    due: isoDaysFromNow(0),
    createdAt: new Date().toISOString(),
  },
];

const COLUMNS: { id: Status; title: string; hint: string; accent: string; dot: string }[] = [
  { id: "todo", title: "To Do", hint: "Queued & ready", accent: "from-slate-500 to-slate-700", dot: "bg-slate-400" },
  { id: "inprogress", title: "In Progress", hint: "Being executed", accent: "from-cyan-400 to-blue-500", dot: "bg-cyan-400" },
  { id: "review", title: "Review", hint: "Awaiting approval", accent: "from-amber-400 to-orange-500", dot: "bg-amber-400" },
  { id: "done", title: "Done", hint: "Shipped", accent: "from-emerald-400 to-teal-500", dot: "bg-emerald-400" },
];

const PRIORITY_META: Record<Priority, { label: string; cls: string; ring: string; icon: LucideIcon }> = {
  low: { label: "Low", cls: "bg-slate-500/10 text-slate-300 border-slate-500/25", ring: "ring-slate-600/40", icon: Flag },
  medium: { label: "Medium", cls: "bg-sky-400/10 text-sky-200 border-sky-400/25", ring: "ring-sky-500/40", icon: Flag },
  high: { label: "High", cls: "bg-amber-400/10 text-amber-200 border-amber-400/25", ring: "ring-amber-500/40", icon: Flag },
  critical: { label: "Critical", cls: "bg-rose-500/10 text-rose-200 border-rose-500/25", ring: "ring-rose-500/50", icon: AlertTriangle },
};

// ------------ Helpers ------------

function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

function loadState(): { tasks: Task[]; templates: Template[] } {
  if (typeof window === "undefined") return { tasks: SEED_TASKS, templates: SEED_TEMPLATES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tasks: SEED_TASKS, templates: SEED_TEMPLATES };
    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : SEED_TASKS,
      templates: Array.isArray(parsed.templates) ? parsed.templates : SEED_TEMPLATES,
    };
  } catch {
    return { tasks: SEED_TASKS, templates: SEED_TEMPLATES };
  }
}

function saveState(state: { tasks: Task[]; templates: Template[] }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function relativeDue(iso?: string) {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffH = Math.round((then - now) / 36e5);
  if (diffH < 0) return `${Math.abs(diffH)}h overdue`;
  if (diffH < 24) return `${diffH}h`;
  return `${Math.round(diffH / 24)}d`;
}

// ------------ Page ------------

function AssignTasksPage() {
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [prioFilter, setPrioFilter] = useState<"all" | Priority>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [prefill, setPrefill] = useState<Partial<Task> | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);

  const agents = useMemo(() => EXPERTS.map((e) => e.title), []);

  useEffect(() => {
    const s = loadState();
    setTasks(s.tasks);
    setTemplates(s.templates);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState({ tasks, templates });
  }, [tasks, templates, hydrated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (prioFilter !== "all" && t.priority !== prioFilter) return false;
      if (assigneeFilter !== "all" && t.assignee !== assigneeFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.desc?.toLowerCase().includes(q) ?? false) ||
        t.assignee.toLowerCase().includes(q)
      );
    });
  }, [tasks, query, prioFilter, assigneeFilter]);

  const kpis = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done").length;
    const inFlight = tasks.filter((t) => t.status === "inprogress").length;
    const critical = tasks.filter((t) => t.priority === "critical" && t.status !== "done").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const total = tasks.length || 1;
    return {
      open,
      inFlight,
      critical,
      done,
      openPct: Math.round((open / total) * 100),
      inFlightPct: Math.round((inFlight / total) * 100),
      criticalPct: Math.round((critical / total) * 100),
      donePct: Math.round((done / total) * 100),
      total,
    };
  }, [tasks]);

  const workload = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "done");
    const per = agents.map((name) => {
      const items = active.filter((t) => t.assignee === name);
      return {
        name,
        total: items.length,
        critical: items.filter((t) => t.priority === "critical").length,
        high: items.filter((t) => t.priority === "high").length,
      };
    });
    const max = Math.max(1, ...per.map((p) => p.total));
    return per.map((p) => ({ ...p, pct: Math.round((p.total / max) * 100) }));
  }, [tasks, agents]);

  const addTask = (t: Omit<Task, "id" | "createdAt">) => {
    setTasks((prev) => [
      { ...t, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const saveTemplate = (tpl: Omit<Template, "id"> & { id?: string }) => {
    setTemplates((prev) => {
      if (tpl.id) return prev.map((p) => (p.id === tpl.id ? { ...p, ...tpl } as Template : p));
      return [{ ...tpl, id: `tpl-${Date.now()}` } as Template, ...prev];
    });
  };

  const deleteTemplate = (id: string) => setTemplates((prev) => prev.filter((t) => t.id !== id));

  const useTemplate = (tpl: Template) => {
    setPrefill({
      title: tpl.title,
      desc: tpl.desc,
      assignee: tpl.defaultAssignee ?? agents[0],
      priority: tpl.priority,
      templateId: tpl.id,
    });
    setShowCreate(true);
  };

  // ---------- Drag & drop ----------
  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => {
    setDragId(null);
    setDragOver(null);
  };
  const onDropTo = (status: Status) => {
    if (dragId) updateTask(dragId, { status });
    onDragEnd();
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/[0.07] blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              ← Command Center
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-white">
              <ClipboardList className="h-6 w-6 text-cyan-300" />
              Assign <span className="text-cyan-300">Tasks</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Route work across your SEO squad — templated allocation, live workload balancing, and a drag-and-drop Kanban of the entire fleet's execution.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplateEditor(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-[12px] font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Manage Templates
            </button>
            <button
              onClick={() => {
                setPrefill(null);
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> New Task
            </button>
          </div>
        </header>

        {/* KPI cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Open Tasks" value={kpis.open} sub={`of ${kpis.total} total`} pct={kpis.openPct} accent="from-cyan-400 to-sky-500" icon={ListTodo} />
          <KpiCard label="In Flight" value={kpis.inFlight} sub={`${kpis.inFlightPct}% of pipeline`} pct={kpis.inFlightPct} accent="from-violet-400 to-indigo-500" icon={Zap} pulse />
          <KpiCard label="Critical" value={kpis.critical} sub="need attention" pct={kpis.criticalPct} accent="from-rose-500 to-red-500" icon={AlertTriangle} />
          <KpiCard label="Completed" value={kpis.done} sub={`${kpis.donePct}% shipped`} pct={kpis.donePct} accent="from-emerald-400 to-teal-500" icon={CheckCircle2} />
        </section>

        {/* Task allocation module */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-cyan-400 to-blue-500" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Task Allocation</h2>
                <div className="text-[11px] text-slate-500">Templates make repeat SEO plays a single click</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {templates.length} templates
              </span>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Templates */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Templates</div>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200 hover:bg-cyan-400/20"
                >
                  <Plus className="h-3 w-3" /> New template
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {templates.map((tpl) => {
                  const meta = PRIORITY_META[tpl.priority];
                  return (
                    <li key={tpl.id} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition hover:border-cyan-400/40 hover:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Bookmark className="h-3.5 w-3.5 text-cyan-300" />
                            <div className="truncate text-sm font-semibold text-white">{tpl.name}</div>
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">{tpl.desc}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${meta.cls}`}>
                              <meta.icon className="h-2.5 w-2.5" /> {meta.label}
                            </span>
                            {tpl.defaultAssignee && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
                                <Users className="h-2.5 w-2.5" /> {tpl.defaultAssignee}
                              </span>
                            )}
                            {tpl.builtIn && (
                              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/5 px-1.5 py-px text-[9px] uppercase tracking-wider text-cyan-300">
                                built-in
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => useTemplate(tpl)}
                          className="shrink-0 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-400/20"
                        >
                          Use
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Quick allocation */}
            <QuickAllocate
              agents={agents}
              templates={templates}
              onCreate={(t) => addTask(t)}
            />
          </div>
        </section>

        {/* Workload */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-slate-950 shadow">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Workload Management</h2>
                <div className="text-[11px] text-slate-500">Live agent load & operational status</div>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" />
              Live · this week
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {workload.map((w) => {
              const expert = EXPERTS.find((e) => e.title === w.name);
              const accent = expert?.accent ?? "from-cyan-400 to-blue-500";
              const status: { label: string; cls: string; pulse?: boolean } =
                w.critical > 0
                  ? { label: "Overloaded", cls: "border-rose-500/40 bg-rose-500/10 text-rose-200", pulse: true }
                  : w.total === 0
                  ? { label: "Idle", cls: "border-slate-700 bg-slate-900/60 text-slate-400" }
                  : w.total <= 2
                  ? { label: "Healthy", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" }
                  : { label: "Busy", cls: "border-amber-400/30 bg-amber-400/10 text-amber-200" };
              return (
                <div key={w.name} className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
                  <div className="flex items-center gap-3">
                    <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-700/60`}>
                      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-25`} />
                      <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{w.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${status.cls}`}>
                          {status.pulse && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
                            </span>
                          )}
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Active tasks</div>
                    <div className="text-lg font-semibold tabular-nums text-white">{w.total}</div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${accent} transition-all duration-500`}
                      style={{ width: `${w.pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{w.critical} critical · {w.high} high</span>
                    <span className="tabular-nums">{w.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Kanban toolbar */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Kanban board</h2>
              <p className="text-xs text-slate-500">Drag tasks between stages to update their status in real-time.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks, agents…"
                  className="w-52 bg-transparent text-[12px] text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>
              <SelectPill
                icon={Flag}
                value={prioFilter}
                onChange={(v) => setPrioFilter(v as typeof prioFilter)}
                options={[
                  { value: "all", label: "All priorities" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
              <SelectPill
                icon={Users}
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                options={[
                  { value: "all", label: "All agents" },
                  ...agents.map((a) => ({ value: a, label: a })),
                ]}
              />
              <button
                onClick={() => {
                  setQuery("");
                  setPrioFilter("all");
                  setAssigneeFilter("all");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
              >
                <Filter className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const colTasks = filtered.filter((t) => t.status === col.id);
              const isOver = dragOver === col.id;
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOver !== col.id) setDragOver(col.id);
                  }}
                  onDragLeave={() => setDragOver((v) => (v === col.id ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropTo(col.id);
                  }}
                  className={`relative flex flex-col rounded-2xl border bg-slate-900/40 transition ${
                    isOver
                      ? "border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_24px_rgba(34,211,238,0.15)]"
                      : "border-slate-800"
                  }`}
                >
                  <div className={`h-px w-full bg-gradient-to-r ${col.accent}`} />
                  <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                      <div>
                        <div className="text-sm font-semibold text-white">{col.title}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{col.hint}</div>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2 p-3">
                    {colTasks.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-[11px] text-slate-500">
                        Drop tasks here
                      </div>
                    )}
                    {colTasks.map((t) => (
                      <KanbanCard
                        key={t.id}
                        task={t}
                        dragging={dragId === t.id}
                        onDragStart={() => onDragStart(t.id)}
                        onDragEnd={onDragEnd}
                        onRemove={() => removeTask(t.id)}
                        onPriorityChange={(p) => updateTask(t.id, { priority: p })}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setPrefill({ status: col.id });
                      setShowCreate(true);
                    }}
                    className="m-3 mt-0 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-800 bg-slate-950/40 py-2 text-[11px] font-medium text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-200"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add to {col.title}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div aria-hidden className="h-16" />
      </div>

      {showCreate && (
        <TaskModal
          agents={agents}
          templates={templates}
          initial={prefill}
          onClose={() => {
            setShowCreate(false);
            setPrefill(null);
          }}
          onSave={(t) => {
            addTask(t);
            setShowCreate(false);
            setPrefill(null);
          }}
        />
      )}

      {showTemplateEditor && (
        <TemplateEditor
          agents={agents}
          templates={templates}
          onClose={() => setShowTemplateEditor(false)}
          onSave={saveTemplate}
          onDelete={deleteTemplate}
        />
      )}
    </div>
  );
}

// ------------ Sub-components ------------

function KpiCard({
  label,
  value,
  sub,
  pct,
  accent,
  icon: Icon,
  pulse,
}: {
  label: string;
  value: number | string;
  sub?: string;
  pct: number;
  accent: string;
  icon: LucideIcon;
  pulse?: boolean;
}) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3 text-cyan-300" /> {label}
            {pulse && (
              <span className="relative ml-1 flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
              </span>
            )}
          </div>
          <div className="mt-1.5 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(30 41 59)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              className={`bg-gradient-to-r ${accent}`}
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              style={{ color: "#22d3ee" }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold text-slate-300 tabular-nums">
            {Math.round(pct)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectPill({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-300">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent pr-4 text-[12px] text-white focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-500" />
    </label>
  );
}

function QuickAllocate({
  agents,
  templates,
  onCreate,
}: {
  agents: string[];
  templates: Template[];
  onCreate: (t: Omit<Task, "id" | "createdAt">) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("todo");
  const [templateId, setTemplateId] = useState<string>("");

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    if (tpl.defaultAssignee) setAssignee(tpl.defaultAssignee);
    setPriority(tpl.priority);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      assignee: assignee || agents[0] || "Unassigned",
      priority,
      status,
      due: isoDaysFromNow(3),
      templateId: templateId || undefined,
    });
    setTitle("");
    setTemplateId("");
  };

  return (
    <form
      onSubmit={submit}
      className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-slate-950/70 p-4"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 to-blue-500" />
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-300" />
        <div className="text-sm font-semibold text-white">Quick allocate</div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">From template</label>
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Task title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Compress hero images on /pricing"
            className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Place in column</label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {COLUMNS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setStatus(c.id)}
                className={`rounded-md border px-2 py-1.5 text-[11px] transition ${
                  status === c.id
                    ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Allocate task
        </button>
      </div>
    </form>
  );
}

function KanbanCard({
  task,
  dragging,
  onDragStart,
  onDragEnd,
  onRemove,
  onPriorityChange,
}: {
  task: Task;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onPriorityChange: (p: Priority) => void;
}) {
  const meta = PRIORITY_META[task.priority];
  const due = relativeDue(task.due);
  const overdue = task.due ? new Date(task.due).getTime() < Date.now() && task.status !== "done" : false;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group relative cursor-grab overflow-hidden rounded-lg border bg-slate-950/70 p-3 shadow-sm transition active:cursor-grabbing ${
        dragging
          ? "rotate-1 scale-[0.98] border-cyan-400/60 opacity-70"
          : `border-slate-800 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_6px_24px_rgba(34,211,238,0.08)] ${meta.ring}`
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${
        task.priority === "critical" ? "from-rose-500 to-red-500"
          : task.priority === "high" ? "from-amber-400 to-orange-500"
          : task.priority === "medium" ? "from-cyan-400 to-blue-500"
          : "from-slate-600 to-slate-700"
      }`} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
            <div className="min-w-0 text-[13px] font-medium leading-snug text-white">{task.title}</div>
          </div>
          {task.desc && (
            <div className="mt-1 pl-5 text-[11px] leading-relaxed text-slate-400 line-clamp-2">{task.desc}</div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-800 hover:text-rose-300 group-hover:opacity-100"
          aria-label="Delete task"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-5">
        <select
          value={task.priority}
          onChange={(e) => onPriorityChange(e.target.value as Priority)}
          className={`appearance-none rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider focus:outline-none ${meta.cls}`}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
          <Users className="h-2.5 w-2.5" /> {task.assignee}
        </span>
        {due && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${
              overdue
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : "border-slate-800 bg-slate-950/60 text-slate-400"
            }`}
          >
            <Timer className="h-2.5 w-2.5" /> {due}
          </span>
        )}
      </div>
    </article>
  );
}

function TaskModal({
  agents,
  templates,
  initial,
  onClose,
  onSave,
}: {
  agents: string[];
  templates: Template[];
  initial: Partial<Task> | null;
  onClose: () => void;
  onSave: (t: Omit<Task, "id" | "createdAt">) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [assignee, setAssignee] = useState(initial?.assignee ?? agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(initial?.status ?? "todo");
  const [due, setDue] = useState<string>(initial?.due?.slice(0, 16) ?? "");
  const [templateId, setTemplateId] = useState<string>(initial?.templateId ?? "");

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setDesc(tpl.desc);
    if (tpl.defaultAssignee) setAssignee(tpl.defaultAssignee);
    setPriority(tpl.priority);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      desc: desc.trim() || undefined,
      assignee,
      priority,
      status,
      due: due ? new Date(due).toISOString() : undefined,
      templateId: templateId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950 shadow-2xl"
      >
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 shadow">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Task Allocation
              </div>
              <h2 className="text-base font-semibold text-white">New Task</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Template (optional)</label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="">— start from scratch —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Context, acceptance criteria, links…"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Column</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Due</label>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Create task
          </button>
        </div>
      </form>
    </div>
  );
}

function TemplateEditor({
  agents,
  templates,
  onClose,
  onSave,
  onDelete,
}: {
  agents: string[];
  templates: Template[];
  onClose: () => void;
  onSave: (tpl: Omit<Template, "id"> & { id?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState<string>(agents[0] ?? "");
  const [priority, setPriority] = useState<Priority>("medium");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !title.trim()) return;
    onSave({
      name: name.trim(),
      title: title.trim(),
      desc: desc.trim(),
      defaultAssignee,
      priority,
    });
    setName("");
    setTitle("");
    setDesc("");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950 shadow-2xl"
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-400 to-fuchsia-500" />
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-slate-950 shadow">
              <BookmarkPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Templates
              </div>
              <h2 className="text-base font-semibold text-white">Manage Task Templates</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">New template</div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blog refresh cadence" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Default task title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Refresh {'{{'} url {'}}'}" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Playbook / description</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[13px] text-white focus:border-cyan-400/50 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Default assignee</label>
                <select value={defaultAssignee} onChange={(e) => setDefaultAssignee(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100">
                  {agents.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="mt-1 h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={!name.trim() || !title.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-2 text-[12px] font-semibold text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Save template
            </button>
          </form>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Existing ({templates.length})</div>
            <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {templates.map((tpl) => {
                const meta = PRIORITY_META[tpl.priority];
                return (
                  <li key={tpl.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{tpl.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{tpl.desc}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider ${meta.cls}`}>
                            {meta.label}
                          </span>
                          {tpl.defaultAssignee && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-400">
                              {tpl.defaultAssignee}
                            </span>
                          )}
                        </div>
                      </div>
                      {!tpl.builtIn && (
                        <button
                          onClick={() => onDelete(tpl.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                          aria-label="Delete template"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-slate-200 hover:bg-slate-800">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Keep CalendarClock import referenced (used indirectly via icons in future)
void CalendarClock;
