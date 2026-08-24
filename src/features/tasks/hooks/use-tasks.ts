import { useEffect, useMemo, useState } from "react";
import { EXPERTS } from "@/lib/agents";
import { SEED_TASKS, SEED_TEMPLATES } from "../constants";
import type { Priority, Status, Task, Template } from "../types";
import { loadState, saveState } from "../utils/storage";

export function useTasks() {
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
    // Initial local storage hydration
    const s = loadState(SEED_TASKS, SEED_TEMPLATES);
    setTasks(s.tasks);
    setTemplates(s.templates);

    // Sync from database API. Tasks awaiting owner sign-off or rejected by
    // the approval-rules engine live on the Approvals screen, not this
    // assignment board -- filter them out here so this board only shows
    // work that's actually been approved to move.
    fetch("/api/tasks")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.tasks) && data.tasks.length > 0) {
          setTasks(data.tasks.filter((t: Task) => (t.status as string) !== "pending_approval" && (t.status as string) !== "rejected"));
        }
        if (data && Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
        }
      })
      .catch(() => {
        /* fallback to local storage */
      })
      .finally(() => setHydrated(true));
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
  };
}
