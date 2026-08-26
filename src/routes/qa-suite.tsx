import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TestTube2, Clock, Play, ShieldAlert, Rocket, AlertTriangle } from "lucide-react";
import { useSite } from "@/lib/site-context";

export const Route = createFileRoute("/qa-suite")({
  head: () => ({
    meta: [
      { title: "QA Suite — AKS SEO Console" },
      { name: "description", content: "Real Playwright + axe-core QA runs across every connected site." },
    ],
  }),
  component: QASuitePage,
});

const SCOPES = [
  { id: "full", label: "Full site (from real sitemap)" },
  { id: "landing", label: "Landing pages only" },
  { id: "blog", label: "Blog posts only" },
  { id: "page", label: "Single page (URL below)" },
];

const SUITE_LABELS: Record<string, string> = {
  viewport: "Viewport / Overflow",
  links: "Link Integrity",
  schema: "Schema Validity (JSON-LD)",
  accessibility: "Accessibility (axe-core)",
  vitals: "Core Web Vitals",
};

type QaRun = {
  id: string;
  siteId: string;
  siteName?: string | null;
  siteDomain?: string | null;
  scope: string;
  targetUrl: string | null;
  status: "queued" | "running" | "passed" | "warning" | "failed";
  pagesChecked: number;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type QaFinding = {
  id: string;
  suite: string;
  pageUrl: string;
  severity: "critical" | "warning" | "info";
  passed: boolean;
  message: string;
  detail: Record<string, unknown> | null;
};

function statusPill(status: string) {
  if (status === "passed") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "warning") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  if (status === "failed") return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"; // queued / running
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function pollQaRun(runId: string, onTick: (run: QaRun) => void): Promise<QaRun | null> {
  const POLL_MS = 3000;
  const MAX_ATTEMPTS = 140; // ~7 minutes — a full-site Playwright pass isn't instant
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`/api/qa/runs/${runId}`);
    const json = await res.json();
    if (!json?.ok) continue;
    onTick(json.run);
    if (["passed", "warning", "failed"].includes(json.run.status)) return json.run;
  }
  return null;
}

function QASuitePage() {
  const { currentSite, allSites } = useSite();
  const [siteId, setSiteId] = useState("");
  const [scope, setScope] = useState("full");
  const [url, setUrl] = useState("");
  const [queuing, setQueuing] = useState(false);
  const [runs, setRuns] = useState<QaRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [selectedRun, setSelectedRun] = useState<QaRun | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<QaFinding[]>([]);

  useEffect(() => {
    if (!siteId && currentSite.id) setSiteId(currentSite.id);
  }, [currentSite.id, siteId]);

  const loadRuns = async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/qa/runs");
      const json = await res.json();
      if (json?.ok) setRuns(json.runs || []);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const queueRun = async () => {
    if (!siteId) {
      toast.error("Choose a site first");
      return;
    }
    if (scope === "page" && !url.trim()) {
      toast.error("Enter a URL for single-page scope");
      return;
    }

    setQueuing(true);
    try {
      const res = await fetch("/api/qa/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, scope, targetUrl: scope === "page" ? url.trim() : undefined }),
      });
      const json = await res.json();
      if (!json?.ok || !json.runId) {
        toast.error(json?.error || "Failed to queue QA run");
        return;
      }
      toast.success("QA run queued", { description: "Waiting for the AKS worker — run `npm run worker` if none is running." });
      await loadRuns();

      const final = await pollQaRun(json.runId, () => loadRuns());
      await loadRuns();
      if (final) {
        toast[final.status === "failed" ? "error" : final.status === "warning" ? "info" : "success"](
          `QA run ${final.status}`,
          { description: `${final.checksPassed}/${final.checksTotal} checks passed across ${final.pagesChecked} page(s)` },
        );
      } else {
        toast.info("Still running in the background — refresh to check.");
      }
    } catch {
      toast.error("Failed to queue QA run");
    } finally {
      setQueuing(false);
    }
  };

  const openRun = async (run: QaRun) => {
    setSelectedRun(run);
    try {
      const res = await fetch(`/api/qa/runs/${run.id}`);
      const json = await res.json();
      if (json?.ok) {
        setSelectedRun(json.run);
        setSelectedFindings(json.findings || []);
      }
    } catch {
      toast.error("Failed to load run details");
    }
  };

  const kpi = useMemo(() => {
    const last7d = runs.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 7 * 24 * 3600 * 1000);
    const totalChecks = runs.reduce((s, r) => s + r.checksTotal, 0);
    const totalFailed = runs.reduce((s, r) => s + r.checksFailed, 0);
    return {
      runs7d: last7d.length,
      passedChecks: totalChecks - totalFailed,
      failures: runs.filter((r) => r.status === "failed").length,
      warnings: runs.filter((r) => r.status === "warning").length,
      queued: runs.filter((r) => r.status === "queued" || r.status === "running").length,
    };
  }, [runs]);

  const bySuite = useMemo(() => {
    const groups: Record<string, { total: number; passed: number; failed: number }> = {};
    for (const f of selectedFindings) {
      const g = (groups[f.suite] ||= { total: 0, passed: 0, failed: 0 });
      g.total++;
      if (f.passed) g.passed++;
      else g.failed++;
    }
    return groups;
  }, [selectedFindings]);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <TestTube2 className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">QA Suite</h1>
            <p className="text-sm text-slate-400">
              Real Playwright checks across 4 viewports (mobile/tablet/desktop/wide), plus axe-core accessibility,
              link integrity, JSON-LD schema validity, and Core Web Vitals timing — grounded in your site's actual sitemap.
            </p>
          </div>
        </header>

        {/* KPIs */}
        <div className="mb-5 grid gap-3 sm:grid-cols-5">
          {[
            { l: "Runs (7d)", v: kpi.runs7d, tone: "text-white" },
            { l: "Passed checks", v: kpi.passedChecks, tone: "text-emerald-300" },
            { l: "Warnings", v: kpi.warnings, tone: "text-amber-300" },
            { l: "Failures", v: kpi.failures, tone: "text-rose-300" },
            { l: "Queued / Running", v: kpi.queued, tone: "text-cyan-300" },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</div>
              <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${c.tone}`}>{c.v}</div>
            </div>
          ))}
        </div>

        {/* Run QA on a site */}
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50">
          <div className="border-b border-slate-800 px-5 py-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-white">Run QA on a site</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Enqueues a real claude_jobs row (kind "qa:run"). The AKS worker (npm run worker) picks it up and drives
              a real headless Chromium via Playwright — no scheduler, manual trigger only.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
              >
                <option value="">Choose…</option>
                {allSites.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} ({s.domain})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
              >
                {SCOPES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">URL (page scope only)</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/book-now or https://full.url/page"
                disabled={scope !== "page"}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none disabled:opacity-40"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={queueRun}
                disabled={queuing}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {queuing ? "Running…" : "Queue run →"}
              </button>
            </div>
          </div>
        </section>

        {/* Recent runs + selected run detail */}
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">Recent runs</h3>
            </div>
            {loadingRuns ? (
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">No runs yet — queue one above.</div>
            ) : (
              <ul className="mt-3 max-h-[420px] divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => openRun(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs hover:bg-slate-900/50">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{r.siteName || r.siteDomain || r.siteId}</div>
                        <div className="truncate text-[10px] text-slate-500">{r.scope}{r.targetUrl ? ` · ${r.targetUrl}` : ""} · {timeAgo(r.createdAt)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusPill(r.status)}`}>
                        {r.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-semibold text-white">Run detail</h3>
            </div>
            {!selectedRun ? (
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">
                Select a run on the left to see its findings.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusPill(selectedRun.status)}`}>{selectedRun.status}</span>
                  <span className="text-[11px] text-slate-400">
                    {selectedRun.checksPassed}/{selectedRun.checksTotal} passed · {selectedRun.pagesChecked} page(s)
                    {selectedRun.durationMs ? ` · ${(selectedRun.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
                {selectedRun.error && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {selectedRun.error}
                  </div>
                )}
                {Object.keys(bySuite).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(bySuite).map(([suite, s]) => (
                      <div key={suite} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{SUITE_LABELS[suite] || suite}</div>
                        <div className="mt-0.5 font-mono text-xs">
                          <span className="text-emerald-300">{s.passed}</span> / <span className="text-rose-300">{s.failed}</span> / {s.total}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedFindings.filter((f) => !f.passed).length > 0 && (
                  <ul className="max-h-[220px] space-y-1.5 overflow-y-auto">
                    {selectedFindings.filter((f) => !f.passed).map((f) => (
                      <li key={f.id} className={`rounded-lg border p-2.5 text-xs ${f.severity === "critical" ? "border-rose-400/30 bg-rose-500/5" : "border-amber-400/30 bg-amber-500/5"}`}>
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                          {SUITE_LABELS[f.suite] || f.suite}
                        </div>
                        <div className="mt-0.5 text-slate-200">{f.message}</div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-500">{f.pageUrl}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
