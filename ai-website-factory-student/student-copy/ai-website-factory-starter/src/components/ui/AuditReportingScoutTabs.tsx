"use client";

/**
 * Horizontal tab strip shared by the six "Audit and Reporting Scout"
 * screens. Each tab is a route Link (separate pages, not query-param tabs) —
 * same pattern as ContentScoutTabs / DesigningScoutTabs.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/seo-health", label: "SEO Health" },
  { href: "/admin/seo", label: "SEO Inbox" },
  { href: "/admin/site-audit", label: "Site Audit" },
  { href: "/admin/cold-audit", label: "Cold Audit" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/roi", label: "ROI & Leads" },
] as const;

export function AuditReportingScoutTabs() {
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
