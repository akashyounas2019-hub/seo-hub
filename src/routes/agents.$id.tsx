import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ListTodo,
  Plus,
  Sparkles,
  Trash2,
  Settings2,
  Bell,
  Cpu,
  Gauge,
  Power,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import {
  EXPERTS,
  loadProfiles,
  saveProfiles,
  getDefaultProfile,
  type AgentProfile,
  type AgentSettings,
  type Task,
} from "@/lib/agents";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/agents/$id")({
  beforeLoad: ({ params }) => {
    if (!EXPERTS.some((e) => e.id === params.id)) throw notFound();
  },
  head: ({ params }) => {
    const expert = EXPERTS.find((e) => e.id === params.id);
    const title = expert ? `${expert.title} — Agent Profile` : "Agent Profile";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: expert
            ? `Manage skills, tasks and settings for the ${expert.title} agent.`
            : "Agent profile management.",
        },
      ],
    };
  },
  component: AgentDetail,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#05070d] text-slate-200">
      <div className="text-center">
        <div className="text-lg font-semibold">Agent not found</div>
        <Link to="/" className="mt-3 inline-block text-cyan-300 hover:underline">
          ← Back to console
        </Link>
      </div>
    </div>
  ),
});

function AgentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const expert = useMemo(() => EXPERTS.find((e) => e.id === id)!, [id]);
  const Icon = expert.icon;

  const [profile, setProfile] = useState<AgentProfile>(() => getDefaultProfile(id));
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const all = loadProfiles();
    setProfile({ ...getDefaultProfile(id), ...(all[id] ?? {}) });
    setHydrated(true);
  }, [id]);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    const all = loadProfiles();
    saveProfiles({ ...all, [id]: profile });
  }, [profile, id, hydrated]);

  const [taskTitle, setTaskTitle] = useState("");
  const [assignee, setAssignee] = useState(expert.subs[0]?.name ?? "");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");

  const submitTask = () => {
    if (!taskTitle.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      assignee: assignee || expert.subs[0]?.name || "Unassigned",
      due: due || new Date().toISOString().slice(0, 16),
      status: "pending",
      priority,
    };
    setProfile((p) => ({ ...p, tasks: [task, ...p.tasks] }));
    setTaskTitle("");
    setDue("");
  };

  const toggleTask = (tid: string) =>
    setProfile((p) => ({
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === tid ? { ...t, status: t.status === "done" ? "pending" : "done" } : t
      ),
    }));

  const removeTask = (tid: string) =>
    setProfile((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== tid) }));

  const updateSettings = (patch: Partial<AgentSettings>) =>
    setProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  const pending = profile.tasks.filter((t) => t.status === "pending");
  const done = profile.tasks.filter((t) => t.status === "done");

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        {/* Breadcrumb / back */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/" })}
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to console
          </button>
          <div className="text-xs text-slate-500">
            <Link to="/" className="hover:text-cyan-300">Console</Link>
            <span className="mx-1.5">/</span>
            <span className="text-slate-300">{expert.title}</span>
          </div>
        </div>

        {/* Hero */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className={`h-1 w-full bg-gradient-to-r ${expert.accent}`} />
          <div className="grid gap-5 p-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <div className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-900/60 ring-1 ring-cyan-400/40 shadow-[0_0_30px_rgba(34,211,238,0.35)]`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${expert.accent} opacity-20`} />
              <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
                Agent Profile
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br ${expert.accent} shadow`}>
                  <Icon className="h-4 w-4 text-slate-950" />
                </span>
                <h1 className="truncate text-2xl font-semibold text-white">
                  {expert.title}
                </h1>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {expert.tag} · {expert.subs.length} sub-agents · reports to AKS SEO Team Leader
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatChip label="Pending" value={pending.length} />
              <StatChip label="Completed" value={done.length} />
              <StatChip
                label="Status"
                value={profile.settings.status === "active" ? "Active" : "Paused"}
                tone={profile.settings.status === "active" ? "ok" : "warn"}
              />
            </div>
          </div>
        </section>

        {/* Main grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Left column: Skills + Sub-agents */}
          <div className="space-y-6 lg:col-span-1">
            <Card title="Skill set" icon={<Sparkles className="h-4 w-4" />} accent={expert.accent}>
              <Textarea
                value={profile.skills}
                onChange={(e) => setProfile((p) => ({ ...p, skills: e.target.value }))}
                placeholder="Comma-separated skills"
                className="min-h-[140px] resize-none border-slate-800 bg-slate-900/60 text-slate-100"
              />
              <p className="mt-2 text-[11px] text-slate-500">Auto-saved locally as you type.</p>
            </Card>

            <Card title="Sub-agents" icon={<ListTodo className="h-4 w-4" />} accent={expert.accent}>
              <ul className="space-y-2">
                {expert.subs.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5"
                  >
                    <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-700/60">
                      <span className={`absolute inset-0 bg-gradient-to-br ${expert.accent} opacity-25`} />
                      <img src={agentBot} alt="" className="relative h-5 w-5 object-contain" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-slate-100">{s.name}</div>
                      <div className="truncate text-[11px] text-slate-500">{s.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Middle + Right: Tasks + Settings */}
          <div className="space-y-6 lg:col-span-2">
            <Card
              title="Assign & schedule task"
              icon={<CalendarClock className="h-4 w-4" />}
              accent={expert.accent}
            >
              <div className="space-y-3">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title (e.g. Audit homepage schema)"
                  className="border-slate-800 bg-slate-900/60"
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="mb-1 block text-[11px] text-slate-400">Assignee</Label>
                    <select
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
                    >
                      {expert.subs.map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-[11px] text-slate-400">Due</Label>
                    <Input
                      type="datetime-local"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      className="border-slate-800 bg-slate-900/60"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-[11px] text-slate-400">Priority</Label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Task["priority"])}
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 text-sm text-slate-100"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <Button
                  onClick={submitTask}
                  className={`w-full bg-gradient-to-r ${expert.accent} text-slate-950 hover:opacity-90`}
                >
                  <Plus className="mr-1 h-4 w-4" /> Schedule task
                </Button>
              </div>
            </Card>

            <Card
              title={`Scheduled tasks (${profile.tasks.length})`}
              icon={<ListTodo className="h-4 w-4" />}
              accent={expert.accent}
            >
              <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
                {profile.tasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-500">
                    No tasks scheduled yet.
                  </div>
                )}
                {profile.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      onChange={() => toggleTask(t.id)}
                      className="h-4 w-4 shrink-0 accent-cyan-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${t.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>
                        {t.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-slate-300">{t.assignee}</span>
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {t.due.replace("T", " ")}
                        </span>
                        {t.priority && (
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              t.priority === "high"
                                ? "bg-rose-500/20 text-rose-200"
                                : t.priority === "medium"
                                ? "bg-amber-500/20 text-amber-200"
                                : "bg-slate-700/50 text-slate-300"
                            }`}
                          >
                            {t.priority}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeTask(t.id)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
                      aria-label="Remove task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Agent settings" icon={<Settings2 className="h-4 w-4" />} accent={expert.accent}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingRow icon={<Power className="h-4 w-4" />} label="Active">
                  <Switch
                    checked={profile.settings.status === "active"}
                    onCheckedChange={(v) => updateSettings({ status: v ? "active" : "paused" })}
                  />
                </SettingRow>
                <SettingRow icon={<Bell className="h-4 w-4" />} label="Notify on complete">
                  <Switch
                    checked={profile.settings.notifyOnComplete}
                    onCheckedChange={(v) => updateSettings({ notifyOnComplete: v })}
                  />
                </SettingRow>
                <SettingRow icon={<Gauge className="h-4 w-4" />} label="Default priority">
                  <select
                    value={profile.settings.priority}
                    onChange={(e) => updateSettings({ priority: e.target.value as AgentSettings["priority"] })}
                    className="h-8 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </SettingRow>
                <SettingRow icon={<Cpu className="h-4 w-4" />} label="Model">
                  <select
                    value={profile.settings.model}
                    onChange={(e) => updateSettings({ model: e.target.value })}
                    className="h-8 rounded-md border border-slate-800 bg-slate-900/60 px-2 text-xs text-slate-100"
                  >
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="claude-sonnet">claude-sonnet</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                  </select>
                </SettingRow>
                <div className="sm:col-span-2">
                  <Label className="mb-2 block text-[11px] text-slate-400">
                    Autonomy level — {profile.settings.autonomy}%
                  </Label>
                  <Slider
                    value={[profile.settings.autonomy]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(v) => updateSettings({ autonomy: v[0] ?? 0 })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-1 block text-[11px] text-slate-400">Operator notes</Label>
                  <Textarea
                    value={profile.settings.notes}
                    onChange={(e) => updateSettings({ notes: e.target.value })}
                    placeholder="Runbook, quirks, escalation contacts…"
                    className="min-h-[90px] resize-none border-slate-800 bg-slate-900/60 text-slate-100"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className={`h-px w-full bg-gradient-to-r ${accent}`} />
      <div className="border-b border-slate-800/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-cyan-200">
          <span className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${accent} text-slate-950`}>
            {icon}
          </span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "ok" | "warn";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : "border-slate-800 bg-slate-900/60 text-slate-200";
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-center ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
