import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { hasSemrushKey } from "@/lib/semrush";
import { SemrushResearch, ARABIC_DBS } from "../keywords/SemrushResearch";
import { KeywordTrackerTabs, type KeywordTrackerTab } from "./KeywordTrackerTabs";

export const dynamic = "force-dynamic";

const keywords = [
  { arabic: "تنظيف منازل دبي", english: "House cleaning Dubai", volume: 12100, rank: 3, trend: "up" },
  { arabic: "تنظيف سجاد", english: "Carpet cleaning", volume: 8100, rank: 7, trend: "up" },
  { arabic: "تنظيف مكيفات", english: "AC cleaning", volume: 6600, rank: 12, trend: "down" },
  { arabic: "شركة تنظيف", english: "Cleaning company", volume: 14800, rank: 5, trend: "stable" },
  { arabic: "تنظيف كنب", english: "Sofa cleaning", volume: 5400, rank: 9, trend: "up" },
  { arabic: "تنظيف خزانات", english: "Tank cleaning", volume: 3200, rank: 18, trend: "down" },
  { arabic: "غسيل سيارات", english: "Car wash", volume: 9900, rank: 14, trend: "stable" },
  { arabic: "تنظيف واجهات", english: "Facade cleaning", volume: 2400, rank: 22, trend: "down" },
];

const checklist = [
  { label: "hreflang tags configured (ar + en)", done: true },
  { label: "Arabic LocalBusiness schema deployed", done: false },
  { label: "RTL stylesheet loaded on /ar/ pages", done: true },
  { label: "Arabic sitemap submitted to GSC", done: false },
  { label: "Arabic meta descriptions on all pages", done: false },
];

function trendIcon(trend: string): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function trendColor(trend: string): string {
  if (trend === "up") return "var(--success)";
  if (trend === "down") return "var(--danger)";
  return "var(--text-faint)";
}

function rankColor(rank: number): string {
  if (rank <= 3) return "var(--success)";
  if (rank <= 10) return "var(--info)";
  if (rank <= 20) return "var(--warning)";
  return "var(--danger)";
}

export default async function KeywordTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await ensureSchema();
  await requireAdmin();
  const sp = await searchParams;
  const tab = (sp.tab as KeywordTrackerTab) || "tracker";

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Arabic Keyword Tracker"
        subtitle="Bilingual keyword tracking, Arabic keyword research, and technical setup for hreflang and Arabic schema markup."
      />

      <KeywordTrackerTabs active={tab} />

      {tab === "tracker" ? <TrackerView /> : <ResearchView />}
    </div>
  );
}

function TrackerView() {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Tracked Keywords", value: String(keywords.length), color: "var(--accent)" },
          { label: "Avg. Rank", value: String(Math.round(keywords.reduce((s, k) => s + k.rank, 0) / keywords.length)), color: "var(--info)" },
          { label: "Top 3", value: String(keywords.filter((k) => k.rank <= 3).length), color: "var(--success)" },
          { label: "Below 20", value: String(keywords.filter((k) => k.rank > 20).length), color: "var(--danger)" },
        ].map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-lg border border-border bg-surface p-3">
            <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: m.color }} />
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">{m.label}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-text">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Keywords table */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Arabic Keyword Rankings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">Arabic</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">English</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-text-faint">Volume</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-text-faint">Rank</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-text-faint">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keywords.map((kw) => (
                <tr key={kw.arabic} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 text-sm font-medium text-text" dir="rtl">
                    {kw.arabic}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-muted">{kw.english}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-text-muted">
                    {kw.volume.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="inline-block min-w-[28px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold"
                      style={{ background: rankColor(kw.rank), color: "var(--bg)" }}
                    >
                      {kw.rank}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-sm font-bold" style={{ color: trendColor(kw.trend) }}>
                      {trendIcon(kw.trend)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Khaleeji content generator */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Khaleeji Content Generator</h2>
            <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: "var(--accent)" }}>
              Generate
            </button>
          </div>
          <p className="mb-3 text-xs text-text-muted">
            AI generates culturally-appropriate Gulf Arabic content targeting UAE audiences with Khaleeji dialect, local references, and regional expressions.
          </p>
          <div className="rounded-md bg-surface-2 p-3">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-faint">Preview Output</p>
            <p className="text-xs leading-relaxed text-text-muted" dir="rtl">
              نقدم أفضل خدمات التنظيف في دبي. فريقنا المحترف يوفر تنظيف شامل للمنازل والمكاتب والفلل. نستخدم أحدث المعدات ومنتجات تنظيف صديقة للبيئة. احصل على عرض سعر مجاني اليوم.
            </p>
          </div>
        </div>

        {/* Technical checklist */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Technical Checklist</h2>
          <div className="space-y-2">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px]"
                  style={{
                    background: item.done ? "var(--success-tint)" : "var(--surface-3)",
                    color: item.done ? "var(--success)" : "var(--text-faint)",
                  }}
                >
                  {item.done ? "✓" : "‒"}
                </span>
                <span className="text-xs" style={{ color: item.done ? "var(--text-muted)" : "var(--text-faint)" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-text-faint">
            {checklist.filter((c) => c.done).length} of {checklist.length} completed
          </p>
        </div>
      </div>
    </div>
  );
}

async function ResearchView() {
  const allSites = await db().select({ id: sites.id, name: sites.name }).from(sites).orderBy(sites.name);
  return (
    <SemrushResearch
      configured={hasSemrushKey()}
      sites={allSites}
      dbs={ARABIC_DBS}
      defaultDb="ae"
      rtl
      title="Arabic keyword research"
      subtitle="Live SEMrush data scoped to Gulf & MENA markets — keywords render right-to-left."
    />
  );
}
