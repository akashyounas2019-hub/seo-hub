import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Zap,
  Lightbulb,
  Settings,
  BarChart3,
} from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Agent Jobs", url: "/", icon: Users },
  { title: "Automation", url: "/automation", icon: Zap },
  { title: "Suggestions", url: "/suggestions", icon: Lightbulb },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (r) => r.location.pathname,
  });

  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" || currentPath.startsWith("/agents") : currentPath === path || currentPath.startsWith(path + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-800 bg-[#05070d]">
      <SidebarHeader className="border-b border-slate-800 bg-[#05070d]">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-slate-900/60 ring-1 ring-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
            <img src={agentBot} alt="" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">AKS Console</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-cyan-300/70">SEO Agents</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-[#05070d]">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={
                        active
                          ? "bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15 hover:text-cyan-100 data-[active=true]:bg-cyan-400/10 data-[active=true]:text-cyan-200"
                          : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                      }
                    >
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
