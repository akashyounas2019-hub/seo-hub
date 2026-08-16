"use client";

/**
 * Global breadcrumb + Back bar. Rendered ONCE in admin/layout.tsx, pinned at
 * the top of the main content column, so all 101 admin pages inherit it with
 * zero per-page edits.
 *
 * Trail shape:  ← Back   Dashboard / <Section> / <Page> / <child…>
 *
 * Labels are derived from the shared nav-config (single source of truth, also
 * used by the sidebar). Dynamic id/slug segments render the raw value (or a
 * generic label) and are NOT links. Every crumb except the last is a real
 * <Link>. On the root (/admin/inbox) the whole bar is hidden.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DASHBOARD_HREF,
  DASHBOARD_LABEL,
  ROUTE_LABELS,
  humanizeSegment,
  looksLikeId,
  sectionForHref,
} from "@/app/admin/nav-config";

type Crumb = { label: string; href?: string };

/** Build the crumb list for a pathname. Exported for unit-testing / reuse. */
export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean); // ["admin", "sites", "taxi", ...]
  if (segments[0] !== "admin") return [];

  const crumbs: Crumb[] = [{ label: DASHBOARD_LABEL, href: DASHBOARD_HREF }];

  // Insert the SECTION crumb (Today / Network / SEO & monitoring / Tools) if the
  // current route belongs to one. It's a context label, not a link target.
  const section = sectionForHref(pathname);
  if (section) crumbs.push({ label: section });

  // Walk every segment after "admin", accumulating the href as we go.
  let acc = "/admin";
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    const isLast = i === segments.length - 1;

    let label: string;
    if (looksLikeId(seg)) {
      // Dynamic [id]/[slug]: show the raw value, but trim long uuids/hex.
      label = seg.length > 12 && /^[0-9a-f-]+$/i.test(seg) ? `${seg.slice(0, 8)}…` : seg;
    } else {
      label = ROUTE_LABELS[seg] ?? humanizeSegment(seg);
    }

    // Last crumb is plain text (you-are-here). Dynamic id segments are never
    // links (no guaranteed index route). Everything else links to its href.
    const linkable = !isLast && !looksLikeId(seg);
    crumbs.push(linkable ? { label, href: acc } : { label });
  }

  return crumbs;
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      aria-label="Go back"
      title="Go back"
    >
      <span aria-hidden>←</span>
      <span className="hidden sm:inline">Back</span>
    </button>
  );
}

function Separator() {
  return (
    <span aria-hidden className="select-none text-text-faint/60">
      /
    </span>
  );
}

export function Breadcrumbs() {
  const pathname = usePathname();
  // Hide entirely on the dashboard root — nowhere to go "up" or "back".
  if (pathname === DASHBOARD_HREF) return null;
  // Dark-themed pages render their own header with the correct palette. The
  // shared breadcrumb bar would sit on a light-neutral background above the
  // dark panel and look broken, so we opt those routes out.
  if (pathname === "/admin/gsc" || pathname.startsWith("/admin/gsc/")) return null;

  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="-mx-3 mb-4 flex items-center gap-2 border-b border-border px-3 py-2 sm:-mx-4 sm:px-4 md:-mx-5 md:px-5"
    >
      <BackButton />
      <ol className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <Separator /> : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate text-text-muted transition-colors hover:text-text"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? "truncate font-medium text-text"
                      : "truncate text-text-faint"
                  }
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
