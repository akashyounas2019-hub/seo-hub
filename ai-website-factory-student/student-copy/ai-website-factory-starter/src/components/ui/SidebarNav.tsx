"use client";

/**
 * Client sidebar nav. Renders the nav tree from the shared nav-config (single
 * source of truth — Breadcrumbs reads the same module) and highlights the link
 * for the current route via usePathname().
 *
 * Active-state: the deepest nav item whose href prefixes the current path wins
 * (so /admin/sites/taxi still lights up "All sites"). The active item gets an
 * accent-tinted background, accent text, and a left accent bar.
 *
 * Sections marked `defaultCollapsed` render collapsed behind a clickable header
 * so the everyday menu stays short — they auto-expand when the current route
 * lives inside them.
 *
 * Icons are passed in from layout.tsx as a name→node map so this client island
 * doesn't pull the whole Icon module into the client bundle by string eval.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NAV_SECTIONS, PINNED_ITEMS, type NavItem, type NavSection } from "@/app/admin/nav-config";
import { cn } from "@/lib/utils";

type IconMap = Record<string, ReactNode>;
type BadgeMap = Partial<Record<NonNullable<NavItem["badge"]>, number>>;

/** Pick the single best-matching nav href for the current path: the longest
 *  item href that equals the path or is a prefix of it. */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const it of items) {
    if (pathname === it.href || pathname.startsWith(it.href + "/")) {
      if (!best || it.href.length > best.length) best = it.href;
    }
  }
  return best;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarNav({
  icons,
  badges,
  collapsed,
  isAdmin,
}: {
  icons: IconMap;
  badges: BadgeMap;
  collapsed: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  const visiblePinned = PINNED_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const visibleSections = NAV_SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.adminOnly || isAdmin),
  }));
  const allItems = [...visiblePinned, ...visibleSections.flatMap((s) => s.items)];
  const active = activeHref(pathname, allItems);

  return (
    <nav className="mt-5 flex flex-1 flex-col gap-0.5 px-2 text-base">
      <div className="flex flex-col gap-0.5">
        {visiblePinned.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={active === item.href}
            icons={icons}
            badges={badges}
            railCollapsed={collapsed}
          />
        ))}
      </div>
      {visibleSections.map((section) => (
        <NavGroup
          key={section.label}
          section={section}
          active={active}
          icons={icons}
          badges={badges}
          railCollapsed={collapsed}
        />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  isActive,
  icons,
  badges,
  railCollapsed,
}: {
  item: NavItem;
  isActive: boolean;
  icons: IconMap;
  badges: BadgeMap;
  railCollapsed: boolean;
}) {
  const badge = item.badge ? badges[item.badge] : undefined;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-base font-medium text-text-muted transition-all duration-150",
        "hover:bg-surface-2 hover:text-text",
        item.emphasis &&
          !isActive &&
          "text-text [&_svg]:text-accent before:absolute before:left-0 before:top-1/2 before:h-4 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:transition-[width] before:content-[''] before:w-[2px]",
        isActive &&
          "font-semibold text-accent [&_svg]:text-accent before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-[3px] before:rounded-r-full before:bg-accent before:shadow-[0_0_10px_var(--accent-ring)] before:content-['']",
        railCollapsed && "justify-center",
      )}
      style={
        isActive
          ? { background: "linear-gradient(90deg, var(--accent-tint), transparent 92%)" }
          : undefined
      }
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-faint transition-colors group-hover:text-text-muted",
          isActive && "bg-accent-tint text-accent",
        )}
      >
        {icons[item.icon]}
      </span>
      <span className="gyl-sidebar-label flex-1 truncate">{item.label}</span>
      {badge && badge > 0 ? (
        <span
          className="gyl-sidebar-label inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums"
          style={{
            color: "var(--accent-hover)",
            background: "var(--accent-tint)",
            border: "1px solid var(--border-strong)",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavGroup({
  section,
  active,
  icons,
  badges,
  railCollapsed,
}: {
  section: NavSection;
  active: string | null;
  icons: IconMap;
  badges: BadgeMap;
  railCollapsed: boolean;
}) {
  const hasActive = section.items.some((i) => i.href === active);
  const collapsible = !!section.defaultCollapsed && !railCollapsed;
  const [open, setOpen] = useState<boolean>(!section.defaultCollapsed || hasActive);
  const [userClosed, setUserClosed] = useState(false);
  const isExpanded = !collapsible || (userClosed ? false : open || hasActive);

  return (
    <div className="mt-1 first:mt-0">
      {collapsible ? (
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setUserClosed(isExpanded);
          }}
          className={cn(
            "flex w-full items-center justify-between gap-1 rounded-md px-2.5 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors duration-200",
            isExpanded
              ? "text-text-muted bg-surface/60"
              : "text-text-faint hover:text-text-muted",
          )}
          aria-expanded={isExpanded}
        >
          <span className="gyl-sidebar-label">{section.label}</span>
          <span className="gyl-sidebar-label">
            <ChevronIcon
              className={cn(
                "transition-transform duration-300 ease-out",
                isExpanded ? "rotate-90 text-accent" : "text-text-faint",
              )}
            />
          </span>
        </button>
      ) : (
        <div className="gyl-sidebar-label px-2.5 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-faint">
          {section.label}
        </div>
      )}

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={active === item.href}
              icons={icons}
              badges={badges}
              railCollapsed={railCollapsed}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
