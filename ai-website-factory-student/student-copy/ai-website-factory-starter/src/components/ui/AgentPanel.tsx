"use client";

import { useRef, useState, useTransition } from "react";
import { Slideover } from "./Slideover";

type CapMode = "auto" | "propose" | "off";

interface Capability {
  key: string;
  label: string;
  description: string;
  mode: CapMode;
  locked?: boolean;
}

interface Activity {
  id: string;
  kind: string;
  summary: string;
  at: string;       // ISO date string from server
  success?: boolean;
}

export function AgentPanel({
  siteId,
  siteSlug,
  siteName,
  capabilities,
  costThisMonth,
  recentActivity,
}: {
  siteId: string;
  siteSlug: string;
  siteName: string;
  capabilities: Capability[];
  costThisMonth: string;     // pre-formatted from formatMicroUsd()
  recentActivity: Activity[];
}) {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const [saving, startTransition] = useTransition();
  const [queuedKinds, setQueuedKinds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setMode = (key: string, mode: CapMode) => {
    setCaps((prev) => prev.map((c) => (c.key === key ? { ...c, mode } : c)));
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/agent-policy`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, mode }),
        });
        if (!res.ok) setError("Could not save — try again.");
      } catch {
        setError("Network error — try again.");
      }
    });
  };

  const runNow = async (kind: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/agent-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        setError("Could not queue scan.");
        return;
      }
      setQueuedKinds((prev) => Array.from(new Set([...prev, kind])));
    } catch {
      setError("Network error.");
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted hover:border-accent hover:text-text"
        aria-haspopup="dialog"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l2.4 5 5.6.8-4 4 1 5.7L12 14.8 6.9 17.5l1-5.7-4-4 5.6-.8z" fill="currentColor" />
        </svg>
        Agent panel
      </button>

      <Slideover
        open={open}
        onClose={() => setOpen(false)}
        title={`Agent · ${siteName}`}
        subtitle={`Per-site settings, recent activity, manual triggers.`}
        returnFocusRef={triggerRef}
        width={520}
      >
        <div className="space-y-5">
          {error ? (
            <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          {/* Cost summary */}
          <section className="rounded-md border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-[0.06em] text-text-faint">Spend this month</div>
            <div className="mt-1 font-serif text-xl tabular-nums text-text">{costThisMonth}</div>
            <p className="mt-0.5 text-xs text-text-muted">
              Across every audit kind. BYOK — charged to the Anthropic key you set in Settings.
            </p>
          </section>

          {/* Capabilities */}
          <section>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-text">Capabilities</h3>
              {saving ? <span className="text-xs text-text-faint">Saving…</span> : null}
            </div>
            <ul className="mt-2 space-y-2">
              {caps.map((cap) => (
                <li
                  key={cap.key}
                  className="rounded-md border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-text">{cap.label}</div>
                      <p className="mt-0.5 text-xs text-text-muted">{cap.description}</p>
                    </div>
                    <select
                      disabled={cap.locked || saving}
                      value={cap.mode}
                      onChange={(e) => setMode(cap.key, e.target.value as CapMode)}
                      className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="auto">auto</option>
                      <option value="propose">propose</option>
                      <option value="off">off</option>
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    {cap.locked ? (
                      <span className="text-text-faint">Locked — visual changes always require review.</span>
                    ) : (
                      <span className="text-text-faint">{cap.mode === "auto" ? "Applies silently" : cap.mode === "propose" ? "Waits for approval" : "Skipped"}</span>
                    )}
                    {!cap.locked ? (
                      <button
                        type="button"
                        onClick={() => runNow(cap.key)}
                        disabled={queuedKinds.includes(cap.key)}
                        className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-text-muted hover:border-accent hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {queuedKinds.includes(cap.key) ? "Queued ✓" : "Run now"}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Recent activity */}
          <section>
            <h3 className="text-sm font-medium text-text">Recent activity</h3>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
              {recentActivity.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-text-faint">No recent activity.</li>
              ) : (
                recentActivity.map((a) => (
                  <li key={a.id} className="px-3 py-2 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={a.success === false ? "text-danger" : "text-text"}>{a.kind.replace(/_/g, " ")}</span>
                      <span className="text-text-faint">{new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-muted">{a.summary}</p>
                  </li>
                ))
              )}
            </ul>
            <a href={`/admin/seo?site=${siteSlug}`} className="mt-2 inline-block text-xs text-accent hover:underline">
              Open full SEO inbox →
            </a>
          </section>
        </div>
      </Slideover>
    </>
  );
}
