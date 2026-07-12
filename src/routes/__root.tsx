import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "sonner";
import { Globe, Search, BarChart3, Zap, Link2, CheckCircle2, AlertCircle, ExternalLink, X, BookOpen, MessageSquareQuote, LayoutTemplate, ChevronDown, FolderOpen } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "Lovable Generated Project" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-[#05070d]">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-cyan-500/10 bg-[#05070d]/85 px-2 sm:px-3 backdrop-blur">
              <SidebarTrigger className="text-slate-400 hover:text-cyan-200 shrink-0" />
              <div className="hidden md:flex flex-1 min-w-0 max-w-xl items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 hover:border-cyan-400/40">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 shrink-0"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <span className="flex-1 truncate text-[12px] text-slate-500">Search or jump to anywhere</span>
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-px font-mono text-[10px] text-slate-400 shrink-0">⌘K</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-200 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]" />
                  Agent active
                </span>
                <Link
                  to="/connected-sites"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 shrink-0 transition hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Globe className="h-3 w-3" />
                  Connected Sites
                  <span className="ml-1 rounded-full bg-cyan-400/20 px-1.5 text-[10px] font-semibold text-cyan-100">{CONNECTED_SITES.length}</span>
                </Link>

                <ResourcesMenu />

                <button className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-2.5 sm:px-3 py-1 text-[11px] font-semibold text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.35)] hover:brightness-110 shrink-0">
                  <span className="sm:hidden">+ New</span>
                  <span className="hidden sm:inline">+ New Website</span>
                </button>
                <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-800 bg-slate-950/60 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                </button>
              </div>
            </header>
            <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-5 overflow-x-hidden">
              <Outlet />
            </main>
          </div>
          <Toaster theme="dark" position="top-right" richColors closeButton />
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  );
}

type IntegrationStatus = "connected" | "action" | "disconnected";
type Integration = {
  id: string;
  name: string;
  icon: typeof Search;
  status: IntegrationStatus;
  detail: string;
  accent: string;
};
type ConnectedSite = {
  id: string;
  domain: string;
  label: string;
  health: "healthy" | "attention" | "onboarding";
  integrations: Integration[];
};

const CONNECTED_SITES: ConnectedSite[] = [
  {
    id: "safaeewala",
    domain: "safaeewala.com",
    label: "Safaeewala Cleaning Services",
    health: "onboarding",
    integrations: [
      { id: "gsc", name: "Search Console", icon: Search, status: "connected", detail: "Syncing daily", accent: "from-emerald-400 to-teal-500" },
      { id: "ga4", name: "Analytics 4", icon: BarChart3, status: "connected", detail: "Property 342118", accent: "from-amber-400 to-orange-500" },
      { id: "wp", name: "WP Connector", icon: Zap, status: "action", detail: "Reauth required", accent: "from-sky-400 to-blue-500" },
    ],
  },
];

function statusStyles(s: IntegrationStatus) {
  switch (s) {
    case "connected":
      return { pill: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200", icon: CheckCircle2, cta: "Manage" };
    case "action":
      return { pill: "border-amber-400/40 bg-amber-400/10 text-amber-200", icon: AlertCircle, cta: "Fix" };
    default:
      return { pill: "border-slate-600/60 bg-slate-800/60 text-slate-300", icon: Link2, cta: "Connect" };
  }
}

function ConnectedSitesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const totalSites = CONNECTED_SITES.length;
  const totalIntegrations = CONNECTED_SITES.reduce((a, s) => a + s.integrations.length, 0);
  const connectedIntegrations = CONNECTED_SITES.reduce(
    (a, s) => a + s.integrations.filter((i) => i.status === "connected").length,
    0
  );
  const needsAttention = CONNECTED_SITES.reduce(
    (a, s) => a + s.integrations.filter((i) => i.status !== "connected").length,
    0
  );

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`hidden lg:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] shrink-0 transition ${
          open
            ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
        }`}
      >
        <Globe className="h-3 w-3" />
        Connected Sites
        <span className="ml-1 rounded-full bg-cyan-400/20 px-1.5 text-[10px] font-semibold text-cyan-100">{totalSites}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Connected sites dashboard"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/95 shadow-[0_20px_60px_-15px_rgba(34,211,238,0.35)] backdrop-blur-xl"
        >
          <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
          <div className="flex items-start justify-between border-b border-slate-800/80 px-4 py-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">Network overview</div>
              <h3 className="text-sm font-semibold text-white">Connected Sites</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-slate-800/80 px-4 py-3">
            <Stat label="Sites" value={totalSites} tone="cyan" />
            <Stat label="Live links" value={`${connectedIntegrations}/${totalIntegrations}`} tone="emerald" />
            <Stat label="Attention" value={needsAttention} tone={needsAttention ? "amber" : "slate"} />
          </div>

          <div className="max-h-[52vh] space-y-3 overflow-y-auto px-4 py-3">
            {CONNECTED_SITES.map((site) => (
              <div key={site.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        site.health === "healthy" ? "bg-emerald-400" : site.health === "attention" ? "bg-amber-400" : "bg-cyan-300"
                      } shadow-[0_0_6px_currentColor]`} />
                      <span className="truncate text-[13px] font-semibold text-white">{site.label}</span>
                    </div>
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 hover:underline"
                    >
                      {site.domain} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200">
                    {site.health}
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {site.integrations.map((intg) => {
                    const s = statusStyles(intg.status);
                    const Icon = intg.icon;
                    const StatusIcon = s.icon;
                    return (
                      <li key={intg.id}>
                        <button
                          type="button"
                          className="group flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-slate-950/60 px-2.5 py-2 text-left transition hover:border-cyan-400/40 hover:bg-slate-900/70"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className={`relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-800`}>
                              <span className={`absolute inset-0 bg-gradient-to-br ${intg.accent} opacity-30`} />
                              <Icon className="relative h-3.5 w-3.5 text-white" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium text-white">{intg.name}</span>
                              <span className="block truncate text-[10.5px] text-slate-400">{intg.detail}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${s.pill}`}>
                              <StatusIcon className="h-2.5 w-2.5" />
                              {intg.status === "connected" ? "Live" : intg.status === "action" ? "Action" : "Off"}
                            </span>
                            <span className="text-[10.5px] font-medium text-cyan-300 opacity-0 transition group-hover:opacity-100">
                              {s.cta} →
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 bg-slate-950/80 px-4 py-3">
            <Link
              to="/connected-sites"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-slate-300 hover:text-cyan-200"
            >
              View all sites →
            </Link>
            <Link
              to="/connected-sites"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.35)] hover:brightness-110"
            >
              <Link2 className="h-3 w-3" /> Manage sites
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "cyan" | "emerald" | "amber" | "slate";
}) {
  const map = {
    cyan: "text-cyan-200",
    emerald: "text-emerald-200",
    amber: "text-amber-200",
    slate: "text-slate-300",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1.5">
      <div className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${map[tone]}`}>{value}</div>
    </div>
  );
}
