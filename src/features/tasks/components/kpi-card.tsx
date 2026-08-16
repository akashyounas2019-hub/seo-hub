import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  sub,
  pct,
  accent,
  icon: Icon,
  pulse,
}: {
  label: string;
  value: number | string;
  sub?: string;
  pct: number;
  accent: string;
  icon: LucideIcon;
  pulse?: boolean;
}) {
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3 text-cyan-300" /> {label}
            {pulse && (
              <span className="relative ml-1 flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
              </span>
            )}
          </div>
          <div className="mt-1.5 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(30 41 59)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              className={`bg-gradient-to-r ${accent}`}
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              style={{ color: "#22d3ee" }}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold text-slate-300 tabular-nums">
            {Math.round(pct)}%
          </div>
        </div>
      </div>
    </div>
  );
}
