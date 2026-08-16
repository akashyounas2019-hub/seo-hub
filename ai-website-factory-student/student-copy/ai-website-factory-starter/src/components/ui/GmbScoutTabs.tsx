"use client";

/**
 * Horizontal tab strip shared by the five "GMB Scout" screens. Each tab is a
 * route Link (separate pages, not query-param tabs) — same pattern as
 * ContentScoutTabs / DesigningScoutTabs.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/rubric", label: "Local SEO Rubric" },
  { href: "/admin/local", label: "Local SEO & GBP" },
  { href: "/admin/citations", label: "Citation Gaps" },
  { href: "/admin/heatmaps", label: "Local Heatmaps" },
  { href: "/admin/gmb/post-generator", label: "Post Generator" },
] as const;

export function GmbScoutTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const isActive = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
            style={
              isActive
                ? {
                    background: "var(--success)",
                    color: "var(--success-fg, #06281b)",
                    boxShadow: "0 1px 2px var(--success-tint)",
                  }
                : {
                    background: "var(--info-tint)",
                    color: "var(--info)",
                    border: "1px solid var(--border-strong)",
                  }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
