import { useEffect, useState } from "react";
import { getScout, SCOUTS, type Scout } from "@/lib/scouts";

export function useScoutDetail(scoutId: string) {
  const scout = getScout(scoutId) as Scout;
  const [activeTab, setActiveTab] = useState(scout?.tabs[0]?.id ?? "");
  const [clock, setClock] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (scout?.tabs[0]) {
      setActiveTab(scout.tabs[0].id);
    }
  }, [scout?.id, scout?.tabs]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const tab = scout?.tabs.find((t) => t.id === activeTab) ?? scout?.tabs[0];
  const TabIcon = tab?.icon;
  const ScoutIcon = scout?.icon;
  const peers = SCOUTS.filter((s) => s.id !== scout?.id);

  return {
    scout,
    activeTab,
    setActiveTab,
    clock,
    running,
    setRunning,
    tab,
    TabIcon,
    ScoutIcon,
    peers,
  };
}
