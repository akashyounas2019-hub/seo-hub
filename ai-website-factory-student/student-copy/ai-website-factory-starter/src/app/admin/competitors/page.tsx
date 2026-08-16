import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompetitorScoutTabs } from "@/components/ui/CompetitorScoutTabs";

export const dynamic = "force-dynamic";

const you = {
  name: "Your Site",
  domain: "safaeewala.com",
  keywords: 42,
  reviews: 128,
  rating: 4.6,
  citations: 28,
  schemaPages: 12,
  mobileScore: 72,
};

const competitors = [
  {
    name: "CleanMaster Dubai",
    domain: "cleanmasterdubai.com",
    keywords: 67,
    reviews: 215,
    rating: 4.7,
    citations: 45,
    schemaPages: 22,
    mobileScore: 81,
  },
  {
    name: "Sparkle Services",
    domain: "sparkleservices.ae",
    keywords: 53,
    reviews: 98,
    rating: 4.3,
    citations: 32,
    schemaPages: 8,
    mobileScore: 65,
  },
  {
    name: "PureClean UAE",
    domain: "pureclean.ae",
    keywords: 38,
    reviews: 156,
    rating: 4.5,
    citations: 41,
    schemaPages: 18,
    mobileScore: 77,
  },
];

const keywordGaps = [
  { keyword: "deep cleaning dubai marina", volume: 1900, compRank: 3, competitor: "CleanMaster Dubai" },
  { keyword: "move out cleaning jlt", volume: 1200, compRank: 5, competitor: "CleanMaster Dubai" },
  { keyword: "office cleaning deira", volume: 880, compRank: 2, competitor: "PureClean UAE" },
  { keyword: "sofa cleaning al barsha", volume: 720, compRank: 4, competitor: "Sparkle Services" },
  { keyword: "villa cleaning arabian ranches", volume: 590, compRank: 1, competitor: "CleanMaster Dubai" },
  { keyword: "carpet steam cleaning dubai", volume: 1400, compRank: 6, competitor: "PureClean UAE" },
];

const newPages = [
  {
    competitor: "CleanMaster Dubai",
    title: "Move-Out Cleaning Checklist for Dubai Tenants",
    url: "/blog/move-out-cleaning-checklist",
    date: "3 days ago",
  },
  {
    competitor: "PureClean UAE",
    title: "AC Duct Cleaning Services in Business Bay",
    url: "/services/ac-duct-cleaning-business-bay",
    date: "5 days ago",
  },
  {
    competitor: "Sparkle Services",
    title: "Why Regular Office Cleaning Boosts Productivity",
    url: "/blog/office-cleaning-productivity",
    date: "1 week ago",
  },
];

function metricDiff(yours: number, theirs: number): { label: string; color: string } {
  if (yours > theirs) return { label: `+${yours - theirs}`, color: "var(--success)" };
  if (yours < theirs) return { label: `${yours - theirs}`, color: "var(--danger)" };
  return { label: "=", color: "var(--text-faint)" };
}

const metrics: { key: keyof typeof you; label: string; format?: (v: number) => string }[] = [
  { key: "keywords", label: "Keywords" },
  { key: "reviews", label: "Reviews" },
  { key: "rating", label: "Rating", format: (v) => v.toFixed(1) },
  { key: "citations", label: "Citations" },
  { key: "schemaPages", label: "Schema Pages" },
  { key: "mobileScore", label: "Mobile Score" },
];

export default async function CompetitorsPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Competitor Spy"
        subtitle="Head-to-head comparison of keywords, reviews, citations, schema, and mobile performance against your top competitors."
      />

      <CompetitorScoutTabs />

      {/* Competitor cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {competitors.map((comp) => (
          <div
            key={comp.domain}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-text"
              >
                {comp.name[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{comp.name}</p>
                <p className="text-[11px] text-text-faint">{comp.domain}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {metrics.map((m) => {
                const yours = you[m.key] as number;
                const theirs = comp[m.key] as number;
                const diff = metricDiff(yours, theirs);
                const fmt = m.format ?? String;
                return (
                  <div key={m.key} className="flex items-center justify-between rounded-md bg-surface-2 px-2.5 py-1.5">
                    <span className="text-[11px] text-text-faint">{m.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text">{fmt(theirs)}</span>
                      <span className="text-[10px] font-semibold" style={{ color: diff.color }}>
                        {diff.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Keyword gap table */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Keyword Gap</h2>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--warning-tint)", color: "var(--warning)" }}
            >
              {keywordGaps.length} gaps
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-faint">Keywords your competitors rank for that you do not</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">Keyword</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-text-faint">Volume</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-text-faint">Their Rank</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-faint">Competitor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keywordGaps.map((gap) => (
                <tr key={gap.keyword} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 text-xs font-medium text-text">{gap.keyword}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-text-muted">{gap.volume.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="inline-block min-w-[24px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold"
                      style={{ background: "var(--success)", color: "var(--bg)" }}
                    >
                      {gap.compRank}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-faint">{gap.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New pages detected */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">New Pages Detected</h2>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--info-tint)", color: "var(--info)" }}
          >
            {newPages.length} pages
          </span>
        </div>
        <div className="space-y-2">
          {newPages.map((page, i) => (
            <div key={i} className="flex items-start justify-between gap-4 rounded-md bg-surface-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">{page.title}</p>
                <p className="mt-0.5 text-[10px] text-text-faint">
                  {page.competitor} &middot; {page.url}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-text-faint">{page.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
