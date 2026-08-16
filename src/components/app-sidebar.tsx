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
  Hammer,
  TestTube2,
  ScrollText,
  SlidersHorizontal,
  X,
  ChevronUp,
  Sparkles,
  Gauge,
  Globe,
  Check,
  Plus,
  LayoutDashboard,
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
  { title: "Suggestions", url: "/suggestions", icon: Lightbulb },
];

// Agents — config, sub-agents, skills, tool integrations, orchestration
const agentItems: NavItem[] = [
  { title: "Agent Dashboard", url: "/agent-dashboard", icon: LayoutDashboard },
  { title: "Agents", url: "/", icon: Zap, badge: "12" },
  { title: "Build Agent", url: "/build-agent", icon: Hammer },
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
  const [activeAlertsCount, setActiveAlertsCount] = useState(11);

  useEffect(() => {
    const checkAlerts = () => {
      const saved = localStorage.getItem("aks.alerts");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const count = parsed.filter((a: any) => a.status === "active").length;
          setActiveAlertsCount(count);
        } catch (e) {}
      } else {
        setActiveAlertsCount(11);
      }
    };
    checkAlerts();
    window.addEventListener("aks-alerts-changed", checkAlerts);
    window.addEventListener("storage", checkAlerts);
    return () => {
      window.removeEventListener("aks-alerts-changed", checkAlerts);
      window.removeEventListener("storage", checkAlerts);
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
                              {item.badge && (
                                <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${active ? "bg-slate-950 text-cyan-200" : "bg-slate-800 text-slate-200 ring-1 ring-slate-700"}`}>{item.badge}</span>
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
        {!collapsed ? (
          <UsagePanel />
        ) : (
          <div className="grid place-items-center py-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 p-px">
              <div className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-[9px] font-bold text-cyan-200">
                AK
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>

      <style>{`@keyframes ledPulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </Sidebar>
  );
}

const USAGE_KEY = "aks.sidebar.usage";
type UsageMode = "expanded" | "collapsed" | "hidden";

function UsagePanel() {
  const [mode, setMode] = useState<UsageMode>(() => {
    if (typeof window === "undefined") return "expanded";
    const v = window.localStorage.getItem(USAGE_KEY) as UsageMode | null;
    return v ?? "expanded";
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  const set = (m: UsageMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(USAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  if (mode === "hidden") {
    return (
      <div className="m-1.5">
        <button
          type="button"
          onClick={() => set("expanded")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-500/30 bg-slate-950/80 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300 hover:border-cyan-400 hover:bg-slate-900 transition"
          aria-label="Show usage panel"
        >
          <Gauge className="h-3.5 w-3.5" />
          Restore Plan & Usage Card
        </button>
      </div>
    );
  }

  const collapsed = mode === "collapsed";

  return (
    <>
      <div className="m-1.5 overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/40 shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 p-px">
              <div className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-[10px] font-bold text-cyan-200">
                AK
              </div>
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]"
              style={{ animation: "ledPulse 1.6s ease-in-out infinite" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-bold text-white flex items-center gap-1.5">
              Ahmed K.
              {upgraded && (
                <span className="rounded bg-gradient-to-r from-amber-400 to-orange-500 px-1 py-0.2 text-[8px] font-extrabold text-slate-950">
                  PRO
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-cyan-300/70 font-mono">
              {upgraded ? "Pro Operator · Unlimited" : "Free Plan · Dubai"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                set(collapsed ? "expanded" : "collapsed");
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-800/70 hover:text-cyan-200 transition cursor-pointer"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand usage panel" : "Collapse usage panel"}
              title={collapsed ? "Expand plan details" : "Collapse plan details"}
            >
              <ChevronUp className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                set("hidden");
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer"
              aria-label="Dismiss usage panel"
              title="Close plan card"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-3 pb-3 pt-2.5 space-y-2.5">
              <UsageBar label="Credits" value={upgraded ? 15 : 62} tone="cyan" detail={upgraded ? "1.5k / 100k" : "6.2k / 10k"} />
              <UsageBar label="Agent hours" value={upgraded ? 8 : 41} tone="emerald" detail={upgraded ? "16 / 1,000 h" : "82 / 200 h"} />
              <UsageBar label="Storage" value={upgraded ? 12 : 78} tone="amber" detail={upgraded ? "1.2 / 500 GB" : "7.8 / 10 GB"} />
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-[0_0_14px_rgba(34,211,238,0.35)] hover:brightness-110 cursor-pointer transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {upgraded ? "Manage Pro Plan" : "Upgrade Plan"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0a0e1a] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Upgrade Your SEO Plan</h3>
                <p className="text-xs text-slate-400">Unlock unlimited AI agents, GA4/GSC sync & multi-site reporting.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-400/50 bg-cyan-950/20 p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Pro Plan</span>
                  <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-200">POPULAR</span>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-white">$49 <span className="text-xs font-normal text-slate-400">/mo</span></div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-300">
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" /> 100k Credits / mo</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" /> 1,000 Agent hours</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" /> Unlimited Connected Sites</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-left opacity-80 hover:opacity-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">Agency</span>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-white">$149 <span className="text-xs font-normal text-slate-400">/mo</span></div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-300">
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-400 shrink-0" /> 500k Credits / mo</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-400 shrink-0" /> Dedicated Scout Workers</li>
                  <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-400 shrink-0" /> White-label Client Export</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpgraded(true);
                  setShowUpgradeModal(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg hover:brightness-110"
              >
                <Sparkles className="h-4 w-4" />
                Confirm Pro Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UsageBar({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "cyan" | "emerald" | "amber";
}) {
  const bar = {
    cyan: "from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(34,211,238,0.6)]",
    emerald: "from-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
    amber: "from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
  }[tone];
  const text = {
    cyan: "text-cyan-200",
    emerald: "text-emerald-200",
    amber: "text-amber-200",
  }[tone];
  return (
    <div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className={`font-mono ${text}`}>{value}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800/80">
        <div className={`h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-0.5 text-[9.5px] text-slate-500">{detail}</div>
    </div>
  );
}
