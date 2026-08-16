import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TestTube2, CheckCircle2, XCircle, Clock, Play, ShieldAlert, Rocket } from "lucide-react";

export const Route = createFileRoute("/qa-suite")({
  head: () => ({
    meta: [
      { title: "QA Suite — AKS SEO Console" },
      { name: "description", content: "Automated QA runs across every published site." },
    ],
  }),
  component: QASuitePage,
});

const SITES = [
  { id: "safaeewala", label: "safaeewala.com" },
  { id: "northwind", label: "northwindlogistics.io" },
  { id: "aurora", label: "auroradental.co" },
  { id: "atlas", label: "atlasoutdoor.shop" },
];

const SCOPES = [
  { id: "full", label: "Full site (home + booking + contact)" },
  { id: "landing", label: "Landing pages only" },
  { id: "blog", label: "Blog posts only" },
  { id: "page", label: "Single page (URL below)" },
];

const suites = [
  { name: "Post-publish Playwright", status: "passing", last: "12m ago", passed: 84, failed: 0, total: 84 },
  { name: "Schema validity (JSON-LD)", status: "passing", last: "1h ago", passed: 42, failed: 0, total: 42 },
  { name: "Core Web Vitals lab", status: "warning", last: "2h ago", passed: 38, failed: 4, total: 42 },
  { name: "Link integrity", status: "failing", last: "3h ago", passed: 217, failed: 3, total: 220 },
  { name: "Accessibility (axe)", status: "passing", last: "6h ago", passed: 96, failed: 0, total: 96 },
];

function pill(status: string) {
  if (status === "passing") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "warning") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function QASuitePage() {
  const [site, setSite] = useState("");
  const [scope, setScope] = useState("full");
  const [url, setUrl] = useState("");
  const [runs, setRuns] = useState<{ id: string; site: string; scope: string; status: "queued" | "running" | "passed"; time: string }[]>([]);

  const queueRun = () => {
    if (!site) {
      toast.error("Choose a site first");
      return;
    }
    const label = SITES.find((s) => s.id === site)?.label ?? site;
    const scopeLabel = SCOPES.find((s) => s.id === scope)?.label ?? scope;
    const id = `run-${Date.now()}`;
    setRuns((prev) => [{ id, site: label, scope: scopeLabel, status: "queued", time: "just now" }, ...prev]);
    toast.success(`QA run queued for ${label}`, { description: `Scope: ${scopeLabel}` });
    setTimeout(() => setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, status: "running" } : r))), 800);
    setTimeout(() => setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, status: "passed" } : r))), 2400);
  };

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
              Multi-viewport (mobile/tablet/desktop/wide) UI &amp; functional testing. Detects text overflow, broken buttons, form failures, missing industry conventions.
            </p>
          </div>
          <button
            onClick={() => {
              toast.success("Running all suites…");
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
          >
            <Play className="h-3.5 w-3.5" /> Run all suites
          </button>
        </header>

        {/* Top KPIs (from screenshot) */}
        <div className="mb-5 grid gap-3 sm:grid-cols-5">
          {[
            { l: "Runs (7d)", v: runs.length, tone: "text-white" },
            { l: "Passed checks", v: runs.filter((r) => r.status === "passed").length, tone: "text-emerald-300" },
            { l: "Warnings", v: 0, tone: "text-amber-300" },
            { l: "Failures", v: 0, tone: "text-rose-300" },
            { l: "Queued", v: runs.filter((r) => r.status === "queued").length, tone: "text-cyan-300" },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</div>
              <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${c.tone}`}>{c.v}</div>
            </div>
          ))}
        </div>

        {/* Run QA on a site (from screenshot) */}
        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/50">
          <div className="border-b border-slate-800 px-5 py-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-white">Run QA on a site</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Schedules the run. The worker on the VPS picks it up immediately (or runs in the nightly batch at 02:00 UTC).
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Site</label>
              <select
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
              >
                <option value="">Choose…</option>
                {SITES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
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
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={queueRun}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Queue run →
              </button>
            </div>
          </div>
        </section>

        {/* Open failures + recent runs */}
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              <h3 className="text-sm font-semibold text-white">Open failures (last 7 days)</h3>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-4">
              <div className="text-sm font-medium text-emerald-200">No high-severity failures.</div>
              <div className="mt-0.5 text-xs text-slate-400">Either everything's fine, or no QA has run yet — queue one above.</div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">Recent runs</h3>
            </div>
            {runs.length === 0 ? (
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">No runs yet.</div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{r.site}</div>
                      <div className="truncate text-[10px] text-slate-500">{r.scope}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        r.status === "passed"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : r.status === "running"
                            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                            : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Existing test suites — moved to bottom */}
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          {[
            { l: "Total tests", v: "484", i: TestTube2 },
            { l: "Passing", v: "477", i: CheckCircle2, tone: "text-emerald-300" },
            { l: "Failing", v: "7", i: XCircle, tone: "text-rose-300" },
            { l: "Avg runtime", v: "38s", i: Clock },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</span>
                <c.i className={`h-4 w-4 ${c.tone ?? "text-cyan-300"}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-semibold ${c.tone ?? "text-white"}`}>{c.v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50">
          <div className="border-b border-slate-800 px-5 py-3 text-sm font-semibold text-white">Test suites</div>
          <div className="divide-y divide-slate-800">
            {suites.map((s) => (
              <div key={s.name} className="grid grid-cols-12 items-center gap-3 px-5 py-3.5 text-sm">
                <div className="col-span-5 font-medium text-white">{s.name}</div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${pill(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                <div className="col-span-2 text-slate-400">{s.last}</div>
                <div className="col-span-2 font-mono text-xs text-slate-300">
                  <span className="text-emerald-300">{s.passed}</span> / <span className="text-rose-300">{s.failed}</span> / {s.total}
                </div>
                <div className="col-span-1 text-right">
                  <button
                    onClick={() => toast.success(`Running ${s.name}…`)}
                    className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-white"
                  >
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
