import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompetitorScoutTabs } from "@/components/ui/CompetitorScoutTabs";

export const dynamic = "force-dynamic";

const platforms = [
  {
    name: "ChatGPT",
    mentions: 3,
    total: 10,
    color: "var(--success)",
    tint: "var(--success-tint)",
    icon: "C",
  },
  {
    name: "Perplexity",
    mentions: 2,
    total: 10,
    color: "var(--info)",
    tint: "var(--info-tint)",
    icon: "P",
  },
  {
    name: "Google AI Overviews",
    mentions: 1,
    total: 10,
    color: "var(--warning)",
    tint: "var(--warning-tint)",
    icon: "G",
  },
  {
    name: "Gemini",
    mentions: 0,
    total: 10,
    color: "var(--danger)",
    tint: "var(--danger-tint)",
    icon: "G",
  },
];

const trackedQueries = [
  {
    query: "best cleaning company in dubai",
    platforms: { ChatGPT: true, Perplexity: true, Google: false, Gemini: false },
    suggestion: "Add expert testimonials and case studies to homepage",
  },
  {
    query: "house cleaning services near me dubai",
    platforms: { ChatGPT: true, Perplexity: false, Google: true, Gemini: false },
    suggestion: "Strengthen LocalBusiness schema with service area details",
  },
  {
    query: "how much does cleaning cost in dubai",
    platforms: { ChatGPT: true, Perplexity: true, Google: false, Gemini: false },
    suggestion: "Create a transparent pricing page with FAQ schema",
  },
  {
    query: "move out cleaning checklist dubai",
    platforms: { ChatGPT: false, Perplexity: false, Google: false, Gemini: false },
    suggestion: "Publish comprehensive checklist content with how-to schema",
  },
  {
    query: "eco friendly cleaning services uae",
    platforms: { ChatGPT: false, Perplexity: false, Google: false, Gemini: false },
    suggestion: "Create dedicated eco-cleaning page with certifications",
  },
];

const geoTactics = [
  { tactic: "Add structured data (FAQ, HowTo, LocalBusiness) to all service pages", done: true },
  { tactic: "Create dedicated FAQ pages answering top 20 customer questions", done: true },
  { tactic: "Add expert citations and credentials to About page", done: false },
  { tactic: "Publish comparison content (us vs. competitors) with data tables", done: false },
  { tactic: "Get mentioned in industry directories and review aggregators", done: false },
  { tactic: "Create data-driven content with original statistics and surveys", done: false },
  { tactic: "Add author bios with verifiable expertise signals (EEAT)", done: false },
];

const platformKeys = ["ChatGPT", "Perplexity", "Google", "Gemini"] as const;

function platformColor(key: string): string {
  switch (key) {
    case "ChatGPT": return "var(--success)";
    case "Perplexity": return "var(--info)";
    case "Google": return "var(--warning)";
    case "Gemini": return "var(--danger)";
    default: return "var(--text-faint)";
  }
}

export default async function AiVisibilityPage() {
  await ensureSchema();
  await requireAdmin();

  const totalMentions = platforms.reduce((s, p) => s + p.mentions, 0);
  const totalQueries = platforms[0].total;

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="AI Visibility"
        subtitle="Track how your business appears in ChatGPT, Perplexity, Google AI Overviews, and Gemini — the new organic search."
      />

      <CompetitorScoutTabs />

      {/* Platform cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {platforms.map((p) => (
          <div
            key={p.name}
            className="relative overflow-hidden rounded-lg border border-border bg-surface p-4"
          >
            <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: p.color }} />
            <div className="mb-2 flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: p.tint, color: p.color }}
              >
                {p.icon}
              </span>
              <span className="text-xs font-medium text-text-muted">{p.name}</span>
            </div>
            <p className="text-xl font-bold text-text">
              {p.mentions}<span className="text-sm font-normal text-text-faint">/{p.total}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-text-faint">queries mention you</p>
            {/* Mini bar */}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(p.mentions / p.total) * 100}%`,
                  background: p.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Tracked queries */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Tracked Queries</h2>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
            >
              {totalMentions}/{totalQueries * 4} mentions
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">Query</th>
                {platformKeys.map((k) => (
                  <th key={k} className="px-3 py-2.5 text-center text-xs font-medium text-text-faint">{k}</th>
                ))}
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">Suggestion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trackedQueries.map((q) => (
                <tr key={q.query} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 text-xs font-medium text-text">{q.query}</td>
                  {platformKeys.map((k) => {
                    const mentioned = q.platforms[k];
                    return (
                      <td key={k} className="px-3 py-2.5 text-center">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{
                            background: mentioned ? platformColor(k) : "var(--surface-2)",
                            color: mentioned ? "var(--bg)" : "var(--text-faint)",
                          }}
                        >
                          {mentioned ? "✓" : "‒"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-xs text-text-muted">{q.suggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GEO improvement plan */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">GEO Improvement Plan</h2>
          <span className="text-[10px] text-text-faint">
            {geoTactics.filter((t) => t.done).length} of {geoTactics.length} completed
          </span>
        </div>
        <p className="mb-3 text-xs text-text-muted">
          Generative Engine Optimization tactics to increase your visibility across AI platforms.
        </p>
        <div className="space-y-2">
          {geoTactics.map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]"
                style={{
                  background: item.done ? "var(--success-tint)" : "var(--surface-3)",
                  color: item.done ? "var(--success)" : "var(--text-faint)",
                }}
              >
                {item.done ? "✓" : "‒"}
              </span>
              <span
                className="text-xs"
                style={{ color: item.done ? "var(--text-muted)" : "var(--text-faint)" }}
              >
                {item.tactic}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
