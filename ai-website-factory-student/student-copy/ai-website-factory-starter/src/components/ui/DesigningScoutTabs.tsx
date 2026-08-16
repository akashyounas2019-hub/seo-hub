"use client";

/**
 * Horizontal tab strip shared by the four "Designing Scout" screens. Each
 * tab is a route Link (separate pages, not query-param tabs), with the
 * active one matched against pathname — same pattern as ContentScoutTabs.
 *
 * "Build Agent" links out to the existing /admin/build site-builder (System
 * nav) rather than duplicating it — it's surfaced here too since starting a
 * build is a natural next step after a design research run.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/design-research", label: "Design Researcher" },
  { href: "/admin/design", label: "Page Designer" },
  { href: "/admin/gmb/image-generator", label: "GMB Image Generator" },
  { href: "/admin/build", label: "Build Agent" },
] as const;

export function DesigningScoutTabs() {
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
