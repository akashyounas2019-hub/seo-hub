import {
  AlertTriangle,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  ClipboardList,
  Layers,
  ListTodo,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { PRIORITY_META } from "../constants";
import { useTasks } from "../hooks/use-tasks";
import { KanbanCard } from "./kanban-card";
import { KpiCard } from "./kpi-card";
import { QuickAllocate } from "./quick-allocate";
import { TaskModal } from "./task-modal";
import { TemplateEditor } from "./template-editor";

export function TasksView() {
  const {
    templates,
    agents,
    kpis,
    showCreate,
    setShowCreate,
    prefill,
    setPrefill,
    showTemplateEditor,
    setShowTemplateEditor,
    addTask,
    saveTemplate,
    deleteTemplate,
    useTemplate,
  } = useTasks();

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

      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-8">
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
              Route work across your SEO squad — templated allocation and quick task dispatching.
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
