import Link from "next/link";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { contentBriefs, notifications, seoProposals, sites, tasks, users } from "@/db/schema";
import { logoutAction } from "@/app/actions/auth";
import { BellPoll } from "@/components/ui/BellPoll";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { CommandBar } from "@/components/ui/CommandBar";
import { SidebarNav } from "@/components/ui/SidebarNav";
import { KeyboardShortcuts } from "@/components/ui/KeyboardShortcuts";
import { MobileSidebar } from "@/components/ui/MobileSidebar";
import { PageTransition } from "@/components/ui/PageTransition";
import { SidebarToggle } from "@/components/ui/PrefToggles";
import { ResourcesDropdown } from "@/components/ui/ResourcesDropdown";
import { Toast } from "@/components/ui/Toast";
import { readSidebar } from "@/lib/ui-prefs";
import {
  IconActivity,
  IconBell,
  IconBolt,
  IconCard,
  IconChartBar,
  IconChecklist,
  IconGear,
  IconGlobe,
  IconHome,
  IconImage,
  IconInbox,
  IconMonitor,
  IconPhone,
  IconSearch,
  IconSparkle,
  IconUsers,
} from "@/components/ui/Icon";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import { cn } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureSchema();
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const visibility = await getVisibility(user);
  const sidebar = readSidebar();
  const collapsed = sidebar === "collapsed";

  // Header counts — one round-trip in parallel: unread bell badge + 3 nav
  // badges (SEO inbox pending, Content briefs in progress, Approvals queue).
  const [unread, seoCountRow, contentCountRow, approvalsCountRow, siteCountRow] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, user.id), isNull(notifications.readAt))),
    // SEO inbox: proposals waiting for human review (auto_apply=false, status=pending).
    isAdmin
      ? db()
          .select({ n: sql<number>`count(*)::int` })
          .from(seoProposals)
          .where(and(eq(seoProposals.status, "pending"), eq(seoProposals.autoApply, false)))
      : Promise.resolve([{ n: 0 }]),
    // Content Ops: briefs in active drafting/review state.
    isAdmin
      ? db()
          .select({ n: sql<number>`count(*)::int` })
          .from(contentBriefs)
          .where(sql`${contentBriefs.status} in ('brief','drafting','review')`)
      : Promise.resolve([{ n: 0 }]),
    // Approvals: SEO proposals + content briefs in "review" — anything needing
    // an admin tap.
    isAdmin
      ? db()
          .select({
            n: sql<number>`
              (select count(*) from seo_proposals where status='pending' and auto_apply=false)
              + (select count(*) from content_briefs where status='review')
            `,
          })
          .from(sql`(select 1) t`)
      : Promise.resolve([{ n: 0 }]),
    // Site count for the workspace pill ("GYL Network · N sites").
    db().select({ n: sql<number>`count(*)::int` }).from(sites),
  ]);
  const unreadCount = unread[0]?.n ?? 0;
  const seoCount = Number(seoCountRow[0]?.n ?? 0);
  const contentCount = Number(contentCountRow[0]?.n ?? 0);
  const approvalsCount = Number(approvalsCountRow[0]?.n ?? 0);
  const totalSiteCount = Number(siteCountRow[0]?.n ?? 0);

  // CmdK results: sites + users + tasks + page shortcuts.
  // All fetched in parallel so the layout query budget stays one round-trip.
  // Tasks are scoped by the user's visibility so a worker can't jump
  // to entities they shouldn't see.
  const siteScope = visibility.kind === "scoped" ? inArray(sites.id, visibility.siteIds) : undefined;
  const taskScope = visibility.kind === "scoped" ? inArray(tasks.siteId, visibility.siteIds) : undefined;

  const skipCmdScope = visibility.kind === "scoped" && visibility.siteIds.length === 0;

  const [visibleSitesRows, userRows, taskRows] = await Promise.all([
    db()
      .select({ slug: sites.slug, name: sites.name, city: sites.city })
      .from(sites)
      .where(siteScope)
      .orderBy(sites.slug)
      .limit(200),
    isAdmin
      ? db().select({ id: users.id, email: users.email, role: users.role }).from(users).limit(200)
      : Promise.resolve([] as { id: string; email: string; role: string }[]),
    skipCmdScope
      ? Promise.resolve([] as { id: string; title: string; siteSlug: string }[])
      : db()
          .select({ id: tasks.id, title: tasks.title, siteSlug: sites.slug })
          .from(tasks)
          .innerJoin(sites, eq(sites.id, tasks.siteId))
          .where(and(sql`${tasks.status} not in ('done','cancelled')`, taskScope))
          .orderBy(desc(tasks.updatedAt))
          .limit(60),
  ]);

  const cmdItems = [
    { group: "Pages" as const, id: "me", label: "Overview", href: "/admin/me" },
    { group: "Pages" as const, id: "tasks", label: "Assign Tasks", href: "/admin/tasks" },
    { group: "Pages" as const, id: "chat", label: "Assistant", href: "/admin/chat" },
    { group: "Pages" as const, id: "notif", label: "Notifications", href: "/admin/notifications" },
    ...(isAdmin
      ? [
          { group: "Pages" as const, id: "sites-list", label: "Connected sites", href: "/admin/sites" },
          { group: "Pages" as const, id: "build", label: "New website", href: "/admin/build" },
          { group: "Pages" as const, id: "users-list", label: "Users", href: "/admin/users" },
          { group: "Pages" as const, id: "seo-health", label: "SEO health", href: "/admin/seo-health" },
          { group: "Pages" as const, id: "keywords", label: "Keywords", href: "/admin/keywords" },
          { group: "Pages" as const, id: "indexing", label: "Indexing", href: "/admin/indexing" },
          { group: "Pages" as const, id: "alerts", label: "Alerts", href: "/admin/alerts" },
          { group: "Pages" as const, id: "cwv", label: "Core Web Vitals", href: "/admin/cwv" },
          { group: "Pages" as const, id: "audit-log", label: "Audit log", href: "/admin/audit-log" },
          { group: "Pages" as const, id: "templates", label: "Task templates", href: "/admin/templates" },
          { group: "Pages" as const, id: "settings", label: "Settings", href: "/admin/settings" },
        ]
      : []),
    ...visibleSitesRows.map((s) => ({
      group: "Sites" as const,
      id: s.slug,
      label: s.name,
      hint: s.city ?? s.slug,
      href: `/admin/sites/${s.slug}`,
      keywords: `${s.slug} ${s.city ?? ""}`,
    })),
    ...userRows.map((u) => ({
      group: "Users" as const,
      id: u.id,
      label: u.email,
      hint: u.role,
      href: `/admin/users/${u.id}`,
    })),
    ...taskRows.map((t) => ({
      group: "Tasks" as const,
      id: t.id,
      label: t.title,
      hint: t.siteSlug,
      href: `/admin/tasks/${t.id}`,
      keywords: t.siteSlug,
    })),
  ];

  return (
    <div className="gyl-shell bg-bg">
      {/* === Top bar ===
          Tools strip — the page title hero is rendered per-page via .brand-rule.
          This bar holds: sidebar toggle, ⌘K search, agent-active pill, Generate
          Weekly Brief CTA, notifications bell, theme toggle. Sticky so it stays
          on screen as the operator scrolls long pages. */}
      <header
        className="sticky top-0 z-30 flex h-20 items-center gap-2 border-b px-4 py-3"
        style={{
          background: "oklch(15% 0.012 285 / 0.88)",
          borderColor: "var(--border)",
          backdropFilter: "saturate(110%) blur(14px)",
          WebkitBackdropFilter: "saturate(110%) blur(14px)",
        }}
      >
        <SidebarToggle state={sidebar} />
        <div className="flex-1 min-w-0">
          <CommandBar initialItems={cmdItems} />
        </div>

        {/* Agent-active pill — green pulse + label. Hidden under 640px to
            give the search room. */}
        <div
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
          title="The AI agent is configured and processing scheduled jobs"
        >
          <span className="live-dot" aria-hidden style={{ height: 6, width: 6 }} />
          <span className="hidden md:inline">Agent active</span>
        </div>

        {isAdmin ? (
          <Link
            href="/admin/sites"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            <IconGlobe />
            <span className="hidden md:inline">Connected Sites</span>
          </Link>
        ) : null}

        {isAdmin ? <ResourcesDropdown /> : null}

        {isAdmin ? (
          <Link
            href="/admin/build"
            className="hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            style={{
              background: "linear-gradient(180deg, var(--accent-hover), var(--accent))",
              color: "var(--accent-fg)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 20px var(--accent-ring)",
            }}
          >
            <IconSparkle />
            <span>New Website</span>
          </Link>
        ) : null}

        <Link
          href="/admin/notifications"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          style={{ border: "1px solid var(--border)" }}
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <IconBell />
          <BellPoll initial={unreadCount} />
        </Link>

        <Link
          href="/admin/me/settings"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          style={{ border: "1px solid var(--border)" }}
          aria-label="My profile"
        >
          <IconUsers />
        </Link>
      </header>

      <div className="gyl-shell-row">
        {/* === Sidebar === */}
        <aside
          className={cn(
            "gyl-sidebar flex flex-col border-r border-border",
            collapsed && "gyl-sidebar-collapsed",
          )}
        >
          {/* Brand mark — rounded indigo glyph paired with the SEO RankPilot
              wordmark + an "Agency Command" eyebrow. */}
          <div className="flex items-center gap-2.5 px-3 pt-4">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-accent shadow-sm"
              style={{
                background: "var(--accent-tint)",
                border: "1px solid var(--border-strong)",
              }}
              aria-hidden
            >
              <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 1.5 28.5 8.75v14.5L16 30.5 3.5 23.25V8.75Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  opacity="0.9"
                />
                <path
                  d="M9.5 18.5h13M11.5 18.5v-2.4c0-.6.4-1.1 1-1.2l3-.8c.4-.1.8-.1 1.2 0l3 .9c.6.2 1 .7 1 1.3v2.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="13" cy="20" r="1.4" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="19" cy="20" r="1.4" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </span>
            <div className="gyl-sidebar-label flex min-w-0 flex-col leading-tight">
              <span className="truncate text-lg font-semibold tracking-tight text-text">
                SEO RankPilot
              </span>
            </div>
          </div>

          {/* Workspace pill — green presence dot + site count + chevron to the
              full sites list. Clickable; chevron implies "jump to sites" which
              is what this does. When fewer than 3 sites are connected we
              swap the chevron for a "+ connect" affordance so the operator
              knows new sites can be added. */}
          <div className="gyl-sidebar-label px-3 pt-3 pb-1">
            <Link
              href={visibility.kind === "scoped" ? "/admin/me" : "/admin/sites"}
              className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition hover:border-border-strong"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
              title={
                visibility.kind === "scoped"
                  ? "View your assigned sites"
                  : `Manage your ${totalSiteCount} connected site${totalSiteCount === 1 ? "" : "s"}`
              }
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--success)" }}
                  aria-hidden
                />
                <span className="truncate text-sm">
                  {visibility.kind === "scoped"
                    ? `${visibility.siteIds.length} sites assigned`
                    : `SEO RankPilot · ${totalSiteCount} connected`}
                </span>
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 shrink-0">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </div>

          {/* Nav tree + active-state are a client island (needs usePathname).
              Icons are passed by name → node so the client bundle doesn't
              re-import the whole Icon module. Section/label/href data is the
              shared nav-config — the same module Breadcrumbs reads. */}
          <SidebarNav
            isAdmin={isAdmin}
            collapsed={collapsed}
            badges={{ seo: seoCount, content: contentCount }}
            icons={{
              IconInbox: <IconInbox />,
              IconHome: <IconHome />,
              IconChartBar: <IconChartBar />,
              IconActivity: <IconActivity />,
              IconCard: <IconCard />,
              IconChecklist: <IconChecklist />,
              IconBolt: <IconBolt />,
              IconGlobe: <IconGlobe />,
              IconSparkle: <IconSparkle />,
              IconUsers: <IconUsers />,
              IconPhone: <IconPhone />,
              IconBell: <IconBell />,
              IconMonitor: <IconMonitor />,
              IconImage: <IconImage />,
              IconSearch: <IconSearch />,
              IconGear: <IconGear />,
            }}
          />

          <div className="border-t border-border px-3 py-3">
            <div className="flex items-center gap-2">
              <Link
                href="/admin/me/settings"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold uppercase text-text-muted hover:bg-surface-3 hover:text-text"
                title="My settings"
              >
                {user.email.slice(0, 2)}
              </Link>
              <div className="gyl-sidebar-label min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text">{user.email}</div>
                <div className="text-xs uppercase tracking-[0.08em] text-text-faint">{user.role}</div>
              </div>
              <Link
                href="/admin/me/settings"
                className="gyl-sidebar-label rounded-sm px-1.5 py-1 text-text-faint hover:bg-surface-2 hover:text-text"
                title="My settings"
                aria-label="My settings"
              >
                <IconGear />
              </Link>
              <form action={logoutAction} className="gyl-sidebar-label">
                <button
                  type="submit"
                  className="rounded-sm px-1.5 py-1 text-text-faint hover:bg-surface-2 hover:text-text"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  ⎋
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* === Main === */}
        <main className="flex-1 overflow-x-hidden px-5 py-4 sm:px-7 sm:py-5 md:px-10 md:py-6">
          {/* Global wayfinding bar — rendered ONCE here so all 101 admin pages
              inherit clickable breadcrumbs + a Back control with zero per-page
              edits. Hidden on the dashboard root. Sticky under the 56px top bar. */}
          <Breadcrumbs />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* Global toast (Undo on task status change, etc.) */}
      <Toast />
      {/* Global keyboard shortcuts: `g` then a letter jumps to a section,
          `?` opens the cheat sheet. Safe when focus is in an input. */}
      <KeyboardShortcuts />
      {/* Mobile hamburger overlay sidebar — fixed bottom-right on phones only */}
      <MobileSidebar isAdmin={isAdmin} />
    </div>
  );
}

