import type { Zap } from "lucide-react";

export function AutomationKpiCard({
  label,
  value,
  sub,
  percent,
  ringFrom,
  ringTo,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  percent: number;
  ringFrom: string;
  ringTo: string;
  icon: typeof Zap;
  active?: boolean;
  onClick?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const gradId = `kpi-${label.replace(/\s+/g, "-")}`;
  const clickable = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-cyan-400/50 bg-slate-900/70 shadow-[0_0_25px_rgba(34,211,238,0.12)]"
          : "border-slate-800 bg-slate-900/40"
      } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70" : "cursor-default"}`}
    >
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${ringFrom}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3" style={{ color: ringFrom }} />
            {label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">
            {value}
          </div>
          {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
        </div>
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ringFrom} />
                <stop offset="100%" stopColor={ringTo} />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgb(30 41 59)"
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={`url(#${gradId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold text-slate-300 tabular-nums">
            {Math.round(pct)}%
          </div>
        </div>
      </div>
    </button>
  );
}
