import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, INITIAL_FLOWS } from "../constants";
import type { Cadence, EditorState, Flow, Status } from "../types";

export function useAutomation() {
  const [flows, setFlows] = useState<Flow[]>(INITIAL_FLOWS);
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Flow | null>(null);

  useEffect(() => {
    fetch("/api/automation/flows")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.flows) && data.flows.length > 0) {
          // Map category icons & accents from CATEGORIES
          const mapped = data.flows.map((f: any) => {
            const cat = CATEGORIES.find((c) => c.id === f.category) ?? CATEGORIES[0];
            return {
              ...f,
              icon: cat.icon,
              accent: cat.accent,
              assignedAgents: Array.isArray(f.assignedAgents) ? f.assignedAgents : [],
            };
          });
          setFlows(mapped);
        }
      })
      .catch(() => {
        /* fallback to INITIAL_FLOWS */
      });
  }, []);

  const filtered = useMemo(() => {
    return flows.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (query && !(`${f.name} ${f.desc}`.toLowerCase().includes(query.toLowerCase()))) return false;
      return true;
    });
  }, [flows, category, statusFilter, query]);

  const kpi = useMemo(() => {
    const running = flows.filter((f) => f.status === "running").length;
    const paused = flows.filter((f) => f.status === "paused").length;
    const draft = flows.filter((f) => f.status === "draft").length;
    const scored = flows.filter((f) => f.successRate > 0);
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.successRate, 0) / scored.length) : 0;
    return { running, paused, draft, avg, total: flows.length };
  }, [flows]);

  function toggleStatus(id: string) {
    let nextStatus: Status = "running";
    setFlows((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          nextStatus = f.status === "running" ? "paused" : "running";
          return { ...f, status: nextStatus, lastRun: nextStatus === "running" ? "Just now" : f.lastRun };
        }
        return f;
      }),
    );

    fetch(`/api/automation/flows/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => {});
  }

  function deleteFlow(id: string) {
    setFlows((prev) => prev.filter((f) => f.id !== id));
    setConfirmDelete(null);

    fetch(`/api/automation/flows/${id}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  function saveFlow(data: {
    id?: string;
    name: string;
    desc: string;
    category: string;
    cadence: Cadence;
    status: Status;
    assignedAgents: string[];
  }) {
    const cat = CATEGORIES.find((c) => c.id === data.category) ?? CATEGORIES[0];
    if (data.id) {
      setFlows((prev) =>
        prev.map((f) =>
          f.id === data.id
            ? {
                ...f,
                name: data.name,
                desc: data.desc,
                category: data.category,
                cadence: data.cadence,
                status: data.status,
                accent: cat.accent,
                assignedAgents: data.assignedAgents,
              }
            : f,
        ),
      );

      fetch(`/api/automation/flows/${data.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    } else {
      const newFlow: Flow = {
        id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: data.name,
        desc: data.desc,
        category: data.category,
        cadence: data.cadence,
        status: data.status,
        icon: cat.icon,
        accent: cat.accent,
        lastRun: "Just created",
        successRate: 100,
        assignedAgents: data.assignedAgents,
      };
      setFlows((prev) => [newFlow, ...prev]);

      fetch("/api/automation/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newFlow),
      }).catch(() => {});
    }
    setEditor(null);
  }

  return {
    flows,
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
  };
}
