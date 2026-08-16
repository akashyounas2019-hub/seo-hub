import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Brain,
  CalendarClock,
  Cpu,
  Eraser,
  Gauge,
  ListTodo,
  Pin,
  PinOff,
  Plus,
  Power,
  ScrollText,
  Settings2,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildSubAgentId, type AgentProfile, type AgentSettings, type MemoryNote, type Task } from "@/lib/agents";
import { useAgentDetail } from "../hooks/use-agent-detail";

export function AgentDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const {
    parentId,
    expert,
    isSub,
    profile,
    setProfile,
    resolved,
    displayTitle,
    displayTag,
    assigneeOptions,
    taskTitle,
    setTaskTitle,
    assignee,
    setAssignee,
    due,
    setDue,
    priority,
    setPriority,
    submitTask,
    toggleTask,
    removeTask,
    updateSettings,
    newSubName,
    setNewSubName,
    newSubDesc,
    setNewSubDesc,
    showAddSub,
    setShowAddSub,
    addSubAgent,
    removeExtraSub,
    memoryText,
    setMemoryText,
    memoryTag,
    setMemoryTag,
    addMemoryNote,
    togglePinMemory,
    deleteMemoryNote,
    clearLogs,
    pending,
    done,
    Icon,
    isExtra,
  } = useAgentDetail(id);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 relative overflow-hidden">
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
            onClick={() => navigate({ to: isSub ? "/agents/$id" : "/", params: isSub ? { id: parentId } : undefined })}
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {isSub ? `Back to ${expert.title}` : "Back to console"}
          </button>
          <div className="text-xs text-slate-500">
            <Link to="/" className="hover:text-cyan-300">Console</Link>
            <span className="mx-1.5">/</span>
            {isSub ? (
              <>
                <Link to="/agents/$id" params={{ id: parentId }} className="hover:text-cyan-300">
                  {expert.title}
                </Link>
                <span className="mx-1.5">/</span>
                <span className="text-slate-300">{displayTitle}</span>
              </>
            ) : (
              <span className="text-slate-300">{expert.title}</span>
            )}
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
                {isSub ? "Sub-agent Profile" : "Agent Profile"}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br ${expert.accent} shadow`}>
                  <Icon className="h-4 w-4 text-slate-950" />
                </span>
                <h1 className="truncate text-2xl font-semibold text-white">
                  {displayTitle}
                </h1>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {displayTag} {isSub ? `· reports to ${expert.title}` : `· ${resolved.subs.length} sub-agents · reports to AKS SEO Team Leader`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <StatChip label="Pending" value={pending.length} />
              <StatChip label="Completed" value={done.length} />
              <ToggleChip
                label="Active"
                icon={<Power className="h-3.5 w-3.5" />}
                checked={profile.settings.status === "active"}
                onCheckedChange={(v) => updateSettings({ status: v ? "active" : "paused" })}
                activeAccent={expert.accent}
              />
              <ToggleChip
                label="Notify"
                icon={<Bell className="h-3.5 w-3.5" />}
                checked={profile.settings.notifyOnComplete}
                onCheckedChange={(v) => updateSettings({ notifyOnComplete: v })}
                activeAccent={expert.accent}
              />
            </div>
          </div>
        </section>

        {/* Main grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
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

            {!isSub && (
              <Card
                title={`Sub-agents (${resolved.subs.length})`}
                icon={<ListTodo className="h-4 w-4" />}
                accent={expert.accent}
                action={
                  <button
                    onClick={() => setShowAddSub((s) => !s)}
                    className={`inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/20`}
                  >
                    <UserPlus className="h-3 w-3" /> Add
                  </button>
                }
              >
                {showAddSub && (
                  <div className="mb-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <Input
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Sub-agent name"
                      className="border-slate-800 bg-slate-900/60"
                    />
                    <Input
                      value={newSubDesc}
                      onChange={(e) => setNewSubDesc(e.target.value)}
                      placeholder="Short description"
                      className="border-slate-800 bg-slate-900/60"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={addSubAgent}
                        className={`flex-1 bg-gradient-to-r ${expert.accent} text-slate-950 hover:opacity-90`}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add to hierarchy
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddSub(false)}
                        className="border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-900"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {resolved.subs.map((s) => (
                    <li key={s.name} className="group/sub relative">
                      <Link
                        to="/agents/$id"
                        params={{ id: buildSubAgentId(parentId, s.name) }}
                        className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
                      >
                        <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-700/60">
                          <span className={`absolute inset-0 bg-gradient-to-br ${expert.accent} opacity-25`} />
                          <img src={agentBot} alt="" className="relative h-5 w-5 object-contain" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-slate-100 group-hover/sub:text-cyan-100">
                              {s.name}
                            </span>
                            {isExtra(s.name) && (
                              <span className="rounded bg-cyan-400/10 px-1 py-px text-[9px] uppercase tracking-wider text-cyan-200">
                                new
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">{s.desc}</div>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover/sub:text-cyan-200" />
                      </Link>
                      {isExtra(s.name) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            removeExtraSub(s.name);
                          }}
                          aria-label="Remove sub-agent"
                          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 opacity-0 transition group-hover/sub:opacity-100 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

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
                      {assigneeOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
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

            {/* Memory & Logs */}
            <MemorySection
              memoryText={memoryText}
              setMemoryText={setMemoryText}
              memoryTag={memoryTag}
              setMemoryTag={setMemoryTag}
              addMemoryNote={addMemoryNote}
              togglePinMemory={togglePinMemory}
              deleteMemoryNote={deleteMemoryNote}
              memories={profile.memories ?? []}
              accent={expert.accent}
            />

            <LogsSection logs={profile.logs ?? []} clearLogs={clearLogs} accent={expert.accent} />
          </div>
        </div>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function MemorySection({
  memoryText,
  setMemoryText,
  memoryTag,
  setMemoryTag,
  addMemoryNote,
  togglePinMemory,
  deleteMemoryNote,
  memories,
  accent,
}: {
  memoryText: string;
  setMemoryText: (v: string) => void;
  memoryTag: MemoryNote["tag"];
  setMemoryTag: (v: MemoryNote["tag"]) => void;
  addMemoryNote: () => void;
  togglePinMemory: (id: string) => void;
  deleteMemoryNote: (id: string) => void;
  memories: MemoryNote[];
  accent: string;
}) {
  return (
    <Card title={`Agent memory & context (${memories.length})`} icon={<Brain className="h-4 w-4" />} accent={accent}>
      <div className="space-y-3">
        <Textarea
          value={memoryText}
          onChange={(e) => setMemoryText(e.target.value)}
          placeholder="Add persistent rule, constraint, or learned fact…"
          className="min-h-[80px] resize-none border-slate-800 bg-slate-900/60 text-slate-100 text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-500">Tag:</span>
            {(["guideline", "fact", "preference", "constraint"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMemoryTag(t)}
                className={`rounded px-2 py-0.5 text-[10px] capitalize transition ${
                  memoryTag === t ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/40" : "bg-slate-900/60 text-slate-400 border border-slate-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Button onClick={addMemoryNote} className={`bg-gradient-to-r ${accent} text-slate-950 hover:opacity-90 h-8 text-xs`}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Save to memory
          </Button>
        </div>

        <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
          {memories.map((m) => (
            <div key={m.id} className={`rounded-lg border bg-slate-900/50 p-3 transition ${m.pinned ? "border-amber-400/40 bg-amber-400/5" : "border-slate-800"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 capitalize">{m.tag}</span>
                    <span>{m.ts.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-200 leading-relaxed">{m.text}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => togglePinMemory(m.id)} className={`rounded p-1 transition ${m.pinned ? "text-amber-300" : "text-slate-500 hover:text-slate-300"}`}>
                    {m.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => deleteMemoryNote(m.id)} className="rounded p-1 text-slate-500 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function LogsSection({ logs, clearLogs, accent }: { logs: AgentProfile["logs"]; clearLogs: () => void; accent: string }) {
  return (
    <Card
      title={`Activity & audit log (${logs.length})`}
      icon={<ScrollText className="h-4 w-4" />}
      accent={accent}
      action={
        logs.length > 0 ? (
          <button onClick={clearLogs} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-300">
            <Eraser className="h-3 w-3" /> Clear
          </button>
        ) : undefined
      }
    >
      <div className="max-h-[240px] space-y-1.5 overflow-auto font-mono text-[11px] pr-1">
        {logs.map((l) => (
          <div key={l.id} className="flex items-start gap-2 rounded border border-slate-900 bg-slate-950/80 p-2">
            <span className="text-slate-600 shrink-0">{l.ts.slice(11, 19)}</span>
            <span className={`shrink-0 rounded px-1 py-px text-[9px] uppercase font-sans ${
              l.kind === "assignment" ? "bg-cyan-400/20 text-cyan-200" : l.kind === "task" ? "bg-emerald-400/20 text-emerald-200" : "bg-slate-800 text-slate-400"
            }`}>
              {l.kind}
            </span>
            <span className="text-slate-300 min-w-0 flex-1 leading-snug">{l.message}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Card({
  title,
  icon,
  accent,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-sm transition hover:border-slate-700">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-cyan-300">{icon}</span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}

function ToggleChip({
  label,
  icon,
  checked,
  onCheckedChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  activeAccent: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition cursor-pointer ${
      checked ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-900/60 text-slate-400"
    }`}>
      {icon}
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="scale-75" />
    </label>
  );
}

function SettingRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/40 p-2.5">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-500">{icon}</span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
