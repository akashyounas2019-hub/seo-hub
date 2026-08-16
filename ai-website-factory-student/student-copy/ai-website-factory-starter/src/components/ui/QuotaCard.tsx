import { cn } from "@/lib/utils";

const TONE_STYLES = {
  ok: { text: "text-success", bar: "bg-success", ring: "ring-success/30" },
  warning: { text: "text-warning", bar: "bg-warning", ring: "ring-warning/30" },
  danger: { text: "text-danger", bar: "bg-danger", ring: "ring-danger/30" },
} as const;

/**
 * Usage-vs-cap indicator with a filled bar. Tone is computed by the caller
 * (>50% used = warning, near-cap = danger) so this stays presentational.
 */
export function QuotaCard({
  label,
  used,
  cap,
  pct,
  tone,
  hint,
}: {
  label: string;
  used: number;
  cap: number;
  pct: number;
  tone: "ok" | "warning" | "danger";
  hint?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div
      className={cn(
        "rounded-xl border border-border px-4 py-3.5 ring-1 ring-inset",
        t.ring,
      )}
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
          {label}
        </span>
        <span className={cn("tnum text-sm font-semibold", t.text)}>{pct}%</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-2xl font-semibold leading-none tracking-tight text-text">{used}</span>
        <span className="tnum text-sm font-medium text-text-muted">/ {cap} today</span>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", t.bar)}
          style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
        />
      </div>
      {hint ? <p className="mt-2 text-xs text-text-faint">{hint}</p> : null}
    </div>
  );
}
