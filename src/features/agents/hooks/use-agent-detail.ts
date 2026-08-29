import { useEffect, useMemo, useState } from "react";
import {
  EXPERTS,
  getDefaultProfile,
  loadProfiles,
  parseAgentId,
  saveProfiles,
  slugify,
  type AgentProfile,
  type AgentSettings,
  type LogEntry,
  type MemoryNote,
  type Sub,
  type Task,
} from "@/lib/agents";

export function useAgentDetail(id: string) {
  const { parentId, subSlug } = useMemo(() => parseAgentId(id), [id]);
  const expert = useMemo(() => EXPERTS.find((e) => e.id === parentId)!, [parentId]);
  const isSub = !!subSlug;

  const [profile, setProfile] = useState<AgentProfile>(() => getDefaultProfile(id));
  const [parentProfile, setParentProfile] = useState<AgentProfile>(() => getDefaultProfile(parentId));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const all = loadProfiles();
    setProfile({ ...getDefaultProfile(id), ...(all[id] ?? {}) });
    setParentProfile({ ...getDefaultProfile(parentId), ...(all[parentId] ?? {}) });
    setHydrated(true);
  }, [id, parentId]);

  useEffect(() => {
    if (!hydrated) return;
    const all = loadProfiles();
    const next: Record<string, AgentProfile> = { ...all, [id]: profile };
    if (id !== parentId) next[parentId] = parentProfile;
    saveProfiles(next);
  }, [profile, parentProfile, id, parentId, hydrated]);

  const resolved = useMemo(() => {
    const subs = [...expert.subs, ...(parentProfile.extraSubs ?? [])];
    if (isSub) {
      const sub = subs.find((s) => slugify(s.name) === subSlug);
      return { subs, sub };
    }
    return { subs, sub: undefined as Sub | undefined };
  }, [expert, parentProfile.extraSubs, isSub, subSlug]);

  const displayTitle = isSub ? resolved.sub?.name ?? "Sub-agent" : expert.title;
  const displayTag = isSub ? resolved.sub?.desc ?? "Sub-agent" : expert.tag;

  const assigneeOptions = isSub ? [displayTitle] : resolved.subs.map((s) => s.name);

  const [taskTitle, setTaskTitle] = useState("");
  const [assignee, setAssignee] = useState(assigneeOptions[0] ?? "");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");

  useEffect(() => {
    setAssignee(assigneeOptions[0] ?? "");
  }, [id, assigneeOptions]);

  const appendLog = (kind: LogEntry["kind"], message: string) => {
    setProfile((p) => ({
      ...p,
      logs: [
        { id: crypto.randomUUID(), ts: new Date().toISOString(), kind, message },
        ...(p.logs ?? []),
      ].slice(0, 200),
    }));
  };

  // Real task creation: POSTs a genuine kanban_tasks row (the same real
  // Kanban board /agent-dashboard reads) rather than only a local-storage
  // entry -- previously "Schedule task" here looked identical to real task
  // assignment but never left the browser. The local `tasks` list below is
  // still kept as this agent profile's own activity view of what it has
  // been assigned, now mirroring what's genuinely in Postgres instead of
  // being the only copy that ever existed.
  const submitTask = async () => {
    if (!taskTitle.trim()) return;
    const title = taskTitle.trim();
    const taskAssignee = assignee || assigneeOptions[0] || "Unassigned";
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      assignee: taskAssignee,
      due: due || new Date().toISOString().slice(0, 16),
      status: "pending",
      priority,
    };
    setProfile((p) => ({ ...p, tasks: [task, ...p.tasks] }));
    setTaskTitle("");
    setDue("");

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          assignee: taskAssignee,
          priority,
          status: "todo",
        }),
      });
      const json = await res.json();
      if (json?.success) {
        appendLog("assignment", `Scheduled "${title}" → ${taskAssignee} (${priority ?? "medium"}) — added to the real Kanban board`);
      } else {
        appendLog("system", `"${title}" saved here, but failed to reach the Kanban board: ${json?.error || "unknown error"}`);
      }
    } catch (err: any) {
      appendLog("system", `"${title}" saved here, but failed to reach the Kanban board: ${err.message || "network error"}`);
    }
  };

  const toggleTask = (tid: string) => {
    let nextStatus: Task["status"] = "done";
    let title = "";
    setProfile((p) => ({
      ...p,
      tasks: p.tasks.map((t) => {
        if (t.id === tid) {
          nextStatus = t.status === "done" ? "pending" : "done";
          title = t.title;
          return { ...t, status: nextStatus };
        }
        return t;
      }),
    }));
    if (title) appendLog("task", `${nextStatus === "done" ? "Completed" : "Reopened"} "${title}"`);
  };

  const removeTask = (tid: string) => {
    const t = profile.tasks.find((x) => x.id === tid);
    setProfile((p) => ({ ...p, tasks: p.tasks.filter((tt) => tt.id !== tid) }));
    if (t) appendLog("task", `Removed "${t.title}"`);
  };

  const updateSettings = (patch: Partial<AgentSettings>) => {
    setProfile((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    appendLog("system", `Settings updated · ${Object.keys(patch).join(", ")}`);
  };

  const [newSubName, setNewSubName] = useState("");
  const [newSubDesc, setNewSubDesc] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);

  const addSubAgent = () => {
    const name = newSubName.trim();
    if (!name) return;
    const desc = newSubDesc.trim() || "Custom sub-agent";
    const existing = [...expert.subs, ...(parentProfile.extraSubs ?? [])];
    if (existing.some((s) => slugify(s.name) === slugify(name))) return;
    setParentProfile((p) => ({
      ...p,
      extraSubs: [...(p.extraSubs ?? []), { name, desc }],
    }));
    setNewSubName("");
    setNewSubDesc("");
    setShowAddSub(false);
  };

  const removeExtraSub = (name: string) => {
    setParentProfile((p) => ({
      ...p,
      extraSubs: (p.extraSubs ?? []).filter((s) => s.name !== name),
    }));
  };

  const [memoryText, setMemoryText] = useState("");
  const [memoryTag, setMemoryTag] = useState<MemoryNote["tag"]>("guideline");

  const addMemoryNote = () => {
    if (!memoryText.trim()) return;
    const note: MemoryNote = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      text: memoryText.trim(),
      tag: memoryTag,
      pinned: false,
    };
    setProfile((p) => ({
      ...p,
      memories: [note, ...(p.memories ?? [])],
    }));
    appendLog("system", `Memory note added [${memoryTag}]`);
    setMemoryText("");
  };

  const togglePinMemory = (mid: string) => {
    setProfile((p) => ({
      ...p,
      memories: (p.memories ?? []).map((m) => (m.id === mid ? { ...m, pinned: !m.pinned } : m)),
    }));
  };

  const deleteMemoryNote = (mid: string) => {
    setProfile((p) => ({
      ...p,
      memories: (p.memories ?? []).filter((m) => m.id !== mid),
    }));
  };

  const clearLogs = () => {
    setProfile((p) => ({ ...p, logs: [] }));
  };

  const pending = profile.tasks.filter((t) => t.status === "pending");
  const done = profile.tasks.filter((t) => t.status === "done");
  const Icon = expert.icon;
  const isExtra = (name: string) => !expert.subs.some((s) => s.name === name);

  return {
    id,
    parentId,
    subSlug,
    expert,
    isSub,
    profile,
    setProfile,
    parentProfile,
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
  };
}
