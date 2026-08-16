import Link from "next/link";
import { cn } from "@/lib/utils";

type DotTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const DOT_CLASS: Record<DotTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-border-strong",
  accent: "bg-accent",
};

/** A 6px status dot — use this instead of a status pill when status is secondary.
 *
 * Pass `pulse` to wrap with the live-dot animation (used for real-time signals:
 * agent running, job in flight, online users). The `size` prop accepts numeric
 * pixel sizes or "sm" (5) / "md" (6, default) / "lg" (8). */
export function StatusDot({
  tone = "neutral",
  pulse,
  size = "md",
  className,
}: {
  tone?: DotTone;
  pulse?: boolean;
  size?: "sm" | "md" | "lg" | number;
  className?: string;
}) {
  const px = typeof size === "number" ? size : size === "sm" ? 5 : size === "lg" ? 8 : 6;
  const dotClass = DOT_CLASS[tone];
  if (pulse) {
    return (
      <span aria-hidden className={cn("relative inline-block shrink-0", className)} style={{ width: px, height: px }}>
        <span className={cn("absolute inset-0 rounded-full opacity-70 animate-ping", dotClass)} />
        <span className={cn("relative inline-block h-full w-full rounded-full", dotClass)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", dotClass, className)}
      style={{ width: px, height: px }}
    />
  );
}

/** Inline pill — use when status IS the primary signal */
export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: DotTone;
  children: React.ReactNode;
  className?: string;
}) {
  const fg: Record<DotTone, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
    neutral: "text-text-muted",
    accent: "text-accent",
  };
  const bg: Record<DotTone, string> = {
    success: "bg-success-tint",
    warning: "bg-warning-tint",
    danger: "bg-danger-tint",
    info: "bg-info-tint",
    neutral: "bg-surface-2",
    accent: "bg-accent-tint",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.04em]",
        fg[tone],
        bg[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Dense list row — Plain / Linear pattern. 44px tall, hairline divider, hover-bg-swap,
 * no zebra. Use inside a <ul> or <div role="list">.
 */
export function Row({
  href,
  className,
  children,
  onClick,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const base = cn(
    "group relative flex min-h-11 items-center gap-2 px-3 py-3 border-b border-border last:border-b-0",
    "sm:gap-3 sm:px-4 sm:py-3",
    "transition-colors duration-150",
    "hover:bg-surface-2",
    "before:absolute before:left-0 before:top-1/2 before:h-0 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:transition-all before:duration-200 before:content-['']",
    href || onClick ? "cursor-pointer hover:before:h-5" : "",
    "focus-visible:outline-none focus-visible:bg-surface-2",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "w-full text-left")}>
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

/** Section wrapper that gives Rows a hairline-bordered container with optional header + footer */
export function RowList({
  title,
  count,
  trailing,
  footer,
  className,
  children,
}: {
  title?: string;
  count?: number;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-surface shadow-sm", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            {title}
            {typeof count === "number" ? (
              <span className="tnum ml-1.5 text-text-faint/80">{count}</span>
            ) : null}
          </h2>
          {trailing}
        </div>
      ) : null}
      <div role="list">{children}</div>
      {footer ? (
        <div className="border-t border-border px-4 py-2 text-xs text-text-faint">{footer}</div>
      ) : null}
    </section>
  );
}
