"use client";

/**
 * Consolidated GSC movers widget — replaces the six individual "Pages up",
 * "Pages down", "CTR up", "CTR down", "Keywords up", "Keywords down" boxes
 * with a single card + tabbed navigation.
 *
 * Each tab shows the "up" and "down" table side-by-side (or stacked on
 * mobile). The tab bar sits at the top of the card so the operator's eye
 * always finds the switcher first.
 */

import { useState } from "react";
import type { MoverRow } from "@/lib/gsc-deep-dive";

const CYAN = "#22d3ee";
const BORDER = "rgba(34, 211, 238, 0.15)";
const PANEL = "#0f1c33";

type TabId = "pages" | "keywords" | "ctr";

type Props = {
  pagesUp: MoverRow[];
  pagesDown: MoverRow[];
  queriesUp: MoverRow[];
  queriesDown: MoverRow[];
  ctrPagesUp: MoverRow[];
  ctrPagesDown: MoverRow[];
};

const TABS: Array<{ id: TabId; label: string; sub: string }> = [
  { id: "pages", label: "Pages Ranking", sub: "Up & down by position" },
  { id: "keywords", label: "Keyword Ranking", sub: "Up & down by position" },
  { id: "ctr", label: "CTR Performance", sub: "CTR gainers & decliners" },
];

export function RankingPerformanceWidget(props: Props) {
  const [tab, setTab] = useState<TabId>("pages");

  const totalPerTab: Record<TabId, number> = {
    pages: props.pagesUp.length + props.pagesDown.length,
    keywords: props.queriesUp.length + props.queriesDown.length,
    ctr: props.ctrPagesUp.length + props.ctrPagesDown.length,
  };

  return (
    <section
      className="rounded-xl border"
      style={{ background: PANEL, borderColor: BORDER }}
    >
      {/* Header + tab bar */}
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BORDER }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#f1f5f9" }}>
            Ranking &amp; Performance
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Gainers and decliners across the last two GSC sync windows
          </p>
        </div>
        <nav
          role="tablist"
          className="inline-flex flex-wrap gap-1 rounded-lg border p-1"
          style={{ borderColor: BORDER, background: "rgba(15, 28, 51, 0.6)" }}
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-all"
                style={
                  active
                    ? {
                        background: CYAN,
                        color: "#0a1428",
                        boxShadow: "0 2px 8px -2px rgba(34, 211, 238, 0.5)",
                      }
                    : {
                        color: "#94a3b8",
                        background: "transparent",
                      }
                }
              >
                {t.label}
                <span
                  className="ml-1.5 rounded-full px-1.5 text-[9px] tabular-nums"
                  style={{
                    background: active ? "rgba(10, 20, 40, 0.25)" : "rgba(148, 163, 184, 0.1)",
                    color: active ? "#0a1428" : "#64748b",
                  }}
                >
                  {totalPerTab[t.id]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panels */}
      <div className="p-5">
        {tab === "pages" ? (
          <TabPanels
            up={{ title: "Pages ranking up", rows: props.pagesUp, metric: "position" }}
            down={{ title: "Pages ranking down", rows: props.pagesDown, metric: "position" }}
            emptyUp="No page gainers in the last sync window. This is normal if rankings are stable."
            emptyDown="No page decliners in the last sync window. Nice."
          />
        ) : tab === "keywords" ? (
          <TabPanels
            up={{ title: "Keywords ranking up", rows: props.queriesUp, metric: "position" }}
            down={{ title: "Keywords ranking down", rows: props.queriesDown, metric: "position" }}
            emptyUp="No keyword gainers in the last sync window."
            emptyDown="No keyword decliners in the last sync window."
          />
        ) : (
          <TabPanels
            up={{ title: "Pages: CTR up", rows: props.ctrPagesUp, metric: "ctr" }}
            down={{ title: "Pages: CTR down", rows: props.ctrPagesDown, metric: "ctr" }}
            emptyUp="No pages with a meaningful CTR improvement. Requires ≥50 impressions in both windows."
            emptyDown="No pages with a meaningful CTR drop. Requires ≥50 impressions in both windows."
          />
        )}
      </div>
    </section>
  );
}

function TabPanels({
  up,
  down,
  emptyUp,
  emptyDown,
}: {
  up: { title: string; rows: MoverRow[]; metric: "position" | "ctr" };
  down: { title: string; rows: MoverRow[]; metric: "position" | "ctr" };
  emptyUp: string;
  emptyDown: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InnerMoverTable title={up.title} rows={up.rows} tone="good" metric={up.metric} emptyMsg={emptyUp} />
      <InnerMoverTable title={down.title} rows={down.rows} tone="bad" metric={down.metric} emptyMsg={emptyDown} />
    </div>
  );
}

function InnerMoverTable({
  title,
  rows,
  tone,
  emptyMsg,
  metric,
}: {
  title: string;
  rows: MoverRow[];
  tone: "good" | "bad";
  emptyMsg: string;
  metric: "position" | "ctr";
}) {
  const deltaColor = tone === "good" ? "text-emerald-400" : "text-rose-400";
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "rgba(10, 20, 40, 0.4)", borderColor: BORDER }}
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>
          {title}
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">
          {rows.length} shown
        </span>
      </header>
      {rows.length === 0 ? (
        <div
          className="rounded-md border border-dashed p-3 text-[11px] text-slate-400"
          style={{ borderColor: BORDER }}
        >
          {emptyMsg}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                <th className="pb-2 text-left font-medium">Key</th>
                <th className="pb-2 text-right font-medium">Clicks</th>
                <th className="pb-2 text-right font-medium">Δ Clicks</th>
                {metric === "position" ? (
                  <>
                    <th className="pb-2 text-right font-medium">Position</th>
                    <th className="pb-2 text-right font-medium">Δ Pos</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 text-right font-medium">CTR</th>
                    <th className="pb-2 text-right font-medium">Δ CTR</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: BORDER }}>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderColor: BORDER }}>
                  <td className="max-w-[220px] truncate py-2 text-slate-200" title={r.key}>
                    {r.key}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-300">
                    {r.clicksRecent.toLocaleString()}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${deltaColor}`}>
                    {r.clicksDelta > 0 ? "+" : ""}
                    {r.clicksDelta.toLocaleString()}
                  </td>
                  {metric === "position" ? (
                    <>
                      <td className="py-2 text-right tabular-nums text-slate-300">
                        {r.positionRecent > 0 ? r.positionRecent.toFixed(1) : "—"}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          r.positionDelta < 0
                            ? "text-emerald-400"
                            : r.positionDelta > 0
                              ? "text-rose-400"
                              : "text-slate-500"
                        }`}
                      >
                        {r.positionDelta === 0
                          ? "—"
                          : `${r.positionDelta > 0 ? "+" : ""}${r.positionDelta.toFixed(1)}`}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-right tabular-nums text-slate-300">
                        {(r.ctrRecent * 100).toFixed(2)}%
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          r.ctrDeltaPp > 0
                            ? "text-emerald-400"
                            : r.ctrDeltaPp < 0
                              ? "text-rose-400"
                              : "text-slate-500"
                        }`}
                        title="Change in click-through rate, in percentage points"
                      >
                        {r.ctrDeltaPp === 0
                          ? "—"
                          : `${r.ctrDeltaPp > 0 ? "+" : ""}${r.ctrDeltaPp.toFixed(2)}pp`}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
