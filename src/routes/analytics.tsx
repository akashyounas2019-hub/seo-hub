import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — AKS SEO Console" },
      { name: "description", content: "Traffic, rankings, and conversion analytics." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">Analytics</h1>
        <p className="mt-1 text-sm text-slate-400">Search visibility and conversion trends.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {["Organic Sessions", "Keyword Rankings", "Conversions"].map((l, i) => (
            <div key={l} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{l}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{["42.1k", "1,287", "3.4%"][i]}</div>
              <div className="mt-4 h-24 rounded-md bg-gradient-to-t from-cyan-400/10 to-transparent" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
