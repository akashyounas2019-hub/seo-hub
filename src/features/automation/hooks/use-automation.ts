import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CATEGORIES } from "../constants";
import type { Cadence, EditorState, Flow, Status } from "../types";

export function useAutomation() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Flow | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/automation/flows")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load automation flows"))))
      .then((data) => {
        // Real data only -- an empty result means no flows have been
        // created yet, not "fall back to a hardcoded demo list". Previously
        // this fell back to a fabricated INITIAL_FLOWS array whenever the
        // real automation_flows table was empty, which is exactly what
        // silently masked failed PATCH writes (a paused flow would revert
        // to "running" on refresh because the real table had nothing in it
        // and the fake list is always all-running).
        const rows = Array.isArray(data?.flows) ? data.flows : [];
        const mapped = rows.map((f: any) => {
          const cat = CATEGORIES.find((c) => c.id === f.category) ?? CATEGORIES[0];
          return {
            ...f,
            icon: cat.icon,
            accent: cat.accent,
            assignedAgents: Array.isArray(f.assignedAgents) ? f.assignedAgents : [],
          };
        });
        setFlows(mapped);
      })
      .catch((err) => setLoadError(err.message || "Failed to load automation flows"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
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

  async function toggleStatus(id: string) {
    const previous = flows.find((f) => f.id === id);
    if (!previous) return;
    const nextStatus: Status = previous.status === "running" ? "paused" : "running";

    // Optimistic update, but a real failure below rolls it back and tells
    // the user -- previously a failed PATCH was silently swallowed
    // (.catch(() => {})) while the UI kept showing the toggled state, so a
    // pause that never actually persisted looked successful until refresh
    // silently reverted it.
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, status: nextStatus, lastRun: nextStatus === "running" ? "Just now" : f.lastRun } : f)));

    try {
      const res = await fetch(`/api/automation/flows/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Failed to update flow status");
      }
    } catch (err: any) {
      setFlows((prev) => prev.map((f) => (f.id === id ? previous : f)));
      toast.error(err.message || "Failed to update flow status — reverted");
    }
  }

  async function deleteFlow(id: string) {
    const previous = flows;
    setFlows((prev) => prev.filter((f) => f.id !== id));
    setConfirmDelete(null);

    try {
      const res = await fetch(`/api/automation/flows/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Failed to delete flow");
      }
    } catch (err: any) {
      setFlows(previous);
      toast.error(err.message || "Failed to delete flow — restored");
    }
  }

  async function saveFlow(data: {
    id?: string;
    name: string;
    desc: string;
    category: string;
    cadence: Cadence;
    status: Status;
    assignedAgents: string[];
  }) {
    const cat = CATEGORIES.find((c) => c.id === data.category) ?? CATEGORIES[0];
    const previous = flows;

    if (data.id) {
      setFlows((prev) =>
        prev.map((f) =>
          f.id === data.id
            ? { ...f, name: data.name, desc: data.desc, category: data.category, cadence: data.cadence, status: data.status, accent: cat.accent, assignedAgents: data.assignedAgents }
            : f,
        ),
      );

      try {
        const res = await fetch(`/api/automation/flows/${data.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) throw new Error(json?.error || "Failed to save flow");
      } catch (err: any) {
        setFlows(previous);
        toast.error(err.message || "Failed to save flow — reverted");
        return;
      }
    } else {
      // Honest defaults for a genuinely new flow: it has never run, so
      // successRate is 0 and lastRun says so plainly -- not an invented
      // high percentage implying a track record that doesn't exist yet.
      const newFlow: Flow = {
        id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: data.name,
        desc: data.desc,
        category: data.category,
        cadence: data.cadence,
        status: data.status,
        icon: cat.icon,
        accent: cat.accent,
        lastRun: "Never run",
        successRate: 0,
        assignedAgents: data.assignedAgents,
      };
      setFlows((prev) => [newFlow, ...prev]);

      try {
        const res = await fetch("/api/automation/flows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(newFlow),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) throw new Error(json?.error || "Failed to create flow");
      } catch (err: any) {
        setFlows((prev) => prev.filter((f) => f.id !== newFlow.id));
        toast.error(err.message || "Failed to create flow");
        return;
      }
    }
    setEditor(null);
  }

  return {
    flows,
    loading,
    loadError,
    refetch: load,
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
