import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE_STYLES: Record<Tone, { ring: string; tintFg: string; tintBg: string }> = {
  neutral: {
    ring: "ring-border",
    tintFg: "text-text-muted",
    tintBg: "bg-surface-2",
  },
  accent: {
    ring: "ring-accent/30",
    tintFg: "text-accent",
    tintBg: "bg-accent-tint",
  },
  success: {
    ring: "ring-success/30",
    tintFg: "text-success",
    tintBg: "bg-success-tint",
  },
  warning: {
    ring: "ring-warning/30",
    tintFg: "text-warning",
    tintBg: "bg-warning-tint",
  },
  danger: {
    ring: "ring-danger/30",
    tintFg: "text-danger",
    tintBg: "bg-danger-tint",
  },
  info: {
    ring: "ring-info/30",
    tintFg: "text-info",
    tintBg: "bg-info-tint",
  },
};

export type StatProps = {
  label: string;
  value: string | number;
  /** Suffix shown next to the value in muted style, e.g. "/ 50" or "%" */
  suffix?: string;
  /** Optional delta — e.g. "+12%" or "-3.2%" */
  delta?: string;
  /** Drives delta chip color: up = success, down = danger, neutral = muted */
  deltaTone?: "up" | "down" | "neutral";
  /** Tint the whole tile (warning when overdue, danger on alerts, etc.) */
  tone?: Tone;
  /** Show a pulsing live-dot in the top right (online/active) */
  live?: boolean;
  /** Make the entire tile a link */
  href?: string;
  /** Optional small sparkline svg as a child */
  sparkline?: React.ReactNode;
  className?: string;
};

export function Stat({
  label,
  value,
  suffix,
  delta,
  deltaTone = "neutral",
  tone = "neutral",
  live = false,
  href,
  sparkline,
  className,
}: StatProps) {
  const t = TONE_STYLES[tone];
  const inner = (
    <div
      className={cn(
        // Obsidian Gold treatment: layered surface→surface-2 gradient,
        // gold-hairline top accent, subtle border, hover lifts to surface-2.
        "group relative overflow-hidden rounded-xl border border-border px-4 py-3.5 transition-all duration-200",
        "hover:border-border-strong hover:-translate-y-0.5",
        "hover:shadow-[0_14px_30px_-16px_rgba(0,0,0,0.18),0_12px_44px_-26px_var(--accent-ring)]",
        tone !== "neutral" && `${t.tintFg}`,
        className,
      )}
      style={{
        background: "linear-gradient(180deg, var(--surface), var(--surface-2))",
      }}
    >
      {/* Top hairline — subtle gold gradient line inset from edges */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent), transparent)",
        }}
      />
      <div className="flex items-center justify-between">
        <span className="truncate text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">
          {label}
        </span>
        {live ? (
          <span className="live-dot shrink-0" aria-label="live" />
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-3xl font-semibold leading-none tracking-tight text-text">
          {value}
        </span>
        {suffix ? (
          <span className="tnum text-sm font-semibold text-text-muted">{suffix}</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {delta ? (
          <span
            className={cn(
              "tnum inline-flex items-center gap-0.5 text-xs font-medium",
              deltaTone === "up" && "text-success",
              deltaTone === "down" && "text-danger",
              deltaTone === "neutral" && "text-text-muted",
            )}
          >
            {deltaTone === "up" ? "↑" : deltaTone === "down" ? "↓" : "→"} {delta}
          </span>
        ) : <span />}
        {sparkline ? <div className="h-5 -mr-0.5">{sparkline}</div> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-xl"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

/** Strip variant for inline KPI rows. Always 2-up on mobile so tiny screens
 *  show stats side-by-side instead of one giant column. */
export function StatStrip({ children, columns = 4 }: { children: React.ReactNode; columns?: number }) {
  const cols =
    columns === 5
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      : columns === 4
        ? "grid-cols-2 md:grid-cols-4"
        : columns === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-2";
  return <section className={cn("grid gap-2.5 sm:gap-3", cols)}>{children}</section>;
}
