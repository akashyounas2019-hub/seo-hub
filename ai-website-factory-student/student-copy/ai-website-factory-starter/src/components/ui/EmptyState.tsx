import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Empty state — used everywhere a list/table/board comes up with no data.
 * Built around a small isomorphic SVG glyph + a one-liner + optional CTA.
 *
 * Variant `glyph` picks one of the inline SVGs below. They're all rendered in
 * `text-text-faint` and use `currentColor`, so they automatically adopt the
 * theme. Geometric, not character art — keeps it from feeling like a 2014
 * onboarding flow.
 */

type GlyphName =
  | "inbox"
  | "tasks"
  | "sites"
  | "users"
  | "chat"
  | "notifications"
  | "calls"
  | "payments"
  | "search"
  | "calendar"
  | "spark";

export function EmptyState({
  glyph = "inbox",
  title,
  description,
  action,
  className,
}: {
  glyph?: GlyphName;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 text-text-faint">
        <Glyph name={glyph} />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description ? (
        <div className="mt-1.5 max-w-md text-xs leading-relaxed text-text-muted">
          {description}
        </div>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Compact inline empty state — for use inside a RowList that has its own bordered container. */
export function EmptyRow({
  glyph,
  children,
}: {
  glyph?: GlyphName;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-8 text-center">
      {glyph ? (
        <span className="text-text-faint">
          <Glyph name={glyph} size={22} />
        </span>
      ) : null}
      <span className="text-xs text-text-faint">{children}</span>
    </div>
  );
}

function Glyph({ name, size = 36 }: { name: GlyphName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 36 36",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "inbox":
      return (
        <svg {...common}>
          <rect x="6" y="9" width="24" height="18" rx="2" />
          <path d="M6 20h7l1.5 3h7L23 20h7" />
          <path d="M11 13.5h14M11 16.5h10" opacity="0.4" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="24" height="24" rx="2.5" />
          <path d="m11 12 1.5 1.5L16 10" />
          <path d="m11 19.5 1.5 1.5L16 17.5" />
          <path d="m11 27 1.5 1.5L16 25" />
          <path d="M19.5 13h6M19.5 20.5h4M19.5 28h5" opacity="0.4" />
        </svg>
      );
    case "sites":
      return (
        <svg {...common}>
          <circle cx="18" cy="18" r="12" />
          <path d="M6 18h24" />
          <path d="M18 6c3.5 4 5 8 5 12s-1.5 8-5 12c-3.5-4-5-8-5-12s1.5-8 5-12Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="14" cy="14" r="4.5" />
          <path d="M6 28c0-4.5 3.6-7 8-7s8 2.5 8 7" />
          <circle cx="24" cy="15" r="3.5" />
          <path d="M30 26.5c0-3.2-2.4-5-6.5-5" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M6 9.5a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-9l-6 5v-5H9a3 3 0 0 1-3-3v-12Z" />
          <path d="M11 14h14M11 18h9" opacity="0.4" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M9 23V15a9 9 0 0 1 18 0v8l2.5 3h-23l2.5-3Z" />
          <path d="M15 29a3 3 0 0 0 6 0" />
          <circle cx="27" cy="9" r="3" fill="currentColor" opacity="0.4" />
        </svg>
      );
    case "calls":
      return (
        <svg {...common}>
          <path d="M8 9.5a2.5 2.5 0 0 1 2.5-2.5h4l2.5 6.5L13 16.5c2 3.5 4.5 6 8 8l3-4 6.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5C17 29.5 8 20.5 8 9.5Z" />
        </svg>
      );
    case "payments":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="26" height="18" rx="2.5" />
          <path d="M5 16h26" />
          <path d="M10 23h5M19 23h7" opacity="0.4" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="15" cy="15" r="9" />
          <path d="m22 22 7 7" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="5" y="8" width="26" height="22" rx="2" />
          <path d="M5 14h26M11 5v6M25 5v6" />
          <rect x="10" y="18" width="5" height="4" rx="0.5" opacity="0.4" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M5 24h6l4-10 6 14 4-12h6" />
          <path d="M18 6v4M14 8l8 0" opacity="0.4" />
        </svg>
      );
  }
}
