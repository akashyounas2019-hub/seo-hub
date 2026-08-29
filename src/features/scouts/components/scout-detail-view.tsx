import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  PlugZap,
  RefreshCw,
} from "lucide-react";
import agentBot from "@/assets/agent-bot.png";
import { useScoutDetail } from "../hooks/use-scout-detail";

export function ScoutDetailView({ scoutId }: { scoutId: string }) {
  const navigate = useNavigate();
  const { scout, activeTab, setActiveTab, tab, tabData, loading, error, refetch, TabIcon, ScoutIcon, peers, competitorDomain, setCompetitorDomain } = useScoutDetail(scoutId);

  if (!scout) return null;

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
          <Link to="/scout-team" className="inline-flex items-center gap-1 hover:text-cyan-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Scout Team
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-300">{scout.title}</span>
          {tab && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-cyan-300">{tab.label}</span>
            </>
          )}
        </nav>

        {/* Hero */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className={`h-1 w-full bg-gradient-to-r ${scout.accent}`} />
          <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            {/* Avatar */}
            <div className="relative">
              <div className={`absolute -inset-3 rounded-3xl bg-gradient-to-r ${scout.accent} opacity-30 blur-2xl`} />
              <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-cyan-300/40 bg-slate-950/90 ring-1 ring-slate-700/70 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
                <div className={`absolute inset-0 bg-gradient-to-br ${scout.accent} opacity-30`} />
                <img src={agentBot} alt="" className="relative block h-[68px] w-[68px] object-contain" />
                <span className={`absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br ${scout.accent} ring-1 ring-slate-950`}>
                  {ScoutIcon && <ScoutIcon className="h-3 w-3 text-slate-950" />}
                </span>
              </div>
            </div>

            {/* Identity */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                  {ScoutIcon && <ScoutIcon className="h-3 w-3 text-cyan-300" />}
                  {scout.role}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{scout.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">{scout.mission}</p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button
                onClick={refetch}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh real data
              </button>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 backdrop-blur">
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-slate-800 p-2">
            {scout.tabs.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`group inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white ring-1 ring-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                      : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-100"
                  }`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${scout.accent} ${isActive ? "opacity-100" : "opacity-60 group-hover:opacity-90"}`}>
                    <Icon className="h-3.5 w-3.5 text-slate-950" />
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab body -- entirely real data, or an honest empty/error state */}
          <div key={tab?.id} className="p-5 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Real data</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${scout.accent}`}>
                      {TabIcon && <TabIcon className="h-4 w-4 text-slate-950" />}
                    </span>
                    <h2 className="text-lg font-semibold text-white">{tab?.label}</h2>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-slate-400">{tab?.summary}</p>
                </div>
              </div>

              {scout.id === "competitor" && tab?.id === "sitemap" && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={competitorDomain}
                    onChange={(e) => setCompetitorDomain(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && refetch()}
                    placeholder="competitor-domain.com"
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                  />
                  <button
                    onClick={refetch}
                    disabled={loading || !competitorDomain.trim()}
                    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r ${scout.accent} px-3 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    {loading ? "Crawling…" : "Crawl competitor sitemap"}
                  </button>
                </div>
              )}

              <div className="mt-5">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 py-10 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading real data…
                  </div>
                ) : error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </div>
                ) : (
                  <TabContent tabData={tabData} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Peer scouts */}
        <div className="mt-8 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
          <span className="h-px flex-1 bg-slate-800" />
          <span>Jump to another scout</span>
          <span className="h-px flex-1 bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {peers.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => navigate({ to: "/scout-team/$scoutId", params: { scoutId: p.id } })}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/40"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${p.accent}`} />
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${p.accent}`}>
                    <Icon className="h-3.5 w-3.5 text-slate-950" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">{p.title}</div>
                    <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">{p.role}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function TabContent({ tabData }: { tabData: { available: boolean; reason?: string; [key: string]: unknown } | undefined }) {
  if (!tabData) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
        No data returned for this tab.
      </div>
    );
  }

  if (!tabData.available) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-5">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <div className="text-sm font-medium text-amber-200">Not available yet</div>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/70">{tabData.reason || "This requires a data source that isn't connected yet."}</p>
        </div>
      </div>
    );
  }

  const metrics = tabData.metrics as { label: string; value: string }[] | undefined;
  const items = (tabData.items || tabData.recent || tabData.topQueries || tabData.pages || tabData.reviews) as any[] | undefined;
  const note = tabData.note as string | undefined;
  const byStage = tabData.byStage as Record<string, number> | undefined;

  return (
    <div className="space-y-4">
      {metrics && metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</div>
              <div className="mt-1 text-xl font-semibold text-white">{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {byStage && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Object.entries(byStage).map(([stage, count]) => (
            <div key={stage} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{stage.replace("_", " ")}</div>
              <div className="mt-1 text-lg font-semibold text-white">{count}</div>
            </div>
          ))}
        </div>
      )}

      {note && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200">{note}</div>
      )}

      {items && items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <ul className="divide-y divide-slate-800">
            {items.slice(0, 15).map((it, i) => (
              <li key={i} className="p-3 text-sm text-slate-200">
                {typeof it === "string" ? it : (
                  <div>
                    <div className="font-medium text-white">{it.title || it.query || it.page || it.author || JSON.stringify(it).slice(0, 60)}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {[it.status, it.severity, it.source, it.position != null ? `pos ${it.position}` : null, it.clicks != null ? `${it.clicks} clicks` : null, it.createdAt]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!metrics?.length && !byStage && !note && !items?.length && (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
          No real data yet for this tab.
        </div>
      )}
    </div>
  );
}
