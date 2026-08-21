import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Users,
  Eye,
  MapPin,
  Target,
  type LucideIcon,
} from "lucide-react";

export type SiteHealth = "healthy" | "attention" | "onboarding";

export type IntegrationStatus = "connected" | "action" | "disconnected";

export type SiteIntegration = {
  id: string;
  name: string;
  status: IntegrationStatus;
  detail: string;
  accent: string;
};

export type SiteKpi = {
  k: string;
  v: string;
  d: number;
  icon: LucideIcon;
  accent: string;
  src: string;
  tab: "ga" | "gsc" | "gbp";
  invertColors?: boolean;
};

export type QueryItem = {
  q: string;
  clicks: number;
  imp: number;
  ctr: number;
  pos: number;
  delta: number;
};

export type PageItem = {
  url: string;
  views: string;
  conv: number;
  cwv: "Good" | "Needs" | "Poor";
  bounce: string;
};

export type ReviewItem = {
  author: string;
  rating: number;
  text: string;
  ago: string;
  status: "Replied" | "Pending";
};

export type ChannelItem = {
  channel: string;
  sessions: string;
  share: number;
  color: string;
};

export type ConnectedSite = {
  id: string;
  domain: string;
  label: string;
  location: string;
  health: SiteHealth;
  score: number;
  pages: number;
  indexed: number;
  openFixes: number;
  lastSync: string;
  gaConnected: boolean;
  gaProperty: string;
  gaRealtimeUsers: number;
  gscConnected: boolean;
  gscDomain: string;
  gbpConnected: boolean;
  gbpLocation: string;
  gbpRating: number;
  gbpReviewCount: number;
  overviewKpis: SiteKpi[];
  trafficTrend: number[];
  impressionsTrend: number[];
  topQueries: QueryItem[];
  topPages: PageItem[];
  gmbReviews: ReviewItem[];
  acquisitionChannels: ChannelItem[];
  integrations: SiteIntegration[];
};

export const CONNECTED_SITES: ConnectedSite[] = [
  {
    id: "safaeewala",
    domain: "safaeewala.com",
    label: "Safaeewala Cleaning Services",
    location: "Dubai, UAE",
    health: "onboarding",
    score: 62,
    pages: 34,
    indexed: 28,
    openFixes: 4,
    lastSync: "3 min ago",
    gaConnected: true,
    gaProperty: "GA4-Safaeewala-Dubai (377896920)",
    gaRealtimeUsers: 42,
    gscConnected: true,
    gscDomain: "sc-domain:safaeewala.com",
    gbpConnected: true,
    gbpLocation: "Downtown Dubai Branch",
    gbpRating: 4.8,
    gbpReviewCount: 124,
    overviewKpis: [
      { k: "Organic Sessions", v: "543", d: 12.4, icon: Users, accent: "from-cyan-400 to-sky-500", src: "Google Analytics (Live)", tab: "ga" },
      { k: "Search Impressions", v: "28.9k", d: 18.2, icon: Eye, accent: "from-violet-400 to-fuchsia-500", src: "Search Console", tab: "gsc" },
      { k: "GMB Actions", v: "1,686", d: 22.1, icon: MapPin, accent: "from-amber-400 to-orange-500", src: "Business Profile", tab: "gbp" },
      { k: "Avg Position", v: "28.7", d: 1.6, icon: Target, accent: "from-emerald-400 to-teal-500", src: "Search Console", tab: "gsc", invertColors: true },
    ],
    trafficTrend: [22, 17, 12, 16, 17, 17, 18, 16, 16, 14, 22, 28, 19, 19, 11],
    impressionsTrend: [12, 14, 18, 17, 22, 26, 24, 30, 34, 32, 38, 42, 45, 48],
    topQueries: [
      { q: "safaeewala cleaning & technical services llc", clicks: 20, imp: 173, ctr: 11.6, pos: 1.5, delta: 2 },
      { q: "cleaning services dubai", clicks: 14, imp: 838, ctr: 1.7, pos: 23.1, delta: 5 },
      { q: "safaeewala", clicks: 12, imp: 94, ctr: 12.8, pos: 1.1, delta: 1 },
      { q: "cleaning companies in dubai", clicks: 7, imp: 175, ctr: 4.0, pos: 16.9, delta: 3 },
      { q: "deep cleaning services dubai", clicks: 5, imp: 398, ctr: 1.3, pos: 17.4, delta: 4 },
    ],
    topPages: [
      { url: "/", views: "647", conv: 121, cwv: "Good", bounce: "25.5%" },
      { url: "/contact-us/", views: "18", conv: 32, cwv: "Good", bounce: "0.0%" },
      { url: "/service/medical-cleaning-services/", views: "13", conv: 0, cwv: "Good", bounce: "44.4%" },
      { url: "/service/house-cleaning-services-in-dubai/", views: "10", conv: 0, cwv: "Needs", bounce: "100.0%" },
    ],
    gmbReviews: [
      { author: "Sara M.", rating: 5, text: "Outstanding deep cleaning for our apartment in Marina. On time and meticulous!", ago: "2h", status: "Replied" },
      { author: "Faisal R.", rating: 5, text: "Sofa sanitization removed old stains completely. Highly recommended.", ago: "1d", status: "Replied" },
      { author: "Priya S.", rating: 4, text: "Great service quality, friendly team.", ago: "3d", status: "Pending" },
    ],
    acquisitionChannels: [
      { channel: "Organic Search", sessions: "318", share: 58, color: "bg-cyan-400" },
      { channel: "Direct", sessions: "91", share: 16, color: "bg-blue-500" },
      { channel: "AI Assistant", sessions: "64", share: 12, color: "bg-purple-400" },
      { channel: "Organic Social", sessions: "40", share: 7, color: "bg-amber-400" },
      { channel: "Referral", sessions: "31", share: 6, color: "bg-emerald-400" },
    ],
    integrations: [
      { id: "ga4", name: "Analytics 4", status: "connected", detail: "Property 377896920", accent: "from-amber-400 to-orange-500" },
      { id: "gsc", name: "Search Console", status: "connected", detail: "Syncing daily · 34 URLs", accent: "from-emerald-400 to-teal-500" },
      { id: "gmb", name: "Business Profile", status: "connected", detail: "Downtown Dubai", accent: "from-rose-400 to-pink-500" },
    ],
  },
  {
    id: "northwind",
    domain: "northwindlogistics.io",
    label: "Northwind Logistics",
    location: "London, UK",
    health: "healthy",
    score: 84,
    pages: 128,
    indexed: 121,
    openFixes: 2,
    lastSync: "1 min ago",
    gaConnected: false,
    gaProperty: "Not Connected",
    gaRealtimeUsers: 0,
    gscConnected: false,
    gscDomain: "Not Connected",
    gbpConnected: false,
    gbpLocation: "Not Connected",
    gbpRating: 0,
    gbpReviewCount: 0,
    overviewKpis: [
      { k: "Organic Sessions", v: "N/A", d: 0, icon: Users, accent: "from-slate-600 to-slate-700", src: "Google Analytics (Not Connected)", tab: "ga" },
      { k: "Search Impressions", v: "N/A", d: 0, icon: Eye, accent: "from-slate-600 to-slate-700", src: "Search Console (Not Connected)", tab: "gsc" },
      { k: "GMB Actions", v: "N/A", d: 0, icon: MapPin, accent: "from-slate-600 to-slate-700", src: "Business Profile (Not Connected)", tab: "gbp" },
      { k: "Avg Position", v: "N/A", d: 0, icon: Target, accent: "from-slate-600 to-slate-700", src: "Search Console (Not Connected)", tab: "gsc" },
    ],
    trafficTrend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    impressionsTrend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    topQueries: [],
    topPages: [],
    gmbReviews: [],
    acquisitionChannels: [],
    integrations: [
      { id: "ga4", name: "Analytics 4", status: "disconnected", detail: "Action required", accent: "from-slate-600 to-slate-700" },
      { id: "gsc", name: "Search Console", status: "disconnected", detail: "Action required", accent: "from-slate-600 to-slate-700" },
      { id: "gmb", name: "Business Profile", status: "disconnected", detail: "Action required", accent: "from-slate-600 to-slate-700" },
    ],
  },
];

type SiteContextType = {
  currentSite: ConnectedSite;
  allSites: ConnectedSite[];
  isHydrated: boolean;
  isSyncing: boolean;
  lastSyncTime: string;
  triggerSync: () => Promise<void>;
  setCurrentSiteId: (id: string) => void;
  deleteSite: (id: string) => void;
};

const SiteContext = createContext<SiteContextType | undefined>(undefined);

const STORAGE_KEY = "aks.activeSiteId";
const SITES_STORAGE_KEY = "aks.connectedSites";
const DELETED_STORAGE_KEY = "aks.deletedSiteIds";

function getDeletedSiteIds(): string[] {
  if (typeof window === "undefined") return ["aurora-dental", "atlas-outdoor"];
  try {
    const raw = window.localStorage.getItem(DELETED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return ["aurora-dental", "atlas-outdoor"];
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Just now");

  const [allSites, setAllSites] = useState<ConnectedSite[]>(() => {
    const deleted = getDeletedSiteIds();
    let sites = CONNECTED_SITES;
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(SITES_STORAGE_KEY);
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) sites = parsed;
        }
      } catch {
        /* fallback */
      }
    }
    return sites.filter((s) => !deleted.includes(s.id));
  });

  const [siteId, setSiteId] = useState<string>(() => {
    if (typeof window === "undefined") return "safaeewala";
    try {
      return window.localStorage.getItem(STORAGE_KEY) || "safaeewala";
    } catch {
      return "safaeewala";
    }
  });

  const fetchLiveSync = async (targetId: string) => {
    try {
      setIsSyncing(true);
      const res = await fetch(`/api/analytics/sync?siteId=${encodeURIComponent(targetId)}`);
      if (!res.ok) return;
      const json = await res.json();

      if (json?.data) {
        const synced = json.data;
        setAllSites((prev) =>
          prev.map((s) => {
            if (s.id !== targetId) return s;

            const updatedOverviewKpis = s.overviewKpis.map((kpi) => {
              if (kpi.tab === "ga" && synced.ga?.sessions) {
                return { ...kpi, v: String(synced.ga.sessions) };
              }
              if (kpi.tab === "gsc" && kpi.k === "Search Impressions" && synced.gsc?.impressions) {
                return { ...kpi, v: `${Math.round(synced.gsc.impressions / 1000)}k` };
              }
              if (kpi.tab === "gsc" && kpi.k === "Avg Position" && synced.gsc?.avgPosition) {
                return { ...kpi, v: String(synced.gsc.avgPosition) };
              }
              if (kpi.tab === "gbp" && synced.gbp?.calls) {
                return { ...kpi, v: String(synced.gbp.calls + (synced.gbp.directionRequests || 0)) };
              }
              return kpi;
            });

            return {
              ...s,
              lastSync: "Just now",
              overviewKpis: updatedOverviewKpis,
              trafficTrend: synced.overview?.trafficTrend || s.trafficTrend,
              impressionsTrend: synced.overview?.impressionsTrend || s.impressionsTrend,
              topQueries: synced.gsc?.topQueries || s.topQueries,
              topPages: synced.ga?.topPages || s.topPages,
              gmbReviews: synced.gbp?.reviewsList || s.gmbReviews,
              acquisitionChannels: synced.ga?.acquisitionChannels || s.acquisitionChannels,
            };
          }),
        );
        setLastSyncTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } catch {
      /* ignore poll errors */
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerSync = async () => {
    try {
      setIsSyncing(true);
      await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, source: "manual_trigger" }),
      });
      await fetchLiveSync(siteId);
    } catch {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const deleted = getDeletedSiteIds();
      window.localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deleted));

      const stored = window.localStorage.getItem(SITES_STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setAllSites(parsed.filter((s: ConnectedSite) => !deleted.includes(s.id)));
        }
      } else {
        const filteredDefaults = CONNECTED_SITES.filter((s) => !deleted.includes(s.id));
        setAllSites(filteredDefaults);
        window.localStorage.setItem(SITES_STORAGE_KEY, JSON.stringify(filteredDefaults));
      }
    } catch {
      /* ignore */
    }
    setIsHydrated(true);

    // Initial fetch and 30-second interval polling
    fetchLiveSync(siteId);
    const interval = setInterval(() => {
      fetchLiveSync(siteId);
    }, 30000);

    return () => clearInterval(interval);
  }, [siteId]);

  const setCurrentSiteId = (id: string) => {
    setSiteId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const deleteSite = (idToDelete: string) => {
    try {
      const deleted = getDeletedSiteIds();
      const newDeleted = Array.from(new Set([...deleted, idToDelete]));
      window.localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(newDeleted));
    } catch {
      /* ignore */
    }

    setAllSites((prev) => {
      const updated = prev.filter((s) => s.id !== idToDelete);
      try {
        window.localStorage.setItem(SITES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      if (siteId === idToDelete && updated.length > 0) {
        setCurrentSiteId(updated[0].id);
      }
      return updated;
    });
  };

  const currentSite =
    allSites.find((s) => s.id === siteId) || allSites[0] || CONNECTED_SITES[0];

  return (
    <SiteContext.Provider
      value={{
        currentSite,
        allSites,
        isHydrated,
        isSyncing,
        lastSyncTime,
        triggerSync,
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
