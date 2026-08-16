"use client";

/**
 * <AgentWorking> — the live "the agent is doing work" state, shown on every
 * task surface in the dashboard while a Mac-worker / cron job is running.
 *
 * It replaces the dead static EmptyState that used to sit there. Five layers
 * of motion (all CSS keyframes in globals.css; reduced-motion neutralises them):
 *   1. a gold radar emblem (expanding rings + orbiting satellite + breathing core)
 *   2. a pipeline stepper that advances as the real backend status changes
 *      (the page auto-refreshes, so server re-render moves the active step)
 *   3. an indeterminate gold "comet" progress sweep
 *   4. rotating status lines + a live elapsed timer (client-only flourish)
 *   5. a shimmer skeleton preview of the result cards/rows that are coming
 *
 * Pure presentational. Pass `stages` + `currentStage` derived from the row's
 * status server-side; everything else is cosmetic.
 */

import { useEffect, useState } from "react";

export type AgentStage = { key: string; label: string };
export type SkeletonShape = "cards" | "sections" | "rows" | "none";

export function AgentWorking({
  title,
  detail,
  note,
  stages,
  currentStage,
  messages,
  skeleton = "none",
  skeletonCount = 6,
  startedAt,
  bare = false,
}: {
  title: string;
  detail?: string;
  /** Footnote, e.g. the "Mac worker · no API cost" line. */
  note?: React.ReactNode;
  stages?: AgentStage[];
  currentStage?: string;
  /** Rotating status lines cycled every ~2.8s. Falls back to `detail`. */
  messages?: string[];
  skeleton?: SkeletonShape;
  skeletonCount?: number;
  startedAt?: Date | string | number;
  /** When true, drops the outer card chrome so it can sit inside an existing card. */
  bare?: boolean;
}) {
  const activeIndex = stages && currentStage ? stages.findIndex((s) => s.key === currentStage) : -1;

  // Compute deterministic percentage from stage position.
  // Each stage owns an equal slice. Within the active stage we nudge
  // 10% in so the bar visibly moves the moment a stage starts.
  const pct = (() => {
    if (!stages || stages.length === 0) return null;
    const total = stages.length;
    if (activeIndex < 0) return 2; // queued / unknown — show a sliver
    const sliceSize = 100 / total;
    const base = activeIndex * sliceSize;
    // 10% nudge into the active slice so it reads as "in progress"
    return Math.round(base + sliceSize * 0.1);
  })();

  return (
    <div className="space-y-5">
      <div
        className={
          bare
            ? "relative px-1 py-5"
            : "relative overflow-hidden rounded-xl border border-border bg-surface px-6 py-10"
        }
      >
        {/* faint top hairline like the rest of the Obsidian cards */}
        {bare ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
          />
        )}

        <div className="flex flex-col items-center text-center">
          <RadarEmblem />

          <p className="mt-5 text-base font-medium text-text">{title}</p>
          <RotatingLine fallback={detail} messages={messages} />

          {stages && stages.length > 0 ? (
            <Stepper stages={stages} activeIndex={activeIndex} />
          ) : null}

          {/* Real percentage progress bar */}
          {pct !== null ? (
            <ProgressBar pct={pct} startedAt={startedAt} stages={stages} activeIndex={activeIndex} />
          ) : (
            /* fallback indeterminate sweep when no stages supplied */
            <div className="relative mt-6 h-[3px] w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
              <span className="gyl-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
            </div>
          )}

          {(note || startedAt) ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-text-faint">
              <span className="live-dot" aria-hidden />
              {note ? <span>{note}</span> : null}
              {startedAt ? (
                <>
                  {note ? <span aria-hidden>·</span> : null}
                  <Elapsed startedAt={startedAt} />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {skeleton !== "none" ? <SkeletonPreview shape={skeleton} count={skeletonCount} /> : null}
    </div>
  );
}

/* ───────────────────────── radar emblem ───────────────────────── */

function RadarEmblem() {
  return (
    <div className="relative h-16 w-16" aria-hidden>
      {/* expanding rings, staggered */}
      <span className="gyl-radar-ring" style={{ animationDelay: "0s" }} />
      <span className="gyl-radar-ring" style={{ animationDelay: "0.8s" }} />
      <span className="gyl-radar-ring" style={{ animationDelay: "1.6s" }} />
      {/* orbiting satellite */}
      <span className="gyl-orbit absolute inset-0">
        <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
      </span>
      {/* breathing core */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="gyl-breathe flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/40">
          <svg width="15" height="15" viewBox="0 0 36 36" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 24h6l4-10 6 14 4-12h6" />
          </svg>
        </span>
      </span>
    </div>
  );
}

/* ───────────────────────── real percentage progress bar ───────────────────────── */

// Stage-based estimated durations in seconds (tuned to observed job timings).
const STAGE_DURATIONS: Record<string, number> = {
  find: 300,      // research:design_sites — ~5 min
  capture: 360,   // research:capture_sections — ~6 min
  rank: 60,       // classify + assemble — ~1 min
};

function ProgressBar({
  pct,
  startedAt,
  stages,
  activeIndex,
}: {
  pct: number;
  startedAt?: Date | string | number;
  stages?: AgentStage[];
  activeIndex: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const t = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  // Estimate remaining: sum of remaining stage budgets minus elapsed in current stage.
  const eta = (() => {
    if (!stages || stages.length === 0 || activeIndex < 0) return null;
    const total = stages.length;
    const sliceSize = 100 / total;
    const elapsedInStage = elapsed - activeIndex * (elapsed / Math.max(activeIndex, 1));
    let remaining = 0;
    for (let i = activeIndex; i < stages.length; i++) {
      const budget = STAGE_DURATIONS[stages[i].key] ?? 120;
      if (i === activeIndex) {
        remaining += Math.max(0, budget - elapsedInStage);
      } else {
        remaining += budget;
      }
    }
    if (remaining <= 0) return null;
    const mins = Math.ceil(remaining / 60);
    return mins <= 1 ? "~1 min remaining" : `~${mins} min remaining`;
  })();

  // Smooth the displayed pct: never go backwards, cap at 95% until done.
  const displayPct = Math.min(95, pct);

  return (
    <div className="mt-6 w-full max-w-sm space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-text-faint">
        <span className="tnum font-medium text-accent">{displayPct}% complete</span>
        {eta ? <span>{eta}</span> : null}
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-[1200ms] ease-out"
          style={{ width: `${displayPct}%` }}
        />
        {/* subtle shimmer on the leading edge */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-full bg-white/25"
          style={{ left: `${Math.max(0, displayPct - 6)}%`, width: "6%" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-faint/60">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/* ───────────────────────── pipeline stepper ───────────────────────── */

function Stepper({ stages, activeIndex }: { stages: AgentStage[]; activeIndex: number }) {
  return (
    <ol className="mt-6 flex w-full max-w-xl items-center justify-center gap-1.5">
      {stages.map((stage, i) => {
        const done = activeIndex > -1 && i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={stage.key} className="flex min-w-0 items-center gap-1.5">
            <span
              className={[
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                done
                  ? "border-accent bg-accent text-brand-navy-deep"
                  : active
                    ? "gyl-step-active border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface-2 text-text-faint",
              ].join(" ")}
            >
              {done ? (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 6 2.2 2.2L9.5 3.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={[
                "truncate text-xs",
                active ? "font-medium text-text" : done ? "text-text-muted" : "text-text-faint",
              ].join(" ")}
            >
              {stage.label}
            </span>
            {i < stages.length - 1 ? (
              <span aria-hidden className={`mx-1 h-px w-5 ${done ? "bg-accent/50" : "bg-border"}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── rotating status line ───────────────────────── */

function RotatingLine({ messages, fallback }: { messages?: string[]; fallback?: string }) {
  const list = messages && messages.length > 0 ? messages : fallback ? [fallback] : [];
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (list.length <= 1) return;
    const fade = setInterval(() => {
      setShow(false);
      const t = setTimeout(() => {
        setI((p) => (p + 1) % list.length);
        setShow(true);
      }, 320);
      return () => clearTimeout(t);
    }, 2800);
    return () => clearInterval(fade);
  }, [list.length]);

  if (list.length === 0) return null;
  return (
    <p
      className="mt-1.5 min-h-[2.6em] max-w-md text-xs leading-relaxed text-text-muted transition-opacity duration-300"
      style={{ opacity: show ? 1 : 0 }}
    >
      {list[i]}
    </p>
  );
}

/* ───────────────────────── elapsed timer ───────────────────────── */

function Elapsed({ startedAt }: { startedAt: Date | string | number }) {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null || !Number.isFinite(start)) return null;
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="tnum">
      {mm}:{ss} elapsed
    </span>
  );
}

/* ───────────────────────── shimmer skeleton preview ───────────────────────── */

function SkeletonPreview({ shape, count }: { shape: SkeletonShape; count: number }) {
  if (shape === "rows") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <span className="gyl-shimmer h-8 w-8 shrink-0 rounded-md" />
            <span className="gyl-shimmer h-3 w-2/5 rounded" />
            <span className="gyl-shimmer ml-auto h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (shape === "sections") {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="gyl-shimmer h-4 w-16 rounded-full" />
              <span className="gyl-shimmer h-3 w-24 rounded" />
            </div>
            <span className="gyl-shimmer block h-40 w-full" />
          </div>
        ))}
      </div>
    );
  }

  // cards (default)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
          <span className="gyl-shimmer block aspect-[4/3] w-full" />
          <div className="space-y-2.5 p-4">
            <span className="gyl-shimmer block h-3.5 w-3/5 rounded" />
            <span className="gyl-shimmer block h-3 w-full rounded" />
            <span className="gyl-shimmer block h-3 w-4/5 rounded" />
            <div className="flex gap-1.5 pt-1">
              {Array.from({ length: 5 }).map((_, j) => (
                <span key={j} className="gyl-shimmer h-4 w-4 rounded-sm" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
