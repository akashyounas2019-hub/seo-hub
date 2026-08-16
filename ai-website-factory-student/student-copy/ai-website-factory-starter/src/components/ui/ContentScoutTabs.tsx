"use client";

/**
 * Horizontal tab strip shared by the four "Content Scout" screens. Unlike
 * KeywordTabs (query-param tabs within one route), these are separate pages —
 * so each tab is a route Link, with the active one matched against pathname.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/content-studio", label: "Content Studio" },
  { href: "/admin/content/brief", label: "Content Writing" },
  { href: "/admin/content", label: "Content Pipeline" },
  { href: "/admin/quality-checker", label: "Quality Checker" },
] as const;

export function ContentScoutTabs() {
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
