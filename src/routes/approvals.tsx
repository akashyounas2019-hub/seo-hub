import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  X,
  Settings2,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { useSite } from "@/lib/site-context";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — AKS SEO Console" },
      {
        name: "description",
        content: "Review tasks pending owner approval and configure which tasks a Head of Department can approve independently.",
      },
    ],
  }),
  component: ApprovalsPage,
});

type PendingTask = {
  id: string;
  siteId: string | null;
  title: string;
  desc: string | null;
  assignee: string;
  priority: string;
  status: string;
  templateId: string | null;
  createdAt: string;
};

type ApprovalRule = {
  id: string;
  name: string;
  minPriority: string | null;
  category: string | null;
  siteId: string | null;
  requiresApproval: boolean;
  enabled: boolean;
  createdAt: string;
};

const PRIORITY_META: Record<string, string> = {
  low: "border-slate-700 bg-slate-800/50 text-slate-300",
  medium: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  high: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ApprovalsPage() {
  const { allSites } = useSite();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/pending-approval");
      const json = await res.json();
      if (json?.ok) setTasks(json.tasks || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const [immediateIds, setImmediateIds] = useState<Set<string>>(new Set());
  const toggleImmediate = (id: string) => {
    setImmediateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const siteLabel = (siteId: string | null) => allSites.find((s) => s.id === siteId)?.label || siteId || "Unknown site";

  async function decide(id: string, approve: boolean, immediate?: boolean) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      // Approving sends the task straight to "inprogress" rather than
      // "todo" -- api.tasks.$id.ts creates a real claude_jobs row the
      // moment a task enters "inprogress", so approval actually starts
      // execution instead of just moving it to a backlog someone has to
      // separately notice and drag over. `immediate` forces the job to
      // "critical" priority, which api.jobs.claim.ts now actually honors --
      // it claims ahead of everything else already queued.
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: approve ? "inprogress" : "rejected", immediate: approve ? !!immediate : undefined }),
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error);
      toast.success(
        approve
          ? immediate
            ? "Task approved — jumped to front of the queue"
            : "Task approved — real execution started"
          : "Task rejected",
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to update task");
      load();
    }
  }

  async function reevaluateAll() {
    setReevaluating(true);
    try {
      const res = await fetch("/api/tasks/pending-approval", { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Re-evaluated ${json.reviewed} task(s) — ${json.autoApproved} auto-approved`);
        load();
      } else {
        toast.error(json?.error || "Failed to re-evaluate");
      }
    } finally {
      setReevaluating(false);
    }
  }

  const kpi = useMemo(() => {
    const critical = tasks.filter((t) => t.priority === "critical").length;
    const high = tasks.filter((t) => t.priority === "high").length;
    return { total: tasks.length, critical, high };
  }, [tasks]);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Owner Sign-off Queue
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Approvals</h1>
            <p className="mt-1 text-sm text-slate-400">
              Tasks recommended by the Head of SEO orchestrator or agents, routed here by your approval rules before
              they're forwarded to an agent. Empty means nothing is currently waiting on you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reevaluateAll}
              disabled={reevaluating}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reevaluating ? "animate-spin" : ""}`} /> Re-evaluate pending
            </button>
            <button
              onClick={() => setRulesOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Settings2 className="h-4 w-4" /> Approval rules
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Pending</div>
            <div className="mt-1 text-2xl font-semibold text-white">{kpi.total}</div>
          </div>
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
            <div className="text-[11px] uppercase tracking-wider text-rose-300/80">Critical</div>
            <div className="mt-1 text-2xl font-semibold text-white">{kpi.critical}</div>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
            <div className="text-[11px] uppercase tracking-wider text-amber-300/80">High priority</div>
            <div className="mt-1 text-2xl font-semibold text-white">{kpi.high}</div>
          </div>
        </section>

        {/* Pending tasks list */}
        <section className="mt-6 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
              Loading pending approvals…
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-500">
              Nothing pending approval. Run a Head of SEO review from the Dashboard, or wait for agent-generated tasks
              that your rules route here.
            </div>
          ) : (
            tasks.map((t) => (
              <article key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${PRIORITY_META[t.priority] || PRIORITY_META.medium}`}>
                        {t.priority}
                      </span>
                      {t.templateId && (
                        <span className="rounded-full border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-400">{t.templateId}</span>
                      )}
                      <span className="text-[11px] text-slate-500">{siteLabel(t.siteId)}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white">{t.title}</h3>
                    {t.desc && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-400">{t.desc}</p>}
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Suggested: {t.assignee}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(t.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(t.id, false)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => decide(t.id, true, immediateIds.has(t.id))}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
                      <input
                        type="checkbox"
                        checked={immediateIds.has(t.id)}
                        onChange={() => toggleImmediate(t.id)}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-amber-400 accent-amber-400 focus:ring-amber-400/40"
                      />
                      <Zap className="h-3 w-3 text-amber-300" /> Immediate — bypass queue
                    </label>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      {rulesOpen && <ApprovalRulesModal onClose={() => setRulesOpen(false)} sites={allSites} />}
    </div>
  );
}

function ApprovalRulesModal({ onClose, sites }: { onClose: () => void; sites: Array<{ id: string; label: string }> }) {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approval-rules");
      const json = await res.json();
      if (json?.ok) setRules(json.rules || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function toggle(rule: ApprovalRule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await fetch(`/api/approval-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
    } catch {
      toast.error("Failed to update rule");
      load();
    }
  }

  async function remove(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/approval-rules/${id}`, { method: "DELETE" });
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
      load();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0a0d16] shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">Approval Rules</div>
            <h2 className="mt-1 text-base font-semibold text-white">What needs your sign-off?</h2>
            <p className="mt-1 text-xs text-slate-400">
              Rules are checked by priority threshold, agent/category, and site — most specific match wins. A task
              that matches no rule defaults to requiring your approval.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20"
          >
            <Plus className="h-3.5 w-3.5" /> New rule
          </button>
        </div>

        <ul className="mt-3 max-h-[50vh] divide-y divide-slate-800 overflow-y-auto px-5 pb-2">
          {loading ? (
            <li className="py-6 text-center text-xs text-slate-500">Loading rules…</li>
          ) : rules.length === 0 ? (
            <li className="py-6 text-center text-xs text-slate-500">No rules yet — everything defaults to requiring your approval.</li>
          ) : (
            rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{r.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    <span>Priority ≥ {r.minPriority || "any"}</span>
                    <span>Category: {r.category || "any"}</span>
                    <span>Site: {r.siteId ? sites.find((s) => s.id === r.siteId)?.label || r.siteId : "any"}</span>
                    <span className={r.requiresApproval ? "text-amber-300" : "text-emerald-300"}>
                      {r.requiresApproval ? "Requires owner approval" : "Head of Department can auto-approve"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggle(r)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition ${r.enabled ? "bg-cyan-400" : "bg-slate-700"}`}
                    aria-pressed={r.enabled}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${r.enabled ? "left-4" : "left-0.5"}`} />
                  </button>
                  <button onClick={() => remove(r.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>

      {createOpen && (
        <CreateRuleModal
          sites={sites}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateRuleModal({ sites, onClose, onCreated }: {
  sites: Array<{ id: string; label: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [minPriority, setMinPriority] = useState("");
  const [category, setCategory] = useState("");
  const [siteId, setSiteId] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/approval-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          minPriority: minPriority || null,
          category: category.trim() || null,
          siteId: siteId || null,
          requiresApproval,
          enabled: true,
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Approval rule created");
        onCreated();
      } else {
        toast.error(json?.error || "Failed to create rule");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-semibold text-white">New Approval Rule</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Rule name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Local SEO tasks under high priority" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Min priority</label>
              <select value={minPriority} onChange={(e) => setMinPriority(e.target.value)} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none">
                <option value="">Any</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Site</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none">
                <option value="">Any site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Category / agent (optional)</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. technical, content, local, schema" className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/50 focus:outline-none" />
          </div>
          <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-slate-200">Requires owner approval</div>
              <div className="text-[11px] text-slate-500">Off = Head of Department can approve independently</div>
            </div>
            <button
              type="button"
              onClick={() => setRequiresApproval((v) => !v)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${requiresApproval ? "bg-cyan-400" : "bg-slate-700"}`}
              aria-pressed={requiresApproval}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${requiresApproval ? "left-4" : "left-0.5"}`} />
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110 disabled:opacity-50">
            {saving ? "Creating…" : "Create rule"}
          </button>
        </div>
      </form>
    </div>
  );
}
