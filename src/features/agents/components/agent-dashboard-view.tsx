import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Filter,
  Flag,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  Users,
  Zap,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import { EXPERTS } from "@/lib/agents";
import { COLUMNS, PRIORITY_META } from "@/features/tasks/constants";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import type { Priority, Task } from "@/features/tasks/types";
import { KanbanCard } from "@/features/tasks/components/kanban-card";
import { KpiCard } from "@/features/tasks/components/kpi-card";
import { SelectPill } from "@/features/tasks/components/select-pill";
import { TaskModal } from "@/features/tasks/components/task-modal";
import { TaskItemDetailModal } from "@/features/tasks/components/task-item-detail-modal";
import { WorkloadTasksModal } from "@/features/tasks/components/workload-tasks-modal";

export function AgentDashboardView() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedWorkloadAgent, setSelectedWorkloadAgent] = useState<string | null>(null);

  const {
    tasks,
    templates,
    agents,
    query,
    setQuery,
    prioFilter,
    setPrioFilter,
    assigneeFilter,
    setAssigneeFilter,
    resetFilters,
    filtered,
    kpis,
    workload,
    showCreate,
    setShowCreate,
    prefill,
    setPrefill,
    dragId,
    dragOver,
    setDragOver,
    addTask,
    updateTask,
    removeTask,
    onDragStart,
    onDragEnd,
    onDropTo,
    refetch,
  } = useTasks();

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      {/* Background Glow */}
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
              Fleet Intelligence
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-white">
              <LayoutDashboard className="h-6 w-6 text-cyan-300" />
              Agent <span className="text-cyan-300">Dashboard</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Comprehensive operational overview — real-time workload balancing, active fleet execution, and a drag-and-drop Kanban workflow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPrefill(null);
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> Dispatch Task
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

        {/* Kanban Board Section */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Kanban Execution Board</h2>
              <p className="text-xs text-slate-500">Drag tasks between stages to update execution status in real-time.</p>
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
                onClick={resetFilters}
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
                        onPublished={refetch}
                        dragging={dragId === t.id}
                        onDragStart={() => onDragStart(t.id)}
                        onDragEnd={onDragEnd}
                        onRemove={() => removeTask(t.id)}
                        onPriorityChange={(p: Priority) => updateTask(t.id, { priority: p })}
                        onClick={() => setSelectedTask(t)}
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

        {/* Workload Management Section */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-slate-950 shadow">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Workload Management</h2>
                <div className="text-[11px] text-slate-500">Live agent load & operational status — click any agent to view assigned task details</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" />
              Live Monitoring
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
                <div
                  key={w.name}
                  onClick={() => setSelectedWorkloadAgent(w.name)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition cursor-pointer hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/80 hover:shadow-[0_0_24px_rgba(34,211,238,0.15)]"
                >
                  <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
                  <div className="flex items-center gap-3">
                    <div className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-700/60 group-hover:ring-cyan-400/60 transition`}>
                      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-25`} />
                      <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white group-hover:text-cyan-300 transition">{w.name}</div>
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
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Active tasks (Click to view)</div>
                    <div className="text-lg font-semibold tabular-nums text-white group-hover:text-cyan-300">{w.total}</div>
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

      {selectedTask && (
        <TaskItemDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(id, patch) => updateTask(id, patch)}
          onDelete={(id) => removeTask(id)}
        />
      )}

      {selectedWorkloadAgent && (
        <WorkloadTasksModal
          agentName={selectedWorkloadAgent}
          tasks={tasks}
          onClose={() => setSelectedWorkloadAgent(null)}
          onOpenTaskDetail={(t) => setSelectedTask(t)}
          onFilterKanban={(name) => setAssigneeFilter(name)}
        />
      )}
    </div>
  );
}
