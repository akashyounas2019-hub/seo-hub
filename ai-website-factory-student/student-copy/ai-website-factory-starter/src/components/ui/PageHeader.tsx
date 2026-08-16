/**
 * Canonical page header — every admin page should use this.
 *
 * Shape:
 *   <small eyebrow uppercase faint>
 *   <H1 — 28/32 medium tight tracking>
 *   <subtitle paragraph, max 68ch>
 *   <optional right-side meta/action slot>
 *
 * Bottom hairline (auto). No `font-serif`, no `accent-tint` washes, no
 * decorative gradients. Same shape across the entire product.
 *
 * Usage:
 *   <PageHeader
 *     eyebrow="Network"
 *     title="QA Suite"
 *     subtitle="Multi-viewport tests across the 15-site network."
 *     actions={<Link href="...">Run now</Link>}
 *   />
 */
import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Optional "← Back" link href shown above the eyebrow. */
  backHref?: string;
  /** Optional "← Back" link label. Defaults to "Back". */
  backLabel?: string;
  /** The H1. Required. */
  title: string;
  /** Optional one-paragraph subtitle. Auto-truncated to 68ch. */
  subtitle?: string;
  /** Right-side area — primary action, KPI, or meta block. */
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, backHref, backLabel = "Back", title, subtitle, actions }: Props) {
  return (
    <header className="relative mb-2 pb-4">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 space-y-1.5">
          {backHref ? (
            <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text">
              <span aria-hidden>←</span> {backLabel}
            </Link>
          ) : null}
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-medium leading-tight tracking-tightish text-text">{title}</h1>
          {subtitle ? (
            <p className="text-md text-text-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <span
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-px bg-border"
      />
    </header>
  );
}
