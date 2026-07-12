import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
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
  KeyRound,
  Search,
  FileText,
  Palette,
  MapPin,
  Target,
  ClipboardCheck,
  Wrench,
  Command,
  Rocket,
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

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: string;
};

const workspaceItems: NavItem[] = [
  { title: "Agency Health", url: "/dashboard", icon: Activity },
  { title: "Agent Jobs", url: "/", icon: Zap, badge: "12" },
  { title: "Assign Tasks", url: "/automation", icon: ClipboardList },
  { title: "Automation", url: "/automation", icon: Workflow },
  { title: "Suggestions", url: "/suggestions", icon: Lightbulb },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Alert Manager", url: "/alerts", icon: Bell, badge: "3" },
];

const scouts: { id: string; title: string; icon: LucideIcon }[] = [
  { id: "keyword", title: "Keyword Scout", icon: Search },
  { id: "content", title: "Content Scout", icon: FileText },
  { id: "design", title: "Designing Scout", icon: Palette },
  { id: "local", title: "Local Scout", icon: MapPin },
  { id: "competitor", title: "Competitor Scout", icon: Target },
  { id: "audit", title: "Audit Scout", icon: ClipboardCheck },
  { id: "technical", title: "Technical Scout", icon: Wrench },
];

const githubItems: NavItem[] = [
  { title: "Repositories", url: "/github/repos", icon: Github },
  { title: "Deployments", url: "/github/deployments", icon: Cloud },
  { title: "SEO Sync", url: "/github/sync", icon: Radar },
];

const systemItems: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Security", url: "/settings/security", icon: ShieldCheck },
  { title: "API Keys", url: "/settings/keys", icon: KeyRound },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (path: string) =>
    path === "/"
      ? currentPath === "/" || currentPath.startsWith("/agents")
      : currentPath === path || currentPath.startsWith(path + "/");

  const scoutOpenDefault = currentPath.startsWith("/scout-team");
  const [scoutOpen, setScoutOpen] = useState(scoutOpenDefault);
  const [githubOpen, setGithubOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(currentPath.startsWith("/seo-suite"));
  const [systemOpen, setSystemOpen] = useState(currentPath.startsWith("/settings"));

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
            <button
              type="button"
              className="group flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-left transition hover:border-cyan-400/40 hover:bg-slate-900/60"
            >
              <Search className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-300" />
              <span className="flex-1 truncate text-[11px] text-slate-500 group-hover:text-slate-300">
                Search or jump to…
              </span>
              <span className="inline-flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1 py-px font-mono text-[9px] text-slate-400">
                <Command className="h-2.5 w-2.5" />K
              </span>
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="relative bg-transparent">
        {/* Workspace */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/60">
              Workspace
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={
                        active
                          ? "relative bg-gradient-to-r from-cyan-500/25 via-cyan-500/10 to-transparent text-white font-semibold ring-1 ring-inset ring-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] hover:from-cyan-500/30 hover:text-white data-[active=true]:from-cyan-500/25 data-[active=true]:text-white data-[active=true]:font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-cyan-300 before:to-blue-500 before:shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                          : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                      }
                    >
                      <Link to={item.url} className="flex items-center gap-2.5">
                        <item.icon
                          className={`h-4 w-4 shrink-0 transition ${
                            active ? "text-cyan-200" : "text-slate-400 group-hover/menu-item:text-cyan-300"
                          }`}
                        />
                        {!collapsed && (
                          <>
                            <span className={`flex-1 truncate text-[13px] ${active ? "text-white" : ""}`}>{item.title}</span>
                            {item.badge && (
                              <span
                                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                                  active
                                    ? "bg-cyan-400/30 text-white ring-1 ring-cyan-300/60"
                                    : "bg-slate-800 text-slate-200 ring-1 ring-slate-700"
                                }`}
                              >
                                {item.badge}
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

        {/* Scout Team */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild>
              <button
                type="button"
                onClick={() => setScoutOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200"
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
                      ? "relative bg-gradient-to-r from-blue-500/25 via-cyan-500/10 to-transparent text-white font-semibold ring-1 ring-inset ring-cyan-400/30 data-[active=true]:from-blue-500/25 data-[active=true]:text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-cyan-300 before:to-blue-500 before:shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }
                >
                  <Link to="/scout-team" className="flex items-center gap-2.5">
                    <Radar className="h-4 w-4 text-cyan-300" />
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
                              <s.icon className={`h-3.5 w-3.5 ${active ? "text-cyan-200" : "text-slate-400"}`} />
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
            <SidebarGroupLabel asChild>
              <button
                type="button"
                onClick={() => setSeoOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200"
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
                      ? "relative bg-gradient-to-r from-cyan-500/25 via-cyan-500/10 to-transparent text-white font-semibold ring-1 ring-inset ring-cyan-400/30 data-[active=true]:from-cyan-500/25 data-[active=true]:text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-cyan-300 before:to-blue-500 before:shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }
                >
                  <Link to="/seo-suite" className="flex items-center gap-2.5">
                    <Rocket className="h-4 w-4 text-cyan-300" />
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
                                className={`h-3.5 w-3.5 ${active ? "text-cyan-200" : "text-slate-400"}`}
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

        {/* GitHub Cloud SEO */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild>
              <button
                type="button"
                onClick={() => setGithubOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Github className="h-3 w-3" />
                  GitHub Cloud SEO
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${githubOpen ? "" : "-rotate-90"}`}
                />
              </button>
            </SidebarGroupLabel>
          )}
          {(!collapsed && githubOpen) || collapsed ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {githubItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      className="text-slate-400 hover:bg-slate-800/40 hover:text-cyan-100"
                    >
                      <item.icon className="h-4 w-4 text-slate-500" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-[13px]">{item.title}</span>
                          <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-px text-[9px] uppercase tracking-wider text-slate-500">
                            Soon
                          </span>
                        </>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>

        {/* System */}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel asChild>
              <button
                type="button"
                onClick={() => setSystemOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.2em] text-cyan-300/60 hover:text-cyan-200"
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
                            ? "bg-cyan-500/10 text-cyan-100 data-[active=true]:bg-cyan-500/10"
                            : "text-slate-400 hover:bg-slate-800/40 hover:text-cyan-100"
                        }
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className={`h-4 w-4 ${active ? "text-cyan-300" : "text-slate-500"}`} />
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
          <div className="m-1.5 overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/40 p-3">
            <div className="flex items-center gap-2">
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
                <div className="truncate text-[12px] font-semibold text-white">Ahmed K.</div>
                <div className="truncate text-[10px] text-cyan-300/70">Operator · Dubai</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Usage</span>
              <span className="font-mono text-cyan-200">62%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(34,211,238,0.7)]"
                style={{ width: "62%" }}
              />
            </div>
          </div>
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
