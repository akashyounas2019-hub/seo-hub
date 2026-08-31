import { useEffect, useMemo, useState } from "react";
import { EXPERTS } from "@/lib/agents";
import { SEED_TEMPLATES } from "../constants";
import type { Priority, Status, Task, Template } from "../types";
import { saveState } from "../utils/storage";

export function useTasks() {
  // No fake seed tasks -- an empty array until the real /api/tasks fetch
  // resolves. Previously this initialized to SEED_TASKS (6 hardcoded fake
  // tasks like "Fix 14 canonical mismatches") and, on first-ever visit,
  // localStorage fell back to the same seed -- meaning a user could see
  // (and the board would even persist into localStorage) fabricated work
  // items before, or instead of, the real board ever loaded. Templates are
  // real static config (form presets, not fabricated activity), so
  // SEED_TEMPLATES stays as the honest starting set until the real
  // /api/tasks response's own templates replace it.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Sync from database API. Tasks awaiting owner sign-off, rejected by the
  // approval-rules engine, or cancelled in "review" live on the Approvals
  // screen (or nowhere) -- filter them out here so this board only shows
  // work that's actually approved and in flight. Exposed as `refetch` so
  // real actions elsewhere on the board (publish, cancel) can pull the
  // board's state back in sync after they happen server-side.
  //
  // A real, genuinely empty result (a brand-new site with zero tasks yet)
  // is a valid state and must still clear the board -- previously this
  // only called setTasks when the array was non-empty, so an empty real
  // response silently left whatever was on screen before (which, before
  // this fix, was fabricated seed data that would then never go away).
  // A failed/unreachable fetch is reported as a real error instead of
  // silently keeping stale or fake data on screen.
  const refetch = () => {
    setLoadError(null);
    return fetch("/api/tasks")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Failed to load tasks (${res.status})`))))
      .then((data) => {
        if (data && Array.isArray(data.tasks)) {
          setTasks(data.tasks.filter((t: Task) => !["pending_approval", "rejected", "resolved", "cancelled"].includes(t.status as string)));
        } else {
          throw new Error(data?.error || "Unexpected response loading tasks");
        }
        if (data && Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
        }
      })
      .catch((err: any) => {
        setLoadError(err?.message || "Failed to load tasks");
      });
  };

  useEffect(() => {
    setLoading(true);
    refetch().finally(() => {
      setHydrated(true);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const newTask: Task = {
      ...t,
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);

    fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newTask),
    }).catch(() => {});
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));

    fetch(`/api/tasks/${id}`, {
      method: "DELETE",
    }).catch(() => {});
  };

  const saveTemplate = (tpl: Omit<Template, "id"> & { id?: string }) => {
    setTemplates((prev) => {
      if (tpl.id) return prev.map((p) => (p.id === tpl.id ? ({ ...p, ...tpl } as Template) : p));
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

  const onDragStart = (id: string) => setDragId(id);
  const onDragEnd = () => {
    setDragId(null);
    setDragOver(null);
  };

  const onDropTo = (status: Status) => {
    if (dragId) updateTask(dragId, { status });
    onDragEnd();
  };

  const resetFilters = () => {
    setQuery("");
    setPrioFilter("all");
    setAssigneeFilter("all");
  };

  return {
    tasks,
    templates,
    loading,
    loadError,
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
    showTemplateEditor,
    setShowTemplateEditor,
    dragId,
    dragOver,
    setDragOver,
    addTask,
    updateTask,
    removeTask,
    saveTemplate,
    deleteTemplate,
    useTemplate,
    onDragStart,
    onDragEnd,
    onDropTo,
    refetch,
  };
}
