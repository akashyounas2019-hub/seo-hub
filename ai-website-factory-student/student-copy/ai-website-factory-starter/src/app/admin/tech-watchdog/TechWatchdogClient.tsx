"use client";

import { useState, useTransition } from "react";
import { analyzePageSpeed } from "@/app/actions/pagespeed";
import type { PageSpeedResult } from "@/lib/pagespeed";

// ---------- style helpers ----------

function scoreColor(score: number): string {
  if (score >= 90) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

function ratingFromCwv(key: string, value: string): string {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return "N/A";
  switch (key) {
    case "lcp": return num <= 2.5 ? "Good" : num <= 4.0 ? "Needs work" : "Poor";
    case "cls": return num <= 0.1 ? "Good" : num <= 0.25 ? "Needs work" : "Poor";
    case "fcp": return num <= 1.8 ? "Good" : num <= 3.0 ? "Needs work" : "Poor";
    case "tbt": {
      // TBT displayValue can be "450 ms" or "1.2 s"
      const ms = value.includes("s") && !value.includes("ms")
        ? num * 1000
        : num;
      return ms <= 200 ? "Good" : ms <= 600 ? "Needs work" : "Poor";
    }
    default: return "N/A";
  }
}

function ratingStyle(rating: string) {
  switch (rating) {
    case "Good":
      return { bg: "var(--success-tint)", color: "var(--success)" };
    case "Needs work":
      return { bg: "var(--warning-tint)", color: "var(--warning)" };
    case "Poor":
      return { bg: "var(--danger-tint)", color: "var(--danger)" };
    default:
      return { bg: "var(--surface-2)", color: "var(--text-faint)" };
  }
}

function severityStyle(severity: string) {
  switch (severity) {
    case "high":
      return { bg: "var(--danger-tint)", color: "var(--danger)" };
    case "medium":
      return { bg: "var(--warning-tint)", color: "var(--warning)" };
    case "low":
      return { bg: "var(--info-tint)", color: "var(--info)" };
    default:
      return { bg: "var(--surface-2)", color: "var(--text-faint)" };
  }
}

function priorityFromSavings(savings: string): string {
  const num = parseFloat(savings);
  if (Number.isNaN(num)) return "low";
  // If savings is in seconds (contains "s" but not "ms"), convert
  const ms = savings.includes("s") && !savings.includes("ms") ? num * 1000 : num;
  if (ms >= 1000) return "high";
  if (ms >= 300) return "medium";
  return "low";
}

function priorityStyle(priority: string) {
  switch (priority) {
    case "high":
      return { bg: "var(--danger-tint)", color: "var(--danger)" };
    case "medium":
      return { bg: "var(--warning-tint)", color: "var(--warning)" };
    case "low":
      return { bg: "var(--info-tint)", color: "var(--info)" };
    default:
      return { bg: "var(--surface-2)", color: "var(--text-faint)" };
  }
}

// ---------- CWV metadata ----------

const CWV_META: Record<string, { label: string; fullLabel: string }> = {
  lcp: { label: "LCP", fullLabel: "Largest Contentful Paint" },
  cls: { label: "CLS", fullLabel: "Cumulative Layout Shift" },
  fcp: { label: "FCP", fullLabel: "First Contentful Paint" },
  tbt: { label: "TBT", fullLabel: "Total Blocking Time" },
};

// ---------- component ----------

interface Props {
  siteOptions: Array<{ slug: string; name: string; domain: string }>;
}

export function TechWatchdogClient({ siteOptions }: Props) {
  const [url, setUrl] = useState(siteOptions[0]?.domain ?? "");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [result, setResult] = useState<PageSpeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRun() {
    setError(null);
    startTransition(async () => {
      const res = await analyzePageSpeed(url, strategy);
      if (res.ok) {
        setResult(res.data);
        setError(null);
      } else {
        setResult(null);
        setError(res.error);
      }
    });
  }

  const circumference = 2 * Math.PI * 54;
  const dashLen = result ? (result.score / 100) * circumference : 0;

  return (
    <div className="space-y-6">
      {/* ── URL input + controls ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Site picker dropdown */}
          {siteOptions.length > 0 && (
            <select
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text"
            >
              <option value="">-- Select a site --</option>
              {siteOptions.map((s) => (
                <option key={s.slug} value={s.domain}>
                  {s.name} ({s.domain})
                </option>
              ))}
            </select>
          )}

          {/* Manual URL input */}
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL (e.g. example.com)"
            className="h-9 flex-1 min-w-[200px] rounded-lg border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-text-faint"
          />

          {/* Strategy toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStrategy("mobile")}
              className="rounded-lg px-4 py-2 text-sm font-medium transition"
              style={
                strategy === "mobile"
                  ? { background: "var(--accent)", color: "#fff" }
                  : { borderColor: "var(--border)", color: "var(--text-muted)", border: "1px solid" }
              }
            >
              Mobile
            </button>
            <button
              type="button"
              onClick={() => setStrategy("desktop")}
              className="rounded-lg px-4 py-2 text-sm font-medium transition"
              style={
                strategy === "desktop"
                  ? { background: "var(--accent)", color: "#fff" }
                  : { borderColor: "var(--border)", color: "var(--text-muted)", border: "1px solid" }
              }
            >
              Desktop
            </button>
          </div>

          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={pending || !url.trim()}
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </section>

      {/* ── Loading indicator ── */}
      {pending && (
        <section className="rounded-xl border border-border bg-surface px-5 py-10">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
              style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
            />
            <p className="text-sm text-text-muted">
              Running PageSpeed analysis on <span className="font-medium text-text">{url}</span> ({strategy})...
            </p>
            <p className="text-xs text-text-faint">This typically takes 15-30 seconds</p>
          </div>
        </section>
      )}

      {/* ── Error ── */}
      {error && !pending && (
        <section className="rounded-xl border bg-surface px-5 py-4" style={{ borderColor: "var(--danger)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>Analysis failed</p>
          <p className="mt-1 text-xs text-text-muted">{error}</p>
          {error.includes("429") && (
            <a href="/admin/settings?section=apis" className="mt-2 inline-block text-xs text-accent hover:underline">
              Configure a PageSpeed API key →
            </a>
          )}
        </section>
      )}

      {/* ── Results ── */}
      {result && !pending && (
        <>
          {/* Score Gauge + CWV Grid */}
          <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
            {/* Gauge */}
            <div className="flex items-center justify-center rounded-xl border border-border bg-surface p-6">
              <div className="relative flex h-32 w-32 items-center justify-center">
                <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="var(--surface-2)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={scoreColor(result.score)}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${dashLen} ${circumference}`}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-medium tabular-nums text-text">{result.score}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-faint">
                    {strategy === "mobile" ? "Mobile" : "Desktop"}
                  </span>
                </div>
              </div>
            </div>

            {/* Core Web Vitals Grid */}
            <div className="grid grid-cols-2 gap-3">
              {(["lcp", "cls", "fcp", "tbt"] as const).map((key) => {
                const value = result[key];
                const meta = CWV_META[key];
                const rating = ratingFromCwv(key, value);
                const rs = ratingStyle(rating);
                return (
                  <div key={key} className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-xs font-medium uppercase tracking-wider text-text-faint">
                          {meta.label}
                        </span>
                        <p className="text-lg font-medium tabular-nums text-text">{value}</p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: rs.bg, color: rs.color }}
                      >
                        {rating}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-faint">{meta.fullLabel}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Opportunities */}
          {result.opportunities.length > 0 && (
            <section className="rounded-xl border border-border bg-surface">
              <div className="px-5 py-4">
                <h2 className="text-sm font-medium text-text">
                  Opportunities ({result.opportunities.length})
                </h2>
                <p className="mt-1 text-xs text-text-faint">
                  Optimizations that could improve page load speed
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-border text-xs text-text-faint">
                      <th className="px-5 py-2 font-medium">Opportunity</th>
                      <th className="px-3 py-2 font-medium text-center">Est. Savings</th>
                      <th className="px-3 py-2 font-medium text-center">Category</th>
                      <th className="px-3 py-2 font-medium text-center">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.opportunities.map((opp, i) => {
                      const p = priorityFromSavings(opp.savings);
                      const ps = priorityStyle(p);
                      return (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-5 py-2.5 text-sm text-text">{opp.title}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-mono text-xs" style={{ color: "var(--warning)" }}>
                              {opp.savings}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-xs text-text-faint">{opp.category}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ background: ps.bg, color: ps.color }}
                            >
                              {p}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Issues */}
          {result.issues.length > 0 && (
            <section className="rounded-xl border border-border bg-surface">
              <div className="px-5 py-4">
                <h2 className="text-sm font-medium text-text">Issues ({result.issues.length})</h2>
                <p className="mt-1 text-xs text-text-faint">
                  Diagnostics that affect performance and accessibility
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-y border-border text-xs text-text-faint">
                      <th className="px-5 py-2 font-medium">Issue</th>
                      <th className="px-3 py-2 font-medium text-center">Severity</th>
                      <th className="px-3 py-2 font-medium text-center">Affected Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issues.map((issue, i) => {
                      const ss = severityStyle(issue.severity);
                      return (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-5 py-2.5 text-sm text-text">{issue.title}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ background: ss.bg, color: ss.color }}
                            >
                              {issue.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-mono text-xs text-text-muted">
                              {issue.affectedPages}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Empty state if no opportunities and no issues */}
          {result.opportunities.length === 0 && result.issues.length === 0 && (
            <section className="rounded-xl border border-border bg-surface px-5 py-8 text-center">
              <p className="text-sm text-text-muted">
                No significant opportunities or issues found. The page is well optimized.
              </p>
            </section>
          )}
        </>
      )}

      {/* ── Empty state before first run ── */}
      {!result && !error && !pending && (
        <section className="rounded-xl border border-border bg-surface px-5 py-10 text-center">
          <p className="text-sm text-text-muted">
            Enter a URL and click &quot;Run Analysis&quot; to fetch live PageSpeed data.
          </p>
          <p className="mt-1 text-xs text-text-faint">
            Uses the Google PageSpeed Insights API v5. Works without a key on the free tier
            (~25 req/100s); configure a key at Settings → APIs for higher limits.
          </p>
        </section>
      )}
    </div>
  );
}
