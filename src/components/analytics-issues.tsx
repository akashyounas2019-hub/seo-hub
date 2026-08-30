import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Gauge,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  Monitor,
  Zap,
  Search as SearchIcon,
  Eye,
  ShieldCheck,
} from "lucide-react";
import { type ConnectedSite } from "@/lib/site-context";

type PageSpeedIssue = {
  id: string;
  title: string;
  description: string;
  category: "performance" | "seo" | "accessibility" | "best-practices";
  severity: "critical" | "warning";
  score: number | null;
  displayValue?: string;
};

type TechnicalIssue = {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning";
};

type IssuesData = {
  scores: {
    performanceScore: number | null;
    seoScore: number | null;
    accessibilityScore: number | null;
    bestPracticesScore: number | null;
    lcpMs: number | null;
    clsScore: number | null;
    inpMs: number | null;
    fcpMs: number | null;
    ttfbMs: number | null;
  } | null;
  pageSpeedIssues: PageSpeedIssue[];
  pageSpeedError: string | null;
  technicalIssues: TechnicalIssue[];
  checkedUrl: string | null;
  checkedAt: string | null;
  cached?: boolean;
  source?: "manual" | "daily-auto";
};

const CATEGORY_ICON: Record<string, typeof Gauge> = {
  performance: Zap,
  seo: SearchIcon,
  accessibility: Eye,
  "best-practices": ShieldCheck,
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-slate-400";
  if (score >= 90) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

function scoreRing(score: number | null): string {
  if (score === null) return "border-slate-700";
  if (score >= 90) return "border-emerald-400/40";
  if (score >= 50) return "border-amber-400/40";
  return "border-rose-400/40";
}

/**
 * Real Google PageSpeed Insights scores + a real list of failing audits
 * (src/lib/google/pagespeed.ts), plus real robots.txt/sitemap/HTTPS checks
 * -- api.sites.$id.issues.ts. Nothing here is a placeholder: an issue only
 * appears if the underlying check actually failed.
 */
export function IssuesDrilldown({ site }: { site?: ConnectedSite }) {
  const [data, setData] = useState<IssuesData | null>(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const [checking, setChecking] = useState(false);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");

  // Loads whatever is already cached -- near-instant, runs on mount and on
  // strategy switch so the tab never blocks on a live PageSpeed run just to
  // show the last real result.
  const loadCached = async () => {
    if (!site?.id) return;
    setLoadingCache(true);
    try {
      const res = await fetch(`/api/sites/${site.id}/issues?strategy=${strategy}`);
      const json = await res.json();
      if (json?.ok) {
        setData(json);
      } else {
        toast.error(json?.error || "Failed to load cached issues");
      }
    } catch {
      toast.error("Failed to load cached issues");
    } finally {
      setLoadingCache(false);
    }
  };

  // Actually triggers a fresh PSI + technical check ("Re-check"). This can
  // legitimately take up to ~90s for a real Lighthouse run -- the cached
  // result above stays on screen the whole time instead of clearing.
  const runCheck = async () => {
    if (!site?.id || checking) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/sites/${site.id}/issues?strategy=${strategy}`, { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        setData(json);
        toast.success("Diagnostics updated");
      } else {
        toast.error(json?.error || "Failed to run diagnostics");
      }
    } catch {
      toast.error("Failed to run diagnostics — the check may still be running server-side; try reloading in a moment.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, strategy]);

  const allIssues = data ? [...data.technicalIssues, ...data.pageSpeedIssues] : [];
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Issues</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Real Google PageSpeed Insights scores + failing audits, plus robots.txt/sitemap/HTTPS checks.
            {data?.checkedAt &&
              ` Last checked ${new Date(data.checkedAt).toLocaleString()}${data.source === "daily-auto" ? " (daily automated check)" : ""}.`}
            {checking && " Running a fresh check in the background — this can take up to a minute; the numbers above are still the last real result."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-0.5">
            <button
              onClick={() => setStrategy("mobile")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                strategy === "mobile" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
            <button
              onClick={() => setStrategy("desktop")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                strategy === "desktop" ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
          </div>
          <button
            onClick={runCheck}
            disabled={checking}
            title="Runs a fresh live PageSpeed Insights check — can take up to a minute"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Re-check"}
          </button>
        </div>
      </div>

      {/* Score cards */}
      {data?.scores ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Performance", value: data.scores.performanceScore },
            { label: "SEO", value: data.scores.seoScore },
            { label: "Accessibility", value: data.scores.accessibilityScore },
            { label: "Best Practices", value: data.scores.bestPracticesScore },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border bg-slate-950/60 p-4 ${scoreRing(s.value)}`}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className={`mt-1 text-3xl font-bold tabular-nums ${scoreColor(s.value)}`}>
                {s.value ?? "—"}
              </div>
            </div>
          ))}
        </div>
      ) : data?.pageSpeedError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 text-xs text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>PageSpeed Insights unavailable: {data.pageSpeedError}</div>
        </div>
      ) : null}

      {/* Core Web Vitals */}
      {data?.scores && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "LCP", value: data.scores.lcpMs, unit: "ms" },
            { label: "CLS", value: data.scores.clsScore, unit: "" },
            { label: "INP", value: data.scores.inpMs, unit: "ms" },
            { label: "FCP", value: data.scores.fcpMs, unit: "ms" },
            { label: "TTFB", value: data.scores.ttfbMs, unit: "ms" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-200 tabular-nums">
                {m.value !== null ? `${typeof m.value === "number" && m.unit === "" ? m.value.toFixed(3) : m.value}${m.unit}` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issue counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
          <div className="text-[11px] uppercase tracking-wider text-rose-300/80">Critical</div>
          <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{criticalCount}</div>
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <div className="text-[11px] uppercase tracking-wider text-amber-300/80">Warning</div>
          <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{warningCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Total Issues</div>
          <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{allIssues.length}</div>
        </div>
      </div>

      {/* Issue list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="border-b border-slate-800/70 px-5 py-3">
          <h3 className="text-sm font-semibold text-white">Active Issues</h3>
        </div>
        {loadingCache && !data ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading the last real diagnostics result…</div>
        ) : allIssues.length === 0 && !data?.checkedAt ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No diagnostics have run for this site yet — click "Re-check" to run the first one.
          </div>
        ) : allIssues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <div className="text-sm text-slate-300">No active issues found.</div>
            <div className="text-[11px] text-slate-500">robots.txt, sitemap.xml, HTTPS, and PageSpeed audits all passed.</div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {data?.technicalIssues.map((issue) => (
              <li key={issue.id} className="flex items-start gap-3 px-5 py-3.5">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "critical" ? "text-rose-400" : "text-amber-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{issue.title}</span>
                    <span className="rounded-full border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                      Technical
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{issue.description}</p>
                </div>
              </li>
            ))}
            {data?.pageSpeedIssues.map((issue) => {
              const CatIcon = CATEGORY_ICON[issue.category] || Gauge;
              return (
                <li key={issue.id} className="flex items-start gap-3 px-5 py-3.5">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "critical" ? "text-rose-400" : "text-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{issue.title}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan-200">
                        <CatIcon className="h-2.5 w-2.5" /> {issue.category}
                      </span>
                      {issue.displayValue && (
                        <span className="rounded-full border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                          {issue.displayValue}
                        </span>
                      )}
                    </div>
                    {issue.description && <p className="mt-0.5 text-xs text-slate-400">{issue.description}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
