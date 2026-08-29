import { useEffect, useRef, useState } from "react";
import { EXPERTS } from "@/lib/agents";

export type CustomAgent = { id: string; name: string; iconId: string; accent: string; role: string };

export function useDashboard() {
  const [open, setOpen] = useState<string | null>("onpage");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  // Real count of agents with a claude_jobs row actually "claimed" or
  // "running" right now (api.agents.activity.ts) -- previously
  // Math.round(totalAgents * 0.72), a formula invented with no relation to
  // any real job/task state.
  const [working, setWorking] = useState(0);

  useEffect(() => {
    if (!open) return;
    const el = cardRefs.current[open];
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const load = () => {
      fetch("/api/agents/activity")
        .then((res) => res.json())
        .then((json) => {
          if (json?.ok) setWorking(json.activeAgentCount || 0);
        })
        .catch(() => {
          /* keep last known value on a transient fetch failure */
        });
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // EXPERTS now includes the Team Leader as a real entry (id "leader"),
  // so it's already counted once by EXPERTS.length -- no separate +1.
  const totalSubs = EXPERTS.reduce((a, e) => a + e.subs.length, 0);
  const totalAgents = EXPERTS.length + totalSubs + customAgents.length;
  const offline = Math.max(totalAgents - working, 0);

  return {
    open,
    setOpen,
    cardRefs,
    showAdd,
    setShowAdd,
    showAssign,
    setShowAssign,
    showNewJob,
    setShowNewJob,
    customAgents,
    setCustomAgents,
    totalAgents,
    working,
    offline,
  };
}
