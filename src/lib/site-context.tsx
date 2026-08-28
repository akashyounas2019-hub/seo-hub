import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SiteHealth = "healthy" | "attention" | "onboarding";

export type IntegrationStatus = "connected" | "action" | "disconnected";

export type SiteIntegration = {
  id: string;
  name: string;
  status: IntegrationStatus;
  detail: string;
  accent: string;
};

// Mirrors the `sites` Postgres table (src/db/schema.ts). All metrics — KPIs,
// trends, top queries/pages, reviews, channels — are fetched live from the
// relevant Google API route per-screen; they are never stored on the site
// record itself, so this type intentionally carries no fabricated data.
export type ConnectedSite = {
  id: string;
  slug: string;
  domain: string;
  label: string;
  location: string;
  region: string | null;
  health: SiteHealth;
  pages: number;
  indexed: number;
  openFixes: number;
  gaConnected: boolean;
  gaProperty: string;
  gaPropertyId?: string | null;
  gscConnected: boolean;
  gscDomain: string;
  gbpConnected: boolean;
  gbpLocation: string;
  wpConnected: boolean;
  wpDetail: string;
  integrations: SiteIntegration[];
  createdAt: string;
  updatedAt: string;
};

function toConnectedSite(row: any): ConnectedSite {
  const integrations: SiteIntegration[] = [
    {
      id: "gsc",
      name: "Search Console",
      status: row.gscConnected ? "connected" : "disconnected",
      detail: row.gscConnected ? row.gscPropertyUrl || "Connected" : "Not connected",
      accent: "from-emerald-400 to-teal-500",
    },
    {
      id: "ga4",
      name: "Analytics 4",
      status: row.gaConnected ? "connected" : "disconnected",
      detail: row.gaConnected ? row.gaPropertyLabel || row.gaPropertyId || "Connected" : "Not connected",
      accent: "from-amber-400 to-orange-500",
    },
    {
      id: "gbp",
      name: "Business Profile",
      status: row.gbpConnected ? "connected" : "disconnected",
      detail: row.gbpConnected ? row.gbpLocationName || "Connected" : "Not connected",
      accent: "from-rose-400 to-pink-500",
    },
    {
      id: "wp",
      name: "WP Connector",
      status: row.wpConnected ? "connected" : "disconnected",
      detail: row.wpConnected ? row.wpDetail || "Connected" : "Not installed",
      accent: "from-sky-400 to-blue-500",
    },
  ];

  return {
    id: row.id,
    slug: row.slug,
    domain: row.domain,
    label: row.name,
    location: [row.city, row.region].filter(Boolean).join(", ") || row.region || "—",
    region: row.region ?? null,
    health: row.health || "onboarding",
    pages: row.pagesTotal ?? 0,
    indexed: row.pagesIndexed ?? 0,
    openFixes: row.openFixes ?? 0,
    gaConnected: !!row.gaConnected,
    gaProperty: row.gaConnected ? row.gaPropertyLabel || row.gaPropertyId || "Connected" : "Not Connected",
    gaPropertyId: row.gaPropertyId ?? null,
    gscConnected: !!row.gscConnected,
    gscDomain: row.gscConnected ? row.gscPropertyUrl || row.domain : "Not Connected",
    gbpConnected: !!row.gbpConnected,
    gbpLocation: row.gbpConnected ? row.gbpLocationName || "Connected" : "Not Connected",
    wpConnected: !!row.wpConnected,
    wpDetail: row.wpConnected ? row.wpDetail || "Connected" : "Not installed",
    integrations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type SiteContextType = {
  currentSite: ConnectedSite;
  allSites: ConnectedSite[];
  isHydrated: boolean;
  isLoading: boolean;
  loadError: string | null;
  refreshSites: () => Promise<void>;
  setCurrentSiteId: (id: string) => void;
  deleteSite: (id: string) => void;
};

const SiteContext = createContext<SiteContextType | undefined>(undefined);

const ACTIVE_SITE_KEY = "aks.activeSiteId";

const EMPTY_SITE: ConnectedSite = {
  id: "",
  slug: "",
  domain: "—",
  label: "No sites connected",
  location: "—",
  region: null,
  health: "onboarding",
  pages: 0,
  indexed: 0,
  openFixes: 0,
  gaConnected: false,
  gaProperty: "Not Connected",
  gscConnected: false,
  gscDomain: "Not Connected",
  gbpConnected: false,
  gbpLocation: "Not Connected",
  wpConnected: false,
  wpDetail: "Not installed",
  integrations: [],
  createdAt: "",
  updatedAt: "",
};

export function SiteProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allSites, setAllSites] = useState<ConnectedSite[]>([]);
  const [siteId, setSiteId] = useState<string>("");

  const fetchSites = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sites");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.sites)) {
        const mapped = json.sites.map(toConnectedSite);
        setAllSites(mapped);
        setLoadError(null);

        setSiteId((prevId) => {
          if (prevId && mapped.some((s: ConnectedSite) => s.id === prevId)) return prevId;
          let stored = "";
          try {
            stored = window.localStorage.getItem(ACTIVE_SITE_KEY) || "";
          } catch {
            /* ignore */
          }
          if (stored && mapped.some((s: ConnectedSite) => s.id === stored)) return stored;
          return mapped[0]?.id || "";
        });
      } else {
        setLoadError(json?.error || "Failed to load sites");
      }
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load sites");
    } finally {
      setIsLoading(false);
      setIsHydrated(true);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const setCurrentSiteId = (id: string) => {
    setSiteId(id);
    try {
      window.localStorage.setItem(ACTIVE_SITE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const deleteSite = async (idToDelete: string) => {
    // optimistic UI update
    setAllSites((prev) => {
      const updated = prev.filter((s) => s.id !== idToDelete);
      if (siteId === idToDelete && updated.length > 0) {
        setCurrentSiteId(updated[0].id);
      }
      return updated;
    });
    try {
      await fetch(`/api/sites/${idToDelete}`, { method: "DELETE" });
    } catch {
      /* the next refreshSites() call will reconcile state if this failed */
    }
  };

  const currentSite = allSites.find((s) => s.id === siteId) || allSites[0] || EMPTY_SITE;

  return (
    <SiteContext.Provider
      value={{
        currentSite,
        allSites,
        isHydrated,
        isLoading,
        loadError,
        refreshSites: fetchSites,
        setCurrentSiteId,
        deleteSite,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error("useSite must be used within a SiteProvider");
  }
  return context;
}
