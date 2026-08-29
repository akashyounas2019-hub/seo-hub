import {
  AlertTriangle,
  Bell,
  Bot,
  Filter,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AGENTS, CADENCE_LABEL, CATEGORIES } from "../constants";
import { useAutomation } from "../hooks/use-automation";
import { AutomationKpiCard } from "./automation-kpi-card";
import { FlowEditor, Modal } from "./flow-editor";
import { TemplatesModal } from "./templates-modal";

export function AutomationView() {
  const {
    flows,
    loading,
    loadError,
    refetch,
    category,
    setCategory,
    statusFilter,
    setStatusFilter,
    query,
    setQuery,
    editor,
    setEditor,
    templatesOpen,
    setTemplatesOpen,
    confirmDelete,
    setConfirmDelete,
    filtered,
    kpi,
    toggleStatus,
    deleteFlow,
    saveFlow,
  } = useAutomation();

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Dubai · Cleaning Services
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">SEO Automation</h1>
            <p className="mt-1 text-sm text-slate-400">
              Chain agents together with triggers and schedules built for the UAE cleaning market.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTemplatesOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Bot className="h-4 w-4" /> Templates
            </button>
            <button
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-4 w-4" /> New flow
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AutomationKpiCard
            label="Total flows"
            value={kpi.total}
            sub="Across all categories"
            percent={100}
            ringFrom="#22d3ee"
            ringTo="#0ea5e9"
            icon={Zap}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <AutomationKpiCard
            label="Running"
            value={kpi.running}
            sub={`${kpi.total ? Math.round((kpi.running / kpi.total) * 100) : 0}% of pipeline`}
            percent={kpi.total ? (kpi.running / kpi.total) * 100 : 0}
            ringFrom="#34d399"
            ringTo="#14b8a6"
            icon={Play}
            active={statusFilter === "running"}
            onClick={() => setStatusFilter("running")}
          />
          <AutomationKpiCard
            label="Paused"
            value={kpi.paused}
            sub={`${kpi.draft} draft`}
            percent={kpi.total ? (kpi.paused / kpi.total) * 100 : 0}
            ringFrom="#fbbf24"
            ringTo="#f97316"
            icon={Pause}
            active={statusFilter === "paused"}
            onClick={() => setStatusFilter("paused")}
          />
          <AutomationKpiCard
            label="Avg success"
            value={`${kpi.avg}%`}
            sub="Across scored runs"
            percent={kpi.avg}
            ringFrom="#c084fc"
            ringTo="#e879f9"
            icon={TrendingUp}
          />
        </section>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search automations…"
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
            {(["all", "running", "paused", "draft"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2.5 py-1 capitalize transition ${
                  statusFilter === s ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" /> {filtered.length} of {flows.length}
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              category === "all"
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> All categories
          </button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Real load state -- no fabricated fallback list */}
        {loading && (
          <div className="mt-10 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading real automation flows…
          </div>
        )}

        {!loading && loadError && (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-10 text-center">
            <AlertTriangle className="h-5 w-5 text-rose-300" />
            <p className="text-sm text-rose-200">{loadError}</p>
            <button
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {!loading && !loadError && flows.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
            <Bot className="h-6 w-6 text-slate-600" />
            <p className="text-sm text-slate-400">No automation flows yet. Create one to get started.</p>
            <button
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-3.5 w-3.5" /> New flow
            </button>
          </div>
        )}

        {/* Flow cards */}
        {!loading && !loadError && flows.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const Icon = f.icon;
            return (
              <li
                key={f.id}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.08)]"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${f.accent}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${f.accent} text-slate-950 shadow`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white leading-tight">{f.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{f.desc}</div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      f.status === "running"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : f.status === "paused"
                          ? "bg-amber-400/10 text-amber-300"
                          : "bg-slate-700/40 text-slate-400"
                    }`}
                  >
                    {f.status === "running" ? <Play className="h-3 w-3" /> : f.status === "paused" ? <Pause className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                    {f.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Cadence</div>
                    <div className="mt-0.5 text-slate-200">{CADENCE_LABEL[f.cadence]}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Last run</div>
                    <div className="mt-0.5 text-slate-200">{f.lastRun}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Success</div>
                    <div className="mt-0.5 text-slate-200">{f.successRate ? `${f.successRate}%` : "—"}</div>
                  </div>
                </div>

                {f.assignedAgents && f.assignedAgents.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Agents</span>
                    {f.assignedAgents.slice(0, 3).map((aid) => {
                      const a = AGENTS.find((x) => x.id === aid);
                      if (!a) return null;
                      const AIcon = a.icon;
                      return (
                        <span
                          key={aid}
                          className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/5 px-2 py-0.5 text-[10px] text-cyan-200"
                          title={a.role}
                        >
                          <AIcon className="h-3 w-3" /> {a.name}
                        </span>
                      );
                    })}
                    {f.assignedAgents.length > 3 && (
                      <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] text-slate-400">
                        +{f.assignedAgents.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {CATEGORIES.find((c) => c.id === f.category)?.label}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleStatus(f.id)}
                      className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                      aria-label={f.status === "running" ? "Pause" : "Run"}
                      title={f.status === "running" ? "Pause" : "Run"}
                    >
                      {f.status === "running" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditor({ mode: "edit", flow: f })}
                      className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(f)}
                      className="rounded-md border border-rose-500/30 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="col-span-full rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
              No automations match these filters.
            </li>
          )}
        </ul>
        )}

        <div aria-hidden className="h-16" />
      </div>

      {/* Editor modal */}
      {editor && (
        <FlowEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSave={saveFlow}
        />
      )}

      {/* Templates modal */}
      {templatesOpen && (
        <TemplatesModal
          onClose={() => setTemplatesOpen(false)}
          onPick={(t) => {
            setTemplatesOpen(false);
            setEditor({ mode: "create", base: t });
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} title="Delete automation?">
          <p className="text-sm text-slate-400">
            This will permanently remove <span className="text-slate-200 font-medium">{confirmDelete.name}</span>. This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteFlow(confirmDelete.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
