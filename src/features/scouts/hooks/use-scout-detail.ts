import { useEffect, useState } from "react";
import { getScout, SCOUTS, type Scout } from "@/lib/scouts";
import { useSite } from "@/lib/site-context";

export type ScoutTabData = { available: boolean; reason?: string; [key: string]: unknown };

/**
 * Fetches real per-tab data for the current scout from /api/scouts/$id/data
 * (api.scouts.$scoutId.data.ts) -- replaces the entirely fabricated
 * metrics/activity arrays that used to live in lib/scouts.ts. `scout` here
 * still comes from lib/scouts.ts, but only for identity/layout metadata
 * (title, icon, tab labels/summaries) -- never for numbers or activity.
 */
export function useScoutDetail(scoutId: string) {
  const scout = getScout(scoutId) as Scout;
  const { currentSite } = useSite();
  const [activeTab, setActiveTab] = useState(scout?.tabs[0]?.id ?? "");
  const [data, setData] = useState<Record<string, ScoutTabData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Real input for Competitor Scout's "Sitemap Diff" tab -- the crawl only
  // runs for a domain the user actually supplies (see
  // api.scouts.$scoutId.data.ts's competitorScoutData); previously that tab
  // claimed to be usable with no field anywhere to enter one.
  const [competitorDomain, setCompetitorDomain] = useState("");

  useEffect(() => {
    if (scout?.tabs[0]) {
      setActiveTab(scout.tabs[0].id);
    }
  }, [scout?.id, scout?.tabs]);

  const load = () => {
    if (!scout?.id || !currentSite?.id) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ siteId: currentSite.id });
    if (scout.id === "competitor" && competitorDomain.trim()) {
      params.set("competitorDomain", competitorDomain.trim());
    }
    fetch(`/api/scouts/${scout.id}/data?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.ok) setData(json.data);
        else setError(json?.error || "Failed to load real scout data");
      })
      .catch((err) => setError(err.message || "Failed to load real scout data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scout?.id, currentSite?.id]);

  const tab = scout?.tabs.find((t) => t.id === activeTab) ?? scout?.tabs[0];
  const TabIcon = tab?.icon;
  const ScoutIcon = scout?.icon;
  const peers = SCOUTS.filter((s) => s.id !== scout?.id);
  const tabData: ScoutTabData | undefined = tab ? data?.[tab.id] : undefined;

  return {
    scout,
    activeTab,
    setActiveTab,
    tab,
    tabData,
    loading,
    error,
    refetch: load,
    TabIcon,
    ScoutIcon,
    peers,
    competitorDomain,
    setCompetitorDomain,
  };
}
