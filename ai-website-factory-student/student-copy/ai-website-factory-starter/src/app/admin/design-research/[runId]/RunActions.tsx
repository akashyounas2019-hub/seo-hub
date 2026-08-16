"use client";

/**
 * Run-level actions for a design-research run, shown in the page header:
 *   • Re-capture screenshots — re-runs Playwright against the sites already found
 *     (applies the latest section detector; idempotent).
 *   • Re-run research — starts a FRESH run for the same market + niches and
 *     navigates to it.
 *
 * Both queue Mac-worker jobs (Claude Code subscription, no API cost). No more
 * needing a terminal to re-trigger.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  rerunCaptureAction,
  rerunResearchAction,
  queueClassifySectionsAction,
  getClassifySectionsResultAction,
} from "@/app/actions/design-research";

export function RunActions({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<null | "capture" | "research">(null);
  const [relabeling, setRelabeling] = useState(false);
  const [relabelNote, setRelabelNote] = useState<string | null>(null);

  // Queue the zero-API Mac-worker classify job, then poll until it applies.
  async function onRelabel() {
    setRelabeling(true);
    setRelabelNote("Queued — AI is re-labeling on the Mac worker…");
    const q = await queueClassifySectionsAction(runId);
    if (!q.ok) {
      setRelabeling(false);
      setRelabelNote(`Couldn't start: ${q.error}`);
      return;
    }
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await getClassifySectionsResultAction(q.jobId);
      if (!res.ok) {
        setRelabeling(false);
        setRelabelNote(`Error: ${res.error}`);
        return;
      }
      if (res.status === "done") {
        setRelabeling(false);
        setRelabelNote(`Re-labeled ${res.updated} sections with AI.`);
        router.refresh();
        return;
      }
      if (res.status === "error" || res.status === "failed") {
        setRelabeling(false);
        setRelabelNote("Re-label job failed — check the Mac worker is running.");
        return;
      }
    }
    setRelabeling(false);
    setRelabelNote("Still running — refresh in a moment to see updated labels.");
  }

  const btn =
    "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          title="Re-screenshot the sites already found (applies the latest section detector)"
          onClick={() =>
            start(async () => {
              setBusy("capture");
              try {
                await rerunCaptureAction(runId);
                router.refresh();
              } finally {
                setBusy(null);
              }
            })
          }
          className={btn}
        >
          <span aria-hidden>↻</span>
          {busy === "capture" ? "Re-capturing…" : "Re-capture screenshots"}
        </button>
        <button
          type="button"
          disabled={relabeling}
          title="Re-label every section's type with AI (reads each section's heading + text; no API cost)"
          onClick={onRelabel}
          className={btn}
        >
          <span aria-hidden>✨</span>
          {relabeling ? "Re-labeling…" : "AI re-label sections"}
        </button>
        <button
          type="button"
          disabled={pending}
          title="Find a fresh set of reference sites for the same market + niche"
          onClick={() =>
            start(async () => {
              setBusy("research");
              const r = await rerunResearchAction(runId);
              router.push(`/admin/design-research/${r.runId}`);
            })
          }
          className={btn}
        >
          <span aria-hidden>↻</span>
          {busy === "research" ? "Starting…" : "Re-run research"}
        </button>
      </div>
      {relabelNote ? (
        <p className="text-xs text-text-faint">
          {relabeling ? <span className="live-dot mr-1" /> : null}
          {relabelNote}
        </p>
      ) : null}
    </div>
  );
}
