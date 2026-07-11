import { createFileRoute } from "@tanstack/react-router";
import { Activity, Users, Zap, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AKS SEO Console" },
      { name: "description", content: "Overview of agent activity, pipelines, and SEO performance." },
    ],
  }),
  component: DashboardPage,
});

const stats = [
  { k: "Active Agents", v: "25", icon: Users, accent: "from-cyan-400 to-sky-500" },
  { k: "Tasks / day", v: "348", icon: Activity, accent: "from-violet-400 to-fuchsia-500" },
  { k: "Automations", v: "12", icon: Zap, accent: "from-amber-400 to-orange-500" },
  { k: "Traffic Δ 7d", v: "+18%", icon: TrendingUp, accent: "from-emerald-400 to-teal-500" },
];

function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">Live overview of your SEO agent fleet.</p>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${s.accent}`} />
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-slate-950`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">{s.k}</div>
              <div className="mt-1 text-2xl font-semibold text-white">{s.v}</div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>· On-Page Expert published 4 meta rewrites</li>
              <li>· Backlink Prospector queued 12 outreach targets</li>
              <li>· Core Web Vitals agent flagged 2 LCP regressions</li>
              <li>· Auditor completed weekly site health scan</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold text-white">Pipeline Health</h2>
            <div className="mt-3 space-y-3">
              {[
                { l: "Research", v: 82, a: "from-emerald-400 to-teal-500" },
                { l: "On-Page", v: 71, a: "from-cyan-400 to-sky-500" },
                { l: "Off-Page", v: 58, a: "from-violet-400 to-fuchsia-500" },
                { l: "Technical", v: 94, a: "from-amber-400 to-orange-500" },
              ].map((r) => (
                <div key={r.l}>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{r.l}</span><span>{r.v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.a}`} style={{ width: `${r.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
