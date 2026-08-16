import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { CsvImportButton } from "./CsvImportButton";

export const dynamic = "force-dynamic";

type Movement = "up" | "down" | "same";

interface Keyword {
  keyword: string;
  rank: number;
  prevRank: number;
  movement: Movement;
  change: number;
  clicks: number;
  impressions: number;
  ctr: number;
}

const DEMO_KEYWORDS: Keyword[] = [
  { keyword: "cleaning services dubai", rank: 4, prevRank: 6, movement: "up", change: 2, clicks: 342, impressions: 8900, ctr: 3.8 },
  { keyword: "deep cleaning dubai", rank: 7, prevRank: 6, movement: "down", change: 1, clicks: 218, impressions: 5400, ctr: 4.0 },
  { keyword: "move in cleaning dubai", rank: 12, prevRank: 17, movement: "up", change: 5, clicks: 89, impressions: 2100, ctr: 4.2 },
  { keyword: "sofa cleaning dubai", rank: 18, prevRank: 21, movement: "up", change: 3, clicks: 56, impressions: 1800, ctr: 3.1 },
  { keyword: "villa cleaning dubai", rank: 3, prevRank: 3, movement: "same", change: 0, clicks: 410, impressions: 9200, ctr: 4.5 },
  { keyword: "office cleaning dubai", rank: 9, prevRank: 11, movement: "up", change: 2, clicks: 145, impressions: 3400, ctr: 4.3 },
  { keyword: "carpet cleaning dubai", rank: 15, prevRank: 13, movement: "down", change: 2, clicks: 67, impressions: 1500, ctr: 4.5 },
  { keyword: "ac duct cleaning dubai", rank: 6, prevRank: 8, movement: "up", change: 2, clicks: 198, impressions: 4600, ctr: 4.3 },
  { keyword: "maid service dubai", rank: 22, prevRank: 25, movement: "up", change: 3, clicks: 34, impressions: 1200, ctr: 2.8 },
  { keyword: "apartment cleaning dubai", rank: 11, prevRank: 14, movement: "up", change: 3, clicks: 102, impressions: 2800, ctr: 3.6 },
  { keyword: "kitchen deep cleaning", rank: 8, prevRank: 9, movement: "up", change: 1, clicks: 167, impressions: 3900, ctr: 4.3 },
  { keyword: "bathroom cleaning dubai", rank: 14, prevRank: 12, movement: "down", change: 2, clicks: 78, impressions: 1900, ctr: 4.1 },
];

const totalKeywords = DEMO_KEYWORDS.length;
const avgPosition = (DEMO_KEYWORDS.reduce((sum, k) => sum + k.rank, 0) / totalKeywords).toFixed(1);
const totalClicks = DEMO_KEYWORDS.reduce((sum, k) => sum + k.clicks, 0);
const totalImpressions = DEMO_KEYWORDS.reduce((sum, k) => sum + k.impressions, 0);

function rankColor(rank: number): { bg: string; color: string } {
  if (rank <= 3) return { bg: "var(--success-tint)", color: "var(--success)" };
  if (rank <= 10) return { bg: "var(--info-tint)", color: "var(--info)" };
  if (rank <= 20) return { bg: "var(--warning-tint)", color: "var(--warning)" };
  return { bg: "var(--danger-tint)", color: "var(--danger)" };
}

const FILTERS = [
  { key: "all", label: "All", count: 12 },
  { key: "top10", label: "Ranking (1-10)", count: 6 },
  { key: "losing", label: "Losing", count: 3 },
  { key: "quickwins", label: "Quick Wins (11-20)", count: 5 },
];

export default async function KeywordRankTrackerPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Keyword Rank Tracker"
        subtitle="Track keyword rankings from GSC or manual input — monitor movement, clicks, impressions, and CTR across your target keywords."
      />

      {/* ── Mode Toggle ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex items-center gap-2">
          <div
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Auto Mode (GSC)
          </div>
          <div
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Manual Mode
          </div>
          <CsvImportButton />
          <span className="ml-auto text-xs text-text-faint">Last synced: 2026-06-23 08:00 UTC</span>
        </div>
      </section>

      {/* ── Summary Stats ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Keywords Tracked</div>
          <div className="mt-1 text-2xl font-medium tabular-nums text-text">{totalKeywords}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Avg Position</div>
          <div className="mt-1 text-2xl font-medium tabular-nums text-text">{avgPosition}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Total Clicks</div>
          <div className="mt-1 text-2xl font-medium tabular-nums text-text">{totalClicks.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Total Impressions</div>
          <div className="mt-1 text-2xl font-medium tabular-nums text-text">{totalImpressions.toLocaleString()}</div>
        </div>
      </section>

      {/* ── Filter Pills ── */}
      <section className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => (
          <div
            key={f.key}
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: i === 0 ? "var(--accent)" : "var(--surface)",
              color: i === 0 ? "#fff" : "var(--text-muted)",
              border: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            {f.label}
            <span className="ml-1.5 opacity-70">{f.count}</span>
          </div>
        ))}
      </section>

      {/* ── Keywords Table ── */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-faint">
                <th className="px-5 py-3 font-medium">Keyword</th>
                <th className="px-3 py-3 font-medium text-center">Rank</th>
                <th className="px-3 py-3 font-medium text-center">Prev</th>
                <th className="px-3 py-3 font-medium text-center">Movement</th>
                <th className="px-3 py-3 font-medium text-right">Clicks</th>
                <th className="px-3 py-3 font-medium text-right">Impressions</th>
                <th className="px-3 py-3 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_KEYWORDS.map((kw) => {
                const rc = rankColor(kw.rank);
                return (
                  <tr key={kw.keyword} className="border-b border-border last:border-0 transition-colors hover:bg-surface-2">
                    <td className="px-5 py-2.5">
                      <span className="text-sm font-medium text-text">{kw.keyword}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-block min-w-[2rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums"
                        style={{ background: rc.bg, color: rc.color }}
                      >
                        #{kw.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-mono text-xs text-text-faint">#{kw.prevRank}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {kw.movement === "up" ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: "var(--success)" }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M5 2L8 6H2L5 2Z" fill="currentColor" />
                          </svg>
                          {kw.change}
                        </span>
                      ) : kw.movement === "down" ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: "var(--danger)" }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M5 8L2 4H8L5 8Z" fill="currentColor" />
                          </svg>
                          {kw.change}
                        </span>
                      ) : (
                        <span className="text-xs text-text-faint">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-xs text-text-muted">{kw.clicks.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-xs text-text-muted">{kw.impressions.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-xs text-text-muted">{kw.ctr}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
