import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { GmbScoutTabs } from "@/components/ui/GmbScoutTabs";

export const dynamic = "force-dynamic";

const grid: { name: string; rank: number }[][] = [
  [
    { name: "JLT", rank: 2 },
    { name: "Marina", rank: 1 },
    { name: "JBR", rank: 3 },
    { name: "Palm Jumeirah", rank: 5 },
    { name: "Media City", rank: 8 },
    { name: "Internet City", rank: 7 },
    { name: "Knowledge Park", rank: 12 },
  ],
  [
    { name: "Downtown", rank: 1 },
    { name: "DIFC", rank: 4 },
    { name: "Business Bay", rank: 6 },
    { name: "City Walk", rank: 9 },
    { name: "Jumeirah", rank: 3 },
    { name: "Al Wasl", rank: 11 },
    { name: "Al Quoz", rank: 16 },
  ],
  [
    { name: "Deira", rank: 14 },
    { name: "Bur Dubai", rank: 18 },
    { name: "Al Karama", rank: 22 },
    { name: "Oud Metha", rank: 15 },
    { name: "Healthcare City", rank: 19 },
    { name: "Al Garhoud", rank: 13 },
    { name: "Festival City", rank: 10 },
  ],
  [
    { name: "Silicon Oasis", rank: 25 },
    { name: "Sports City", rank: 21 },
    { name: "Motor City", rank: 28 },
    { name: "Arabian Ranches", rank: 24 },
    { name: "Al Barsha", rank: 17 },
    { name: "Al Nahda", rank: 23 },
    { name: "International City", rank: 30 },
  ],
];

const allCells = grid.flat();
const ranks = allCells.map((c) => c.rank);
const avgRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
const bestRank = Math.min(...ranks);
const worstRank = Math.max(...ranks);
const deadZones = allCells.filter((c) => c.rank > 20);

function cellBg(rank: number): string {
  if (rank <= 3) return "#22c55e";
  if (rank <= 10) return "#3b82f6";
  if (rank <= 20) return "#f59e0b";
  return "#ef4444";
}

function cellTextColor(rank: number): string {
  if (rank <= 3) return "#052e16";
  if (rank <= 10) return "#0c1e3e";
  if (rank <= 20) return "#451a03";
  return "#450a0a";
}

export default async function HeatmapsPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Local Heatmaps"
        subtitle="Geo-grid rank tracking across city neighborhoods — find dead zones and generate targeted neighborhood pages."
      />

      <GmbScoutTabs />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Avg. Rank", value: String(avgRank), color: "var(--info)", tint: "var(--info-tint)" },
          { label: "Best Rank", value: String(bestRank), color: "var(--success)", tint: "var(--success-tint)" },
          { label: "Worst Rank", value: String(worstRank), color: "var(--danger)", tint: "var(--danger-tint)" },
          { label: "Dead Zones", value: String(deadZones.length), color: "var(--warning)", tint: "var(--warning-tint)" },
        ].map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-lg border border-border bg-surface p-3">
            <div className="absolute left-0 top-0 h-[3px] w-full" style={{ background: m.color }} />
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">{m.label}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-text">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-2.5">
        <span className="text-xs font-medium text-text-faint">Legend:</span>
        {[
          { label: "1-3", color: "#22c55e" },
          { label: "4-10", color: "#3b82f6" },
          { label: "11-20", color: "#f59e0b" },
          { label: "20+", color: "#ef4444" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: l.color }}
            />
            {l.label}
          </span>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-2">
          {grid.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7 gap-2">
              {row.map((cell) => (
                <div
                  key={cell.name}
                  className="flex flex-col items-center justify-center rounded-lg px-1 py-3 text-center"
                  style={{ background: cellBg(cell.rank) }}
                >
                  <span
                    className="text-lg font-bold leading-none"
                    style={{ color: cellTextColor(cell.rank) }}
                  >
                    {cell.rank}
                  </span>
                  <span
                    className="mt-1 text-[9px] font-medium leading-tight"
                    style={{ color: cellTextColor(cell.rank), opacity: 0.8 }}
                  >
                    {cell.name}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Dead zones panel */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Dead Zones</h2>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--danger-tint)", color: "var(--danger)" }}
          >
            {deadZones.length} areas
          </span>
        </div>
        <p className="mb-3 text-xs text-text-muted">
          Neighborhoods where your rank is 20+ — you are effectively invisible. Create targeted landing pages to capture these areas.
        </p>
        <div className="space-y-2">
          {deadZones.map((zone) => (
            <div
              key={zone.name}
              className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: "#ef4444" }}
                />
                <span className="text-xs font-medium text-text">{zone.name}</span>
                <span className="text-[10px] text-text-faint">Rank #{zone.rank}</span>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
              >
                Create page
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
