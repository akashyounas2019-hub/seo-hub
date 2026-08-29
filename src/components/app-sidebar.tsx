import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Activity,
  Zap,
  ClipboardList,
  Workflow,
  Lightbulb,
  BarChart3,
  Bell,
  Radar,
  Settings,
  ChevronDown,
  Github,
  Cloud,
  ShieldCheck,
  Search,
  FileText,
  Palette,
  MapPin,
  Target,
  ClipboardCheck,
  Wrench,
  Command,
  Rocket,
  Bot,
  CheckSquare,
  TestTube2,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Globe,
  Check,
  Plus,
  LayoutDashboard,
  Database,
  type LucideIcon,
} from "lucide-react";
import { SEO_TOOLS } from "@/lib/seo-tools";
import agentBot from "@/assets/agent-bot.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSite } from "@/lib/site-context";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: string;
};

// Command — daily "what's happening" surfaces
const workspaceItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: Activity },
  { title: "Agency Health", url: "/agency-health", icon: ShieldCheck, badge: "8" },
  { title: "Alert Manager", url: "/alerts", icon: Bell, badge: "3" },
  { title: "Approvals", url: "/approvals", icon: CheckSquare },
  { title: "Suggestions", url: "/suggestions", icon: Lightbulb },
];

// Agents — config, sub-agents, skills, tool integrations, orchestration
const agentItems: NavItem[] = [
  { title: "Agent Dashboard", url: "/agent-dashboard", icon: LayoutDashboard },
  { title: "Knowledge Base", url: "/knowledge-base", icon: Database, badge: "RAG" },
  { title: "Agents", url: "/", icon: Zap, badge: "12" },
  { title: "Assistant", url: "/assistant", icon: Bot },
  { title: "Assign Tasks", url: "/assign-tasks", icon: ClipboardList },
  { title: "Automation", url: "/automation", icon: Workflow },
];

const scouts: { id: string; title: string; icon: LucideIcon }[] = [
  { id: "local", title: "Local Scout · Dubai", icon: MapPin },
  { id: "keyword", title: "Keyword Scout", icon: Search },
  { id: "competitor", title: "Competitor Scout", icon: Target },
  { id: "content", title: "Content Scout", icon: FileText },
  { id: "audit", title: "Audit Scout", icon: ClipboardCheck },
  { id: "technical", title: "Technical Scout", icon: Wrench },
  { id: "design", title: "Designing Scout", icon: Palette },
];

// Intelligence — analysis, QA
const intelligenceItems: NavItem[] = [
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "QA Suite", url: "/qa-suite", icon: TestTube2 },
];

// Integrations — external systems this console plugs into
const integrationItems: (NavItem & { soon?: boolean })[] = [
  { title: "Connected Sites", url: "/connected-sites", icon: Cloud },
  { title: "Lovable Cloud", url: "/integrations/lovable", icon: Sparkles, soon: true },
  { title: "GHL (GoHighLevel)", url: "/integrations/ghl", icon: Rocket, soon: true },
  { title: "GitHub Repos", url: "/github/repos", icon: Github, soon: true },
  { title: "Deployments", url: "/github/deployments", icon: Cloud, soon: true },
  { title: "SEO Sync", url: "/github/sync", icon: Radar, soon: true },
];

const systemItems: NavItem[] = [
  { title: "Settings", url: "/settings", icon: SlidersHorizontal },
];

function SiteSelectorDropdown() {
  const { currentSite, allSites, setCurrentSiteId } = useSite();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSites = allSites.filter(
    (s) =>
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.domain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
          open
            ? "border-cyan-400 bg-slate-900 shadow-[0_0_16px_rgba(34,211,238,0.3)]"
            : "border-slate-800/80 bg-slate-950/90 hover:border-cyan-400/50 hover:bg-slate-900/80"
        }`}
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 font-bold shadow-sm">
          <Globe className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-white">
              {currentSite.label}
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                currentSite.health === "healthy"
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                  : currentSite.health === "attention"
                  ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                  : "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
              }`}
            />
          </div>
          <div className="truncate text-[10px] text-cyan-300/80 font-mono">
            {currentSite.domain}
          </div>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-cyan-300" : "group-hover:text-slate-200"
          }`}
        />
      </button>

      {/* Floating Popover using fixed positioning so parent overflow-hidden NEVER clips it */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-xs"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="fixed left-3 top-16 z-[999] w-64 overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0a0e1c] p-2.5 shadow-[0_10px_38px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input
                type="text"
                placeholder="Search connected site..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                autoFocus
              />
            </div>

            <div className="mt-2.5 max-h-60 space-y-1 overflow-y-auto pr-1">
              <div className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Connected Sites ({filteredSites.length})
              </div>

              {filteredSites.map((site) => {
                const isSelected = site.id === currentSite.id;
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentSiteId(site.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 text-white font-semibold"
                        : "text-slate-300 hover:bg-slate-900/80 hover:text-white"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-white">
                          {site.label}
                        </span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            site.health === "healthy"
                              ? "bg-emerald-400"
                              : site.health === "attention"
                              ? "bg-amber-400"
                              : "bg-cyan-400"
                          }`}
                        />
                      </div>
                      <div className="truncate text-[10px] text-cyan-300/70 font-mono">
                        {site.domain} · {site.location}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-cyan-300" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 border-t border-slate-800 pt-2">
              <Link
                to="/connected-sites"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Connect New Website
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { allSites } = useSite();
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const checkAlerts = () => {
      fetch("/api/alerts")
        .then((res) => res.json())
        .then((json) => {
          if (!isMounted || !json?.ok) return;
          const count = (json.alerts || []).filter((a: any) => a.status === "open").length;
          setActiveAlertsCount(count);
        })
        .catch(() => {});
    };
    checkAlerts();
    const interval = setInterval(checkAlerts, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkApprovals = () => {
      fetch("/api/tasks/pending-approval")
        .then((res) => res.json())
        .then((json) => {
          if (!isMounted || !json?.ok) return;
          setPendingApprovalsCount(json.count || 0);
        })
        .catch(() => {});
    };
    checkApprovals();
    const interval = setInterval(checkApprovals, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const isActive = (path: string) =>
    path === "/"
      ? currentPath === "/" || currentPath.startsWith("/agents")
      : currentPath === path || currentPath.startsWith(path + "/");

  // Scout Team, SEO Suite always open by default so subcategories stay visible
  const [scoutOpen, setScoutOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [intelligenceOpen, setIntelligenceOpen] = useState(true);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(true);
  const [systemOpen, setSystemOpen] = useState(true);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/5 bg-[#010204]"
    >
      {/* subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#02040a] to-black" />
        <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-blue-600/[0.05] blur-3xl" />
      </div>

      <SidebarHeader className="relative border-b border-cyan-500/10 bg-transparent">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-950 ring-1 ring-cyan-400/40 shadow-[0_0_22px_rgba(34,211,238,0.35)]">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/25 via-transparent to-blue-600/25" />
            <img src={agentBot} alt="" className="relative h-full w-full object-contain" />
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]"
              style={{ animation: "ledPulse 1.6s ease-in-out infinite" }}
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-white">AKS Console</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-cyan-200">
                  Pro
                </span>
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">
                SEO Agents · Live
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="px-1.5 pb-1.5">
            <SiteSelectorDropdown />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="relative bg-transparent">
        {/* Workspace */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">
              Command
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => {
                const active = isActive(item.url);
                let badge = item.badge;
                if (item.url === "/agency-health") {
                  badge = String(allSites.length);
                } else if (item.url === "/alerts") {
                  badge = String(activeAlertsCount);
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={
                        active
                          ? "relative bg-cyan-400 text-slate-950 font-semibold shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:bg-cyan-300 hover:text-slate-950 data-[active=true]:bg-cyan-400 data-[active=true]:text-slate-950 data-[active=true]:font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-slate-950"
                          : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                      }
                    >
                      <Link to={item.url} className="flex items-center gap-2.5">
                        <item.icon
                          className={`h-4 w-4 shrink-0 transition ${
                            active ? "text-slate-950" : "text-slate-400 group-hover/menu-item:text-cyan-300"
                          }`}
                        />
                        {!collapsed && (
                          <>
                            <span className={`flex-1 truncate text-[13px] ${active ? "text-slate-950 font-semibold" : ""}`}>{item.title}</span>
                            {badge && (
                              <span
                                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                                  active
                                    ? "bg-slate-950 text-cyan-200 ring-1 ring-slate-950/50"
                                    : "bg-slate-800 text-slate-200 ring-1 ring-slate-700"
                                }`}
                              >
                                {badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>

                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Agents — config, sub-agents, skills, tools */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setAgentsOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />
                  Agents
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${agentsOpen ? "" : "-rotate-90"}`} />
              </button>
            </SidebarGroupLabel>
          )}
          {(!collapsed && agentsOpen) || collapsed ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {agentItems.map((item) => {
                  const active = isActive(item.url);
                  const badge = item.url === "/approvals"
                    ? (pendingApprovalsCount > 0 ? String(pendingApprovalsCount) : undefined)
                    : item.badge;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={
                          active
                            ? "relative bg-cyan-400 text-slate-950 font-semibold shadow-[0_0_20px_rgba(34,211,238,0.45)] hover:bg-cyan-300 hover:text-slate-950 data-[active=true]:bg-cyan-400 data-[active=true]:text-slate-950 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-slate-950"
                            : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                        }
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-slate-950" : "text-slate-400"}`} />
                          {!collapsed && (
                            <>
                              <span className={`flex-1 truncate text-[13px] ${active ? "text-slate-950 font-semibold" : ""}`}>{item.title}</span>
                              {badge && (
                                <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${active ? "bg-slate-950 text-cyan-200" : "bg-slate-800 text-slate-200 ring-1 ring-slate-700"}`}>{badge}</span>
                              )}
                            </>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>

        {/* Scout Team */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setScoutOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Radar className="h-3 w-3" />
                  Scout Team
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${scoutOpen ? "" : "-rotate-90"}`}
                />
              </button>
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/scout-team"}
                  className={
                    currentPath === "/scout-team"
                      ? "relative bg-cyan-400 text-slate-950 font-semibold data-[active=true]:bg-cyan-400 data-[active=true]:text-slate-950 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-slate-950"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }
                >
                  <Link to="/scout-team" className="flex items-center gap-2.5">
                    <Radar className={`h-4 w-4 ${currentPath === "/scout-team" ? "text-slate-950" : "text-cyan-300"}`} />

                    {!collapsed && (
                      <>
                        <span className="flex-1 text-[13px]">Command Floor</span>
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[9px] uppercase tracking-wider text-cyan-200">
                          7
                        </span>
                      </>
                    )}
                  </Link>
                </SidebarMenuButton>

                {!collapsed && scoutOpen && (
                  <SidebarMenuSub className="border-l border-cyan-500/15">
                    {scouts.map((s) => {
                      const path = `/scout-team/${s.id}`;
                      const active = currentPath === path;
                      return (
                        <SidebarMenuSubItem key={s.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={active}
                            className={
                              active
                                ? "bg-cyan-500/20 text-white font-medium ring-1 ring-inset ring-cyan-400/30 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-white"
                                : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                            }
                          >
                            <Link to="/scout-team/$scoutId" params={{ scoutId: s.id }} className="flex items-center gap-2">
                              <s.icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-cyan-200" : "text-cyan-300/90"}`} />
                              <span className="truncate text-[12px]">{s.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>




        {/* SEO Suite — Advanced */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setSeoOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Rocket className="h-3 w-3" />
                  SEO Suite
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[8px] font-medium text-cyan-200">
                    NEW
                  </span>
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${seoOpen ? "" : "-rotate-90"}`}
                />
              </button>
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/seo-suite"}
                  className={
                    currentPath === "/seo-suite"
                      ? "relative bg-cyan-400 text-slate-950 font-semibold data-[active=true]:bg-cyan-400 data-[active=true]:text-slate-950 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-slate-950"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }
                >
                  <Link to="/seo-suite" className="flex items-center gap-2.5">
                    <Rocket className={`h-4 w-4 ${currentPath === "/seo-suite" ? "text-slate-950" : "text-cyan-300"}`} />

                    {!collapsed && (
                      <>
                        <span className="flex-1 text-[13px]">Optimisation Hub</span>
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-px text-[9px] uppercase tracking-wider text-cyan-200">
                          {SEO_TOOLS.length}
                        </span>
                      </>
                    )}
                  </Link>
                </SidebarMenuButton>

                {!collapsed && seoOpen && (
                  <SidebarMenuSub className="border-l border-cyan-500/15">
                    {SEO_TOOLS.slice(0, 10).map((t) => {
                      const path = `/seo-suite/${t.id}`;
                      const active = currentPath === path;
                      const Icon = t.icon;
                      return (
                        <SidebarMenuSubItem key={t.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={active}
                            className={
                              active
                                ? "bg-cyan-500/20 text-white font-medium ring-1 ring-inset ring-cyan-400/30 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-white"
                                : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                            }
                          >
                            <Link
                              to="/seo-suite/$toolId"
                              params={{ toolId: t.id }}
                              className="flex items-center gap-2"
                            >
                              <Icon
                                className={`h-3.5 w-3.5 shrink-0 ${active ? "text-cyan-200" : "text-cyan-300/90"}`}
                              />
                              <span className="truncate text-[12px]">{t.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        className="text-cyan-300/80 hover:bg-slate-800/40 hover:text-cyan-100"
                      >
                        <Link to="/seo-suite" className="flex items-center gap-2">
                          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                          <span className="truncate text-[12px]">
                            View all {SEO_TOOLS.length} tools →
                          </span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Intelligence — analysis, QA, logs */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setIntelligenceOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <BarChart3 className="h-3 w-3" />
                  Intelligence
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${intelligenceOpen ? "" : "-rotate-90"}`} />
              </button>
            </SidebarGroupLabel>
          )}
          {(!collapsed && intelligenceOpen) || collapsed ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {intelligenceItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={
                          active
                            ? "relative bg-cyan-500/20 text-white font-semibold ring-1 ring-inset ring-cyan-400/30 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-cyan-300 before:to-blue-500"
                            : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                        }
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className={`h-4 w-4 ${active ? "text-cyan-200" : "text-slate-400"}`} />
                          {!collapsed && <span className="truncate text-[13px]">{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>

        {/* Integrations — Lovable, GHL, GitHub, Connected Sites */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setIntegrationsOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Cloud className="h-3 w-3" />
                  Integrations
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${integrationsOpen ? "" : "-rotate-90"}`} />
              </button>
            </SidebarGroupLabel>
          )}
          {(!collapsed && integrationsOpen) || collapsed ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {integrationItems.map((item) => {
                  const isRealRoute = !item.soon;
                  const active = isRealRoute && isActive(item.url);
                  const content = (
                    <>
                      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-cyan-200" : "text-slate-500"}`} />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-[13px]">{item.title}</span>
                          {item.soon && (
                            <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-500">
                              Soon
                            </span>
                          )}
                        </>
                      )}
                    </>
                  );
                  return (
                    <SidebarMenuItem key={item.title}>
                      {isRealRoute ? (
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className={
                            active
                              ? "bg-cyan-500/20 text-white font-medium ring-1 ring-inset ring-cyan-400/30 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-white"
                              : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                          }
                        >
                          <Link to={item.url} className="flex items-center gap-2.5">
                            {content}
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton className="text-slate-400 hover:bg-slate-800/40 hover:text-cyan-100">
                          {content}
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>

        {/* System */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild className="text-cyan-200 hover:text-cyan-100">
              <button
                type="button"
                onClick={() => setSystemOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-200 hover:text-cyan-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Settings className="h-3 w-3" />
                  System
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${systemOpen ? "" : "-rotate-90"}`}
                />
              </button>
            </SidebarGroupLabel>
          )}
          {(!collapsed && systemOpen) || collapsed ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {systemItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={
                          active
                            ? "relative bg-cyan-500/20 text-white font-semibold ring-1 ring-inset ring-cyan-400/30 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-cyan-300 before:to-blue-500"
                            : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                        }
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className={`h-4 w-4 ${active ? "text-cyan-200" : "text-slate-400"}`} />
                          {!collapsed && <span className="truncate text-[13px]">{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative border-t border-cyan-500/10 bg-transparent">
        <div className="grid place-items-center py-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 p-px">
            <div className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-[9px] font-bold text-cyan-200">
              AK
            </div>
          </div>
        </div>
      </SidebarFooter>

      <style>{`@keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </Sidebar>
  );
}
