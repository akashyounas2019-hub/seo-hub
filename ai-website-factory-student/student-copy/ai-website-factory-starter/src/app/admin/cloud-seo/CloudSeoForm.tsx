"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  queueCloudSeoJob,
  getCloudSeoJob,
  type CloudSeoAnalysisType,
  type CloudSeoJobResult,
} from "@/app/actions/cloud-seo";

interface Props {
  analysisType: CloudSeoAnalysisType;
  title: string;
  description: string;
  placeholder?: string;
}

type Phase = "idle" | "queuing" | "polling" | "done" | "error";

export function CloudSeoForm({ analysisType, title, description, placeholder = "https://example.com" }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<CloudSeoJobResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  // `tick` forces a re-render every 500ms so the progress bar animates smoothly
  // through the "running" phase based on elapsed time, not just on status changes.
  const [, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    // Poll aggressively at first (2s) so status transitions feel responsive,
    // then back off to 5s once the worker has claimed the job.
    let pollInterval = 2000;
    const scheduleNext = () => {
      pollRef.current = setTimeout(async () => {
        try {
          const res = await getCloudSeoJob(id);
          if (!res.ok) {
            setErrorMsg(res.error);
            setPhase("error");
            stopTicks();
            return;
          }
          setResult(res);
          if (res.status === "claimed" || res.status === "running") pollInterval = 5000;
          if (res.status === "done" || res.status === "failed" || res.status === "cancelled") {
            setPhase(res.status === "done" ? "done" : "error");
            if (res.status === "failed") setErrorMsg(res.error || "Job failed");
            if (res.status === "cancelled") setErrorMsg("Job was cancelled");
            stopTicks();
            return;
          }
          scheduleNext();
        } catch {
          scheduleNext();
        }
      }, pollInterval) as unknown as ReturnType<typeof setInterval>;
    };
    scheduleNext();
  }

  function stopTicks() {
    if (pollRef.current) clearTimeout(pollRef.current as unknown as ReturnType<typeof setTimeout>);
    pollRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhase("queuing");
    setResult(null);
    setErrorMsg(null);
    setJobId(null);
    startedAtRef.current = Date.now();

    // Kick the tick that drives smooth progress-bar animation. It re-renders
    // this component every 500ms so the bar can advance based on elapsed time
    // even between the 2s/5s polls that fetch fresh status.
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTick((n) => n + 1), 500);

    const formData = new FormData(e.currentTarget);
    formData.set("analysisType", analysisType);

    try {
      const res = await queueCloudSeoJob(formData);
      if (!res.ok) {
        setErrorMsg(res.error);
        setPhase("error");
        stopTicks();
        return;
      }
      setJobId(res.jobId);
      setPhase("polling");
      startPolling(res.jobId);
    } catch {
      setErrorMsg("Failed to queue job. Please try again.");
      setPhase("error");
      stopTicks();
    }
  }

  const isWorking = phase === "queuing" || phase === "polling";
  const statusLabel =
    result?.status === "done"
      ? "Analysis complete"
      : result?.status === "running"
        ? "AKS worker running — Claude is browsing the page and writing the report"
        : result?.status === "claimed"
          ? "AKS worker claimed the job — starting Claude Code…"
          : "Queued — waiting for the AKS worker to pick this up";

  // ── Progress bar % ─────────────────────────────────────────────────────
  //
  // The bar reflects both discrete status transitions and elapsed time:
  //   pending  → 0% → 25% over ~20s (worker poll interval + claim latency)
  //   claimed  → 25% → 40% quickly (worker just took the job)
  //   running  → 40% → 92% asymptotically over ~90s (typical run duration)
  //   done     → 100%
  //   error    → last value, red
  //
  // The elapsed-time contribution prevents the bar from freezing at 40% while
  // waiting for the "done" status, which reads as broken to the user.
  const progressPct = computeProgress(phase, result?.status ?? null, startedAtRef.current);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-text">
            URL to analyze
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder={placeholder}
            className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowContext(!showContext)}
            className="text-xs text-text-muted hover:text-text"
          >
            {showContext ? "− Hide" : "+ Add"} extra context
          </button>
          {showContext ? (
            <textarea
              name="extraContext"
              rows={3}
              placeholder="Target keywords, business type, competitors, specific concerns..."
              className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isWorking}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isWorking ? "Processing..." : `Run ${title}`}
        </button>
      </form>

      {/* Working state */}
      {isWorking ? (
        <div className="rounded-xl border border-border bg-surface-2 p-6">
          <div className="flex items-start gap-3">
            <span className="live-dot mt-1.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{statusLabel}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Running on your Claude Code subscription — no API cost.
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
              {Math.round(progressPct)}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div
              className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-valuenow={Math.round(progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
              {/* Shimmer stripe — only while not yet at 100% */}
              {progressPct < 100 ? (
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-full opacity-40 mix-blend-plus-lighter"
                  style={{
                    width: `${progressPct}%`,
                    background:
                      "linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "csf-shimmer 1.4s linear infinite",
                  }}
                />
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-text-faint">
              <span>
                {startedAtRef.current
                  ? `${Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))}s elapsed`
                  : ""}
              </span>
              <span>
                {phaseCaption(result?.status ?? null)}
              </span>
            </div>
          </div>
          <style>{`@keyframes csf-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
      ) : null}

      {/* Results */}
      {phase === "done" && result?.markdown ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success-tint/30 px-4 py-2.5">
            <span className="text-sm font-medium text-text">Analysis complete</span>
            {result.durationMs ? (
              <span className="text-xs text-text-muted">
                {(result.durationMs / 1000).toFixed(0)}s · Cloud subscription (no API cost)
              </span>
            ) : (
              <span className="text-xs text-text-muted">Cloud subscription (no API cost)</span>
            )}
          </div>
          <article className="rounded-xl border border-border bg-surface p-6">
            <MarkdownRenderer markdown={result.markdown} />
          </article>
        </div>
      ) : null}

      {/* Error */}
      {phase === "error" && errorMsg ? (
        <div className="rounded-lg border border-danger/30 bg-danger-tint px-4 py-3">
          <p className="text-sm font-medium text-danger">{errorMsg}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Turn the current phase + elapsed time into a smooth 0-100 progress value.
 * Elapsed-time-driven asymptote during "running" prevents the bar from
 * freezing while the job is still executing but between poll cycles.
 */
function computeProgress(
  phase: Phase,
  status: string | null,
  startedAt: number | null,
): number {
  if (phase === "done" || status === "done") return 100;
  if (phase === "error") return 100; // caller styles it red separately
  if (!startedAt) return 0;
  const elapsedSec = (Date.now() - startedAt) / 1000;

  if (status === "running") {
    // Reach ~92% around 90s of runtime; asymptote at 95%.
    // Formula: 40 + (95 - 40) * (1 - e^(-t/45))
    const target = 40 + 55 * (1 - Math.exp(-elapsedSec / 45));
    return Math.min(95, target);
  }
  if (status === "claimed") {
    // Ramp 25 → 40 over ~4 seconds after claim.
    return Math.min(40, 25 + elapsedSec * 3.75);
  }
  // pending (or no status yet — just queued)
  // Move 0 → 22 linearly over the first 20s (worker poll interval).
  return Math.min(22, elapsedSec * 1.1);
}

function phaseCaption(status: string | null): string {
  switch (status) {
    case "done":
      return "Analysis ready";
    case "running":
      return "Writing report";
    case "claimed":
      return "Starting Claude Code";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Waiting for worker";
  }
}

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const html = markdownToHtml(markdown);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownToHtml(md: string): string {
  let html = md;

  html = html.replace(/^### (.+)$/gm, '<h3 class="mt-6 mb-2 text-base font-semibold text-text">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mt-8 mb-3 text-lg font-semibold text-text">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mt-8 mb-3 text-xl font-semibold text-text">$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-text">$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, (_m, code: string) => `<code class="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-mono text-text">${escapeHtml(code)}</code>`);

  html = html.replace(/^---$/gm, '<hr class="my-6 border-border" />');

  const lines = html.split("\n");
  const output: string[] = [];
  let inTable = false;
  let tableRowIdx = 0;
  let inList = false;
  let listType: "ul" | "ol" = "ul";
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        output.push("</code></pre>");
        inCodeBlock = false;
      } else {
        if (inList) { output.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        if (inTable) { output.push("</tbody></table></div>"); inTable = false; }
        output.push('<pre class="my-4 overflow-x-auto rounded-lg bg-surface-2 p-4"><code class="text-xs font-mono text-text">');
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      output.push(escapeHtml(line));
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) {
        if (inList) { output.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        output.push('<div class="overflow-x-auto my-4"><table class="w-full text-xs border-collapse">');
        inTable = true;
        tableRowIdx = 0;
      }
      if (trimmed.replace(/[|\-\s:]/g, "") === "") continue;
      const cells = trimmed.slice(1, -1).split("|").map(c => c.trim());
      const isHeader = tableRowIdx === 0;
      const tag = isHeader ? "th" : "td";
      const rowClass = isHeader
        ? "bg-surface-2 text-text-faint font-semibold uppercase tracking-wider"
        : "border-t border-border";
      if (isHeader) output.push("<thead>");
      output.push(`<tr class="${rowClass}">${cells.map(c => `<${tag} class="px-3 py-2 text-left">${c}</${tag}>`).join("")}</tr>`);
      if (isHeader) output.push("</thead><tbody>");
      tableRowIdx++;
      continue;
    } else if (inTable) {
      output.push("</tbody></table></div>");
      inTable = false;
      tableRowIdx = 0;
    }

    if (/^[-*] /.test(trimmed)) {
      if (!inList || listType !== "ul") {
        if (inList) output.push("</ol>");
        output.push('<ul class="my-2 ml-4 space-y-1 list-disc">');
        inList = true;
        listType = "ul";
      }
      output.push(`<li class="text-sm text-text-muted">${trimmed.slice(2)}</li>`);
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      if (!inList || listType !== "ol") {
        if (inList) output.push("</ul>");
        output.push('<ol class="my-2 ml-4 space-y-1 list-decimal">');
        inList = true;
        listType = "ol";
      }
      output.push(`<li class="text-sm text-text-muted">${trimmed.replace(/^\d+\.\s*/, "")}</li>`);
      continue;
    }

    if (inList) {
      output.push(listType === "ul" ? "</ul>" : "</ol>");
      inList = false;
    }

    if (trimmed === "") {
      output.push("");
      continue;
    }

    if (!trimmed.startsWith("<")) {
      output.push(`<p class="my-2 text-sm leading-relaxed text-text-muted">${trimmed}</p>`);
    } else {
      output.push(trimmed);
    }
  }

  if (inCodeBlock) output.push("</code></pre>");
  if (inList) output.push(listType === "ul" ? "</ul>" : "</ol>");
  if (inTable) output.push("</tbody></table></div>");

  return output.join("\n");
}
