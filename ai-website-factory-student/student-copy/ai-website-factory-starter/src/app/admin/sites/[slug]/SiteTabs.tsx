"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Horizontal tab bar for the per-site drill-in. Lives at the top of every
 * /admin/sites/[slug]/* page so the operator can swing between dimensions
 * without losing context.
 */
const TABS = [
  { key: "overview",    label: "Overview",    path: "" },
  { key: "health",      label: "Health",      path: "health" },
  { key: "ranks",       label: "Ranks",       path: "ranks" },
  { key: "fixes",       label: "Fixes",       path: "fixes" },
  { key: "gbp",         label: "GBP",         path: "gbp" },
  { key: "pages",       label: "Pages",       path: "pages" },
  { key: "screenshots", label: "Screenshots", path: "screenshots" },
  { key: "local",       label: "Local SEO",   path: "local" },
  { key: "qa",          label: "QA",          path: "qa" },
  { key: "brand",       label: "Brand",       path: "brand" },
  { key: "pricing",     label: "Pricing",     path: "pricing" },
  { key: "credentials", label: "Credentials", path: "credentials" },
] as const;

export function SiteTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/admin/sites/${slug}`;

  return (
    <div className="-mx-3 mb-6 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <nav
        role="tablist"
        className="inline-flex min-w-full border-b border-border"
      >
        {TABS.map((t) => {
          const href = t.path ? `${base}/${t.path}` : base;
          // For Overview, normalize the path (strip trailing slash) before
          // comparing — Next can sometimes route /admin/sites/<slug>/ as the
          // overview, and we don't want the tab to silently un-highlight.
          const normalized = pathname.replace(/\/$/, "");
          const active =
            t.path === ""
              ? normalized === base
              : normalized === href || normalized.startsWith(`${href}/`);
          return (
            <Link
              key={t.key}
              href={href}
              role="tab"
              aria-selected={active}
              className={cn(
                "inline-flex h-9 shrink-0 items-center px-3 text-sm font-medium transition-colors",
                "border-b-2 -mb-px",
                active
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
