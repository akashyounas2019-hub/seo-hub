import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, trackedKeywords, trackedKeywordsExt, serpSnapshots } from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import { CsvImportButton } from "../keyword-rank-tracker/CsvImportButton";

function rankColor(rank: number): { bg: string; color: string } {
  if (rank <= 3) return { bg: "var(--success-tint)", color: "var(--success)" };
  if (rank <= 10) return { bg: "var(--info-tint)", color: "var(--info)" };
  if (rank <= 20) return { bg: "var(--warning-tint)", color: "var(--warning)" };
  return { bg: "var(--danger-tint)", color: "var(--danger)" };
}

export async function RankTrackerView() {
  const d = db();

  const allSites = await d
    .select({ id: sites.id, name: sites.name, domain: sites.domain })
    .from(sites)
    .orderBy(sites.name);

  const rows = await d
    .select({
      id: trackedKeywords.id,
      siteId: trackedKeywords.siteId,
      siteDomain: sites.domain,
      siteName: sites.name,
      keyword: trackedKeywords.keyword,
      lastPosition: trackedKeywords.lastPosition,
      lastCheckedAt: trackedKeywords.lastCheckedAt,
      source: trackedKeywords.source,
    })
    .from(trackedKeywords)
    .leftJoin(sites, eq(sites.id, trackedKeywords.siteId))
    .where(eq(trackedKeywords.enabled, true))
    .orderBy(desc(trackedKeywords.lastCheckedAt))
    .limit(200);

  const siteIds = Array.from(new Set(rows.map((r) => r.siteId)));

  const prevPosByKey = new Map<string, number>();
  const volByKey = new Map<string, number>();

  if (siteIds.length > 0) {
    const snaps = await d
      .select({
        siteId: serpSnapshots.siteId,
        keyword: trackedKeywordsExt.keyword,
        rank: serpSnapshots.rank,
        searchVolume: serpSnapshots.searchVolume,
        snapshotDate: serpSnapshots.snapshotDate,
      })
      .from(serpSnapshots)
      .innerJoin(trackedKeywordsExt, eq(trackedKeywordsExt.id, serpSnapshots.trackedKeywordId))
      .where(inArray(serpSnapshots.siteId, siteIds))
      .orderBy(desc(serpSnapshots.snapshotDate))
      .limit(2000);

    const seenLatest = new Set<string>();
    const seenPrev = new Set<string>();
    for (const s of snaps) {
      const key = `${s.siteId}::${s.keyword.toLowerCase()}`;
      if (!seenLatest.has(key)) {
        seenLatest.add(key);
        if (s.searchVolume != null) volByKey.set(key, s.searchVolume);
      } else if (!seenPrev.has(key)) {
        seenPrev.add(key);
        if (s.rank != null) prevPosByKey.set(key, s.rank);
      }
    }
  }

  const enriched = rows.map((r) => {
    const key = `${r.siteId}::${r.keyword.toLowerCase()}`;
    const pos = r.lastPosition != null ? Number(r.lastPosition) : null;
    const prev = prevPosByKey.get(key) ?? null;
    const delta = pos != null && prev != null ? prev - pos : null;
    const movement: "up" | "down" | "same" = delta != null ? (delta > 0 ? "up" : delta < 0 ? "down" : "same") : "same";
    return {
      ...r,
      pos,
      prev,
      delta,
      movement,
      change: delta != null ? Math.abs(delta) : 0,
      volume: volByKey.get(key) ?? null,
    };
  });

  const totalKeywords = enriched.length;
  const withPos = enriched.filter((k) => k.pos != null);
  const avgPosition = withPos.length > 0
    ? (withPos.reduce((s, k) => s + (k.pos ?? 0), 0) / withPos.length).toFixed(1)
    : "—";
  const onPage1 = enriched.filter((k) => k.pos != null && k.pos <= 10).length;
  const gaining = enriched.filter((k) => k.movement === "up").length;
  const losing = enriched.filter((k) => k.movement === "down").length;

  const hasData = enriched.length > 0;
  const lastSync = enriched.find((r) => r.lastCheckedAt)?.lastCheckedAt;

  return (
    <>
      {/* Mode bar */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
            GSC + SEMrush
          </div>
          <CsvImportButton />
          {allSites.length > 0 && (
            <span className="text-xs text-text-faint">
              Tracking across {allSites.length} site{allSites.length === 1 ? "" : "s"}
            </span>
          )}
          <span className="ml-auto text-xs text-text-faint">
            {lastSync
              ? `Last synced: ${new Date(lastSync).toISOString().slice(0, 16).replace("T", " ")} UTC`
              : "No sync data yet"}
          </span>
        </div>
      </section>

      {/* Summary stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "Keywords Tracked", value: String(totalKeywords), color: "var(--info)" },
          { label: "Avg Position", value: avgPosition, color: "var(--accent)" },
          { label: "On Page 1", value: String(onPage1), color: "var(--success)" },
          { label: "Gaining", value: String(gaining), color: "var(--success)" },
          { label: "Losing", value: String(losing), color: "var(--danger)" },
          { label: "No Change", value: String(totalKeywords - gaining - losing), color: "var(--text-faint)" },
        ].map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-xl border border-border bg-surface px-4 py-3">
            <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: m.color }} />
            <div className="text-xs uppercase tracking-wider text-text-faint">{m.label}</div>
            <div className="mt-1 text-2xl font-medium tabular-nums text-text">{m.value}</div>
          </div>
        ))}
      </section>

      {!hasData ? (
        <EmptyState
          glyph="search"
          title="No rank tracking data yet"
          description="Keywords are tracked automatically when you connect sites with GSC, or run SEMrush research from the Keyword Scout tab. You can also import keywords via CSV."
        />
      ) : (
        <section className="rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-faint">
                  <th className="px-5 py-3 font-medium">Keyword</th>
                  <th className="px-3 py-3 font-medium">Site</th>
                  <th className="px-3 py-3 font-medium text-center">Rank</th>
                  <th className="px-3 py-3 font-medium text-center">Prev</th>
                  <th className="px-3 py-3 font-medium text-center">Movement</th>
                  <th className="px-3 py-3 font-medium text-right">Volume</th>
                  <th className="px-3 py-3 font-medium text-right">Source</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((kw) => {
                  const rc = kw.pos != null ? rankColor(kw.pos) : { bg: "var(--surface-2)", color: "var(--text-faint)" };
                  return (
                    <tr key={kw.id} className="border-b border-border last:border-0 transition-colors hover:bg-surface-2">
                      <td className="px-5 py-2.5">
                        <span className="text-sm font-medium text-text">{kw.keyword}</span>
                        {kw.source && kw.source !== "auto" && (
                          <span className="ml-2 rounded-full bg-info-tint px-1.5 py-0.5 text-[9px] font-medium text-info">
                            SEMrush
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-text-faint">{kw.siteDomain ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {kw.pos != null ? (
                          <span
                            className="inline-block min-w-[2rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums"
                            style={{ background: rc.bg, color: rc.color }}
                          >
                            #{kw.pos}
                          </span>
                        ) : (
                          <span className="text-xs text-text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono text-xs text-text-faint">
                          {kw.prev != null ? `#${kw.prev}` : "—"}
                        </span>
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
                        <span className="font-mono text-xs text-text-faint">
                          {kw.volume != null ? kw.volume.toLocaleString() : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs text-text-faint">
                          {kw.source && kw.source !== "auto" ? "SEMrush" : "GSC"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
