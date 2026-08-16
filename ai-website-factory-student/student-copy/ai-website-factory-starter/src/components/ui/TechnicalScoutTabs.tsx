"use client";

/**
 * Horizontal tab strip shared by the six "Technical Scout" screens. Each tab
 * is a route Link (separate pages, not query-param tabs) — same pattern as
 * ContentScoutTabs / DesigningScoutTabs.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/tech-watchdog", label: "Tech Watchdog" },
  { href: "/admin/cwv", label: "Core Web Vitals" },
  { href: "/admin/fix-queue", label: "Fix Queue" },
  { href: "/admin/indexing", label: "Indexing" },
  { href: "/admin/index-tracker", label: "Index Tracker" },
  { href: "/admin/schema-architect", label: "Schema Architect" },
] as const;

export function TechnicalScoutTabs() {
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
