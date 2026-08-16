import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared atoms — Daylight Indigo design system.
 *
 * Reusable primitives: progress bars, trend chips, numbered rows,
 * timeline, sparklines, status dots, primary CTA, card hairline.
 */

// ───────── Card hairline helper ─────────

/** Subtle accent gradient hairline at the top edge of a card. Place inside
 * any `relative overflow-hidden` container. */
export function CardHairline({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-3 top-0 h-px opacity-70 transition-opacity duration-200 group-hover:opacity-100", className)}
      style={{
        background:
          "linear-gradient(90deg, transparent, var(--accent), transparent)",
      }}
    />
  );
}

// ───────── TrendChip ─────────

/** Color-toned ▲/▼ delta chip. Auto-detects up/down from leading sign if
 * `tone` isn't supplied. Use inline next to a metric value. */
export function TrendChip({
  delta,
  tone = "auto",
  className,
}: {
  delta: string;
  tone?: "auto" | "up" | "down" | "flat";
  className?: string;
}) {
  const trimmed = delta.trim();
  const isDown =
    tone === "down" || (tone === "auto" && /^[\-−]/.test(trimmed));
  const isUp = tone === "up" || (tone === "auto" && /^[+↑]/.test(trimmed)) || (tone === "auto" && !isDown && /^\d/.test(trimmed));
  const color = isDown ? "text-danger" : isUp ? "text-success" : "text-text-muted";
  const glyph = isDown ? "↓" : isUp ? "↑" : "→";
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 text-xs font-medium",
        color,
        className,
      )}
    >
      <span aria-hidden>{glyph}</span>
      {trimmed.replace(/^[+\-−↑↓]+/, "")}
    </span>
  );
}

// ───────── ProgressBar ─────────

type BarTone = "accent" | "success" | "warning" | "danger" | "info";

const BAR_BG: Record<BarTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  className,
}: {
  value: number;
  max?: number;
  tone?: BarTone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn("relative h-1 w-full overflow-hidden rounded-full", className)}
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full", BAR_BG[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Multi-segment ProgressBar — pass an array of values + tones to render
 * a stacked pass/warn/fail-style bar. Useful for QA run summaries. */
export function SegmentedBar({
  segments,
  className,
}: {
  segments: Array<{ value: number; tone: BarTone; label?: string }>;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div
      className={cn("relative flex h-1.5 w-full overflow-hidden rounded-full", className)}
      style={{ background: "var(--surface-2)" }}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          title={s.label}
          className={cn(BAR_BG[s.tone])}
          style={{ width: `${(s.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

// ───────── NumberedRow ─────────

type Severity = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const SEV_BG: Record<Severity, string> = {
  neutral: "bg-border-strong",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
};

/**
 * Numbered finding row — the prototype's signature pattern for ranked or
 * ordered lists. Renders:
 *
 *   [01] · • · <main content (flex-1)> · <right meta>
 *
 * The index renders in a tabular monospaced eyebrow style; severity dot
 * sits between the number and the content. Use inside any container —
 * adjacent rows get a hairline divider via `border-t border-border`.
 */
export function NumberedRow({
  index,
  severity = "neutral",
  href,
  className,
  children,
  right,
}: {
  index: number | string;
  severity?: Severity;
  href?: string;
  className?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  const base = cn(
    "group relative flex items-center gap-3 px-4 py-3 transition-colors border-t border-border first:border-t-0",
    "hover:bg-surface-2",
    "before:absolute before:left-0 before:top-1/2 before:h-0 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:transition-all before:duration-200 before:content-['']",
    href && "cursor-pointer hover:before:h-5",
    className,
  );
  const indexLabel = typeof index === "number" ? String(index).padStart(2, "0") : index;
  const inner = (
    <>
      <span className="tnum text-xs font-semibold tracking-[0.08em] text-text-faint shrink-0 w-6">
        {indexLabel}
      </span>
      <span
        aria-hidden
        className={cn("inline-block shrink-0 h-1.5 w-1.5 rounded-full", SEV_BG[severity])}
      />
      <div className="min-w-0 flex-1">{children}</div>
      {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

// ───────── Timeline ─────────

/**
 * Vertical timeline — accent markers, single connecting line, single-line
 * or multi-line items via children. The first item gets the brighter
 * accent marker (current); subsequent items get the faint marker.
 *
 * Use for activity feeds, status transitions, comment threads, change
 * histories.
 */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ol className={cn("relative space-y-3", className)}>
      <span
        aria-hidden
        className="absolute left-[7px] top-1 bottom-1 w-px"
        style={{ background: "var(--border)" }}
      />
      {children}
    </ol>
  );
}

export function TimelineItem({
  current,
  tone,
  children,
}: {
  /** Marker is bright accent when `current` (most recent / live event). */
  current?: boolean;
  /** Override the marker color. Defaults to accent when current, faint otherwise. */
  tone?: Severity;
  children: ReactNode;
}) {
  const markerColor =
    tone === "success" ? "var(--success)" :
    tone === "warning" ? "var(--warning)" :
    tone === "danger" ? "var(--danger)" :
    tone === "info" ? "var(--info)" :
    tone === "accent" ? "var(--accent)" :
    current ? "var(--accent)" : "var(--text-faint)";
  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className="absolute left-0 top-[3px] inline-flex h-[15px] w-[15px] items-center justify-center rounded-full"
        style={{
          background: "var(--surface)",
          border: `1px solid var(--border-strong)`,
        }}
      >
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: markerColor }}
        />
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

// ───────── PrimaryCta ─────────

/**
 * The one accent-gradient call-to-action per page. Use this exactly once
 * per route — the gradient is what tells the operator "this is THE action".
 * Every other action on the page should be a ghost / outline button.
 */
export function PrimaryCta({
  href,
  type,
  onClick,
  disabled,
  className,
  children,
  size = "md",
}: {
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const sizeCls =
    size === "sm" ? "h-8 px-3 text-xs" :
    size === "lg" ? "h-11 px-5 text-sm" :
    "h-9 px-4 text-xs";
  const base = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition tabular-nums",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    sizeCls,
    className,
  );
  const style = {
    background: "linear-gradient(180deg, var(--accent-hover), var(--accent))",
    color: "var(--accent-fg)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px var(--accent-ring)",
  } as const;
  if (href) {
    return (
      <Link href={href} className={base} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={base} style={style}>
      {children}
    </button>
  );
}

/**
 * Ghost secondary button — sits next to PrimaryCta. Use for "Cancel", "View",
 * "Export", any non-primary action.
 */
export function GhostButton({
  href,
  type,
  onClick,
  disabled,
  className,
  children,
  size = "md",
}: {
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const sizeCls =
    size === "sm" ? "h-8 px-3 text-xs" :
    size === "lg" ? "h-11 px-5 text-sm" :
    "h-9 px-4 text-xs";
  const base = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition border",
    "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    sizeCls,
    className,
  );
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={base}>
      {children}
    </button>
  );
}

// ───────── HeroKPIStrip ─────────

/**
 * Canonical top-of-page KPI strip wrapper. Sets the grid to 2 / 3 / 4 / 5
 * cols responsively so every Foundation page lays out KPIs identically.
 *
 * Children are typically <Stat> components.
 */
export function HeroKPIStrip({
  columns = 5,
  className,
  children,
}: {
  columns?: 3 | 4 | 5 | 6;
  className?: string;
  children: ReactNode;
}) {
  const colsCls =
    columns === 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" :
    columns === 5 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5" :
    columns === 4 ? "grid-cols-2 md:grid-cols-4" :
    "grid-cols-2 md:grid-cols-3";
  return (
    <section className={cn("grid gap-3", colsCls, className)}>{children}</section>
  );
}

// ───────── BigHero ─────────

/**
 * Big-hero-number block — for pages where ONE metric matters most. Pairs a
 * 32-40px tabular number with a small context line + optional sparkline.
 *
 * Use on landing pages (`/admin/today`, `/admin/seo-health`) where the
 * operator's first read needs to be one number.
 */
export function BigHero({
  value,
  suffix,
  label,
  context,
  delta,
  deltaTone,
  sparkline,
  className,
}: {
  value: string | number;
  suffix?: string;
  label: string;
  context?: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "flat" | "auto";
  sparkline?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("group relative overflow-hidden rounded-xl border border-border px-5 py-4 transition-all duration-200 hover:border-border-strong hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(0,0,0,0.18),0_12px_44px_-26px_var(--accent-ring)]", className)}
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <CardHairline />
      <p className="text-xs uppercase tracking-[0.10em] font-semibold text-text-faint">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-3xl leading-none font-semibold tracking-tight text-text">
          {value}
        </span>
        {suffix ? (
          <span className="tnum text-lg font-semibold text-text-muted">{suffix}</span>
        ) : null}
        {delta ? (
          <div className="ml-auto"><TrendChip delta={delta} tone={deltaTone} /></div>
        ) : null}
      </div>
      {context ? (
        <div className="mt-2 text-xs text-text-muted leading-snug">{context}</div>
      ) : null}
      {sparkline ? <div className="mt-3">{sparkline}</div> : null}
    </div>
  );
}
