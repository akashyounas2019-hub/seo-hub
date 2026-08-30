import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Radar,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  Zap,
  Activity,
  ShieldCheck,
  Rocket,
} from "lucide-react";
import { SEO_CATEGORIES, SEO_TOOLS, type SeoToolCategory } from "@/lib/seo-tools";

export const Route = createFileRoute("/seo-suite/")({
  head: () => ({
    meta: [
      { title: "SEO Suite — Advanced Optimisation Hub" },
      {
        name: "description",
        content:
          "Advanced SEO toolset: audits, technical, content, authority, local, and generative visibility for the Dubai cleaning vertical.",
      },
      { property: "og:title", content: "SEO Suite — Advanced Optimisation Hub" },
      {
        property: "og:description",
        content:
          "One control plane for audits, schema, hreflang, backlinks, competitors, and AI visibility.",
      },
    ],
  }),
  component: SeoSuiteHub,
});

const FILTERS: { id: "all" | SeoToolCategory; label: string }[] = [
  { id: "all", label: "All tools" },
  { id: "audit", label: SEO_CATEGORIES.audit.label },
  { id: "content", label: SEO_CATEGORIES.content.label },
  { id: "technical", label: SEO_CATEGORIES.technical.label },
  { id: "authority", label: SEO_CATEGORIES.authority.label },
  { id: "local", label: SEO_CATEGORIES.local.label },
  { id: "intelligence", label: SEO_CATEGORIES.intelligence.label },
];

function SeoSuiteHub() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  const tools = useMemo(() => {
    return SEO_TOOLS.filter((t) => {
      if (filter !== "all" && t.category !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-200">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-3 sm:px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <Link to="/dashboard" className="hover:text-cyan-300">Console</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-cyan-300">SEO Suite</span>
        </nav>

        {/* Hero */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-500/15 bg-slate-950/60 backdrop-blur">
          <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" />
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200">
                  <Radar className="h-3 w-3" />
                  Advanced SEO
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  17 tools
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  UAE · EN + AR
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                SEO Suite
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                One control plane for advanced SEO work — audits, technical health,
                content quality, authority, local, and generative visibility. Each
                tool takes a URL or a couple of inputs and returns a report your
                agents can act on.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 md:w-[360px]">
              {[
                { k: "Runs today", v: "24", icon: Zap },
                { k: "Health", v: "98%", icon: ShieldCheck },
                { k: "Live", v: "3", icon: Activity },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      {s.k}
                    </div>
                    <s.icon className="h-3.5 w-3.5 text-cyan-300/70" />
                  </div>
                  <div className="mt-1 text-xl font-semibold text-white">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Search + filters */}
          <div className="border-t border-slate-800 bg-slate-950/60 px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 md:min-w-[320px]">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search SEO tools…"
                  className="w-full bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="scrollbar-none flex gap-1 overflow-x-auto">
                {FILTERS.map((f) => {
                  const active = f.id === filter;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        active
                          ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-100 ring-1 ring-cyan-400/40"
                          : "border border-slate-800 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Tool grid */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">
            <span>Tools · {tools.length}</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Sparkles className="h-3 w-3" /> Powered by Scout agents
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.id}
                  to="/seo-suite/$toolId"
                  params={{ toolId: tool.id }}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_0_40px_-15px_rgba(34,211,238,0.4)]"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${tool.accent}`}
                  />
                  <div
                    className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${tool.accent} opacity-10 blur-3xl transition group-hover:opacity-25`}
                  />
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${tool.accent} shadow-[0_0_16px_rgba(34,211,238,0.25)]`}
                      >
                        <Icon className="h-5 w-5 text-slate-950" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
                          {SEO_CATEGORIES[tool.category].label}
                        </div>
                        <div className="text-[15px] font-semibold text-white">
                          {tool.title}
                        </div>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-cyan-300" />
                  </div>
                  <p className="mt-3 text-[12px] text-slate-400">{tool.tagline}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500 line-clamp-2">
                    {tool.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] uppercase tracking-wider text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="h-3 w-3 text-cyan-300/70" /> {tool.runtime}
                    </span>
                    <span className="font-mono normal-case text-slate-400">
                      {tool.output}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          {tools.length === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-10 text-center">
              <Rocket className="mx-auto h-6 w-6 text-slate-600" />
              <div className="mt-2 text-sm text-slate-400">
                No tools match that filter yet.
              </div>
            </div>
          )}
        </section>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}
