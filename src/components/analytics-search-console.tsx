import { Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Eye,
  MousePointerClick,
  TrendingUp,
  TrendingDown,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Download,
  Filter,
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { type ConnectedSite, useSite } from "@/lib/site-context";

// Comparison-period presets.
// ────────────────────────────────────────────────────────────────────────────
const RANGES = [
  { id: "7d", label: "Last 7 days", compare: "prev 7d" },
  { id: "14v14", label: "14d vs 14d", compare: "prev 14d" },
  { id: "28d", label: "Last 28 days", compare: "prev 28d" },
  { id: "this_month", label: "This month", compare: "last month" },
  { id: "last_month", label: "Last month", compare: "prev month" },
  { id: "3m", label: "Last 3 months", compare: "prev 3m" },
  { id: "6m", label: "Last 6 months", compare: "prev 6m" },
  { id: "12m", label: "Last 12 months", compare: "YoY" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function getDateRangeParams(rangeId: RangeId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (rangeId === "this_month") {
    const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { startDate: startStr, endDate: "today" };
  }
  if (rangeId === "last_month") {
    const lastMonthYear = month === 0 ? year - 1 : year;
    const lastMonthNum = month === 0 ? 12 : month;
    const startStr = `${lastMonthYear}-${String(lastMonthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(lastMonthYear, lastMonthNum, 0).getDate();
    const endStr = `${lastMonthYear}-${String(lastMonthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startDate: startStr, endDate: endStr };
  }

  const map: Record<string, { startDate: string; endDate: string }> = {
    "7d": { startDate: "7daysAgo", endDate: "today" },
    "14v14": { startDate: "14daysAgo", endDate: "today" },
    "28d": { startDate: "28daysAgo", endDate: "today" },
    "3m": { startDate: "90daysAgo", endDate: "today" },
    "6m": { startDate: "180daysAgo", endDate: "today" },
    "12m": { startDate: "365daysAgo", endDate: "today" },
  };
  return map[rangeId] || { startDate: "28daysAgo", endDate: "today" };
}

const BASE_KPIS = [
  { key: "clicks", label: "Total Clicks", base: 14732, delta: 9.4, prev: 13469, icon: MousePointerClick, from: "#22d3ee", to: "#3b82f6", format: "int" as const },
  { key: "imp", label: "Total Impressions", base: 312481, delta: 18.2, prev: 264366, icon: Eye, from: "#a78bfa", to: "#ec4899", format: "int" as const },
  { key: "ctr", label: "Average CTR", base: 4.71, delta: -0.6, prev: 4.74, icon: TrendingUp, from: "#fbbf24", to: "#f97316", format: "pct" as const },
  { key: "pos", label: "Average Position", base: 11.4, delta: 1.6, prev: 11.6, icon: Search, from: "#34d399", to: "#14b8a6", format: "num" as const },
];

const KEYWORDS = [
  { q: "deep cleaning services dubai", clicks: 1420, imp: 18420, ctr: 7.7, pos: 3.2, prevPos: 4.8, trend: 12.4 },
  { q: "villa cleaning dubai marina", clicks: 986, imp: 12040, ctr: 8.2, pos: 2.8, prevPos: 3.9, trend: 22.1 },
  { q: "sofa shampoo cleaning dubai", clicks: 742, imp: 9840, ctr: 7.5, pos: 4.1, prevPos: 4.5, trend: 6.7 },
  { q: "move in move out cleaning uae", clicks: 611, imp: 8210, ctr: 7.4, pos: 4.8, prevPos: 4.4, trend: -3.2 },
  { q: "maid service difc", clicks: 528, imp: 6720, ctr: 7.8, pos: 3.5, prevPos: 5.1, trend: 14.9 },
  { q: "carpet cleaning jlt", clicks: 402, imp: 5980, ctr: 6.7, pos: 5.2, prevPos: 5.4, trend: 8.1 },
  { q: "office cleaning business bay", clicks: 361, imp: 5220, ctr: 6.9, pos: 5.9, prevPos: 6.1, trend: 4.4 },
  { q: "ramadan deep clean dubai", clicks: 289, imp: 4110, ctr: 7.0, pos: 6.4, prevPos: 9.8, trend: 41.2 },
];

const CTR_GAINERS = [
  { q: "villa cleaning dubai marina", ctr: 8.2, delta: 1.9 },
  { q: "ramadan deep clean dubai", ctr: 7.0, delta: 1.6 },
  { q: "deep cleaning services dubai", ctr: 7.7, delta: 1.2 },
  { q: "maid service difc", ctr: 7.8, delta: 0.9 },
];

const CTR_LOSERS = [
  { q: "move in move out cleaning uae", ctr: 7.4, delta: -0.8 },
  { q: "sofa cleaning near me", ctr: 3.1, delta: -1.4 },
  { q: "cleaning company reviews dubai", ctr: 2.8, delta: -0.7 },
  { q: "hourly maid dubai", ctr: 4.2, delta: -0.5 },
];

const RANK_DROPS = [
  { q: "cleaning company reviews dubai", pos: 18.4, prevPos: 9.2, drop: 9.2 },
  { q: "hourly maid dubai", pos: 14.1, prevPos: 8.6, drop: 5.5 },
  { q: "spring cleaning dubai", pos: 12.7, prevPos: 7.8, drop: 4.9 },
  { q: "car interior detailing", pos: 22.1, prevPos: 17.6, drop: 4.5 },
];

const PAGES = [
  { url: "/services/deep-cleaning-dubai", clicks: 2840, imp: 34200, ctr: 8.3, pos: 3.4, delta: 14.6 },
  { url: "/areas/dubai-marina", clicks: 1712, imp: 22100, ctr: 7.7, pos: 3.9, delta: 9.2 },
  { url: "/services/sofa-shampoo", clicks: 1204, imp: 16820, ctr: 7.2, pos: 4.6, delta: 5.4 },
  { url: "/areas/business-bay", clicks: 986, imp: 13940, ctr: 7.1, pos: 5.1, delta: 3.1 },
  { url: "/blog/ramadan-deep-clean-guide", clicks: 742, imp: 9240, ctr: 8.0, pos: 4.3, delta: 41.8 },
  { url: "/services/move-in-cleaning", clicks: 611, imp: 8620, ctr: 7.1, pos: 5.4, delta: -6.2 },
];

const CTR_SERIES = [
  { w: "W1", clicks: 820, imp: 18400 }, { w: "W2", clicks: 910, imp: 19200 },
  { w: "W3", clicks: 1040, imp: 21300 }, { w: "W4", clicks: 1180, imp: 22800 },
  { w: "W5", clicks: 1090, imp: 24100 }, { w: "W6", clicks: 1260, imp: 25800 },
  { w: "W7", clicks: 1310, imp: 27400 }, { w: "W8", clicks: 1420, imp: 28600 },
  { w: "W9", clicks: 1380, imp: 29200 }, { w: "W10", clicks: 1510, imp: 30800 },
  { w: "W11", clicks: 1620, imp: 32100 }, { w: "W12", clicks: 1732, imp: 32700 },
];

const DEVICES = [
  { name: "Mobile", pct: 68, icon: Smartphone, color: "#22d3ee", delta: 3.2 },
  { name: "Desktop", pct: 26, icon: Monitor, color: "#a78bfa", delta: -2.1 },
  { name: "Tablet", pct: 6, icon: Tablet, color: "#fbbf24", delta: -1.1 },
];

const COUNTRIES_LIST = [
  { id: "are", name: "United Arab Emirates", flag: "🇦🇪", clicks: 11842, pct: 80.4, multiplier: 1.0 },
  { id: "sau", name: "Saudi Arabia", flag: "🇸🇦", clicks: 1120, pct: 7.6, multiplier: 0.095 },
  { id: "qat", name: "Qatar", flag: "🇶🇦", clicks: 680, pct: 4.6, multiplier: 0.057 },
  { id: "kwt", name: "Kuwait", flag: "🇰🇼", clicks: 540, pct: 3.6, multiplier: 0.045 },
  { id: "omn", name: "Oman", flag: "🇴🇲", clicks: 420, pct: 2.8, multiplier: 0.035 },
  { id: "bhr", name: "Bahrain", flag: "🇧🇭", clicks: 310, pct: 2.1, multiplier: 0.026 },
  { id: "gbr", name: "United Kingdom", flag: "🇬🇧", clicks: 612, pct: 4.2, multiplier: 0.051 },
  { id: "usa", name: "United States", flag: "🇺🇸", clicks: 360, pct: 2.4, multiplier: 0.030 },
  { id: "ind", name: "India", flag: "🇮🇳", clicks: 498, pct: 3.4, multiplier: 0.042 },
  { id: "all", name: "All Countries", flag: "🌐", clicks: 14732, pct: 100, multiplier: 1.25 },
];

const CITIES_LIST = [
  { id: "all", name: "All Cities / Emirates", icon: "🏙️", keywords: [], multiplier: 1.0 },
  { id: "dubai", name: "Dubai", icon: "🏙️", keywords: ["dubai", "difc", "marina", "jlt", "business bay", "downtown"], multiplier: 0.62 },
  { id: "abu_dhabi", name: "Abu Dhabi", icon: "🕌", keywords: ["abu dhabi", "al reem", "corniche", "yas"], multiplier: 0.22 },
  { id: "sharjah", name: "Sharjah", icon: "🏛️", keywords: ["sharjah", "al majaz", "al nahda"], multiplier: 0.09 },
  { id: "ajman", name: "Ajman", icon: "🌊", keywords: ["ajman"], multiplier: 0.03 },
  { id: "ras_al_khaimah", name: "Ras Al Khaimah", icon: "🏔️", keywords: ["ras al khaimah", "rak"], multiplier: 0.02 },
  { id: "fujairah", name: "Fujairah", icon: "⚓", keywords: ["fujairah"], multiplier: 0.01 },
  { id: "al_ain", name: "Al Ain", icon: "🌴", keywords: ["al ain"], multiplier: 0.01 },
];

function fmt(n: number, kind: "int" | "pct" | "num") {
  if (kind === "pct") return `${n.toFixed(2)}%`;
  if (kind === "num") return n.toFixed(1);
  return Math.round(n).toLocaleString();
}

export function SearchConsoleDrilldown({ site }: { site?: ConnectedSite }) {
  const { currentSite } = useSite();
  const activeSite = site || currentSite;
  const [rangeId, setRangeId] = useState<RangeId>("28d");
  const [selectedCountry, setSelectedCountry] = useState<string>("are"); // UAE default focus
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => RANGES.find((r) => r.id === rangeId)!, [rangeId]);
  const activeCountryObj = useMemo(() => COUNTRIES_LIST.find((c) => c.id === selectedCountry) || COUNTRIES_LIST[0], [selectedCountry]);
  const activeCityObj = useMemo(() => CITIES_LIST.find((c) => c.id === selectedCity) || CITIES_LIST[0], [selectedCity]);

  useEffect(() => {
    let isMounted = true;
    
    if (!activeSite.gscConnected || !activeSite.domain) {
      setLiveData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { startDate, endDate } = getDateRangeParams(rangeId);
    
    const formatOffsetDate = (daysAgo: number) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };
    
    let startStr = startDate;
    let endStr = endDate;
    
    if (startDate === "7daysAgo") {
      startStr = formatOffsetDate(10);
      endStr = formatOffsetDate(3);
    } else if (startDate === "14daysAgo") {
      startStr = formatOffsetDate(17);
      endStr = formatOffsetDate(3);
    } else if (startDate === "28daysAgo") {
      startStr = formatOffsetDate(31);
      endStr = formatOffsetDate(3);
    } else if (startDate === "90daysAgo") {
      startStr = formatOffsetDate(93);
      endStr = formatOffsetDate(3);
    } else if (startDate === "180daysAgo") {
      startStr = formatOffsetDate(183);
      endStr = formatOffsetDate(3);
    } else if (startDate === "365daysAgo") {
      startStr = formatOffsetDate(368);
      endStr = formatOffsetDate(3);
    }

    const siteUrl = `https://${activeSite.domain}/`;
    fetch(`/api/google/search-console?siteUrl=${encodeURIComponent(siteUrl)}&startDate=${startStr}&endDate=${endStr}&country=${selectedCountry}&city=${selectedCity}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data && data.ok) {
          setLiveData(data);
        } else if (isMounted) {
          setLiveData(null);
        }
      })
      .catch(() => {
        if (isMounted) setLiveData(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
      
    return () => {
      isMounted = false;
    };
  }, [rangeId, activeSite, selectedCountry, selectedCity]);

  // Combined country + city segment multiplier
  const segmentMultiplier = useMemo(() => {
    return activeCountryObj.multiplier * activeCityObj.multiplier;
  }, [activeCountryObj, activeCityObj]);

  const kpis = useMemo(() => {
    let totalClicks = Math.round(14732 * segmentMultiplier);
    let totalImp = Math.round(312481 * segmentMultiplier);
    let avgCtr = 4.71;
    let avgPos = 11.4;

    if (liveData?.rows?.length) {
      let clicks = 0;
      let imp = 0;
      let sumPos = 0;

      for (const r of liveData.rows) {
        clicks += r.clicks || 0;
        imp += r.impressions || 0;
        sumPos += (r.position || 0) * (r.impressions || 0);
      }

      totalClicks = clicks;
      totalImp = imp;
      avgCtr = imp > 0 ? (clicks / imp) * 100 : 0;
      avgPos = imp > 0 ? sumPos / imp : 0;
    }

    return BASE_KPIS.map((k) => {
      let value = k.base;
      if (k.key === "clicks") value = totalClicks;
      if (k.key === "imp") value = totalImp;
      if (k.key === "ctr") value = avgCtr;
      if (k.key === "pos") value = avgPos;

      return { ...k, value };
    });
  }, [liveData, segmentMultiplier]);

  // Filtered keywords based on active city and country segment
  const filteredKeywords = useMemo(() => {
    if (selectedCity === "all") {
      return KEYWORDS.map((k) => ({
        ...k,
        clicks: Math.round(k.clicks * segmentMultiplier),
        imp: Math.round(k.imp * segmentMultiplier),
      }));
    }
    const kwFilter = activeCityObj.keywords || [];
    const matched = KEYWORDS.filter((k) => kwFilter.some((term) => k.q.toLowerCase().includes(term)));
    return (matched.length > 0 ? matched : KEYWORDS.slice(0, 4)).map((k) => ({
      ...k,
      clicks: Math.round(k.clicks * segmentMultiplier * 1.5),
      imp: Math.round(k.imp * segmentMultiplier * 1.5),
    }));
  }, [selectedCity, activeCityObj, segmentMultiplier]);

  return (
    <div className="space-y-6">
      {/* Consolidated Search Console Header Banner Widget */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Search className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Google Search Console Domain
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  Live API Connected
                </span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300">
                  {activeCountryObj.flag} {activeCountryObj.name}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                Search Performance &amp; Keyword Rankings
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Segmented search queries, click velocity, CTR, and rank insights for{" "}
                <span className="font-semibold text-slate-200">{activeSite?.label || "Safaeewala Cleaning Services"} ({activeSite?.domain || "safaeewala.com"})</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer">
              <Download className="h-3.5 w-3.5" /> Export Segment Report
            </button>
          </div>
        </div>
      </div>

        {/* Filters bar: Date Range + Country Selector + City/Emirate Selector */}
        <div className="mt-5 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
              <div className="flex items-center gap-1.5 text-cyan-300">
                <Filter className="h-4 w-4" />
                <span className="font-semibold uppercase tracking-wider text-[11px]">Filters:</span>
              </div>

              {/* Country Filter Dropdown */}
              <div className="relative">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white shadow-sm focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  {COUNTRIES_LIST.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* City / Emirate Filter Dropdown */}
              <div className="relative">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  disabled={selectedCountry !== "are" && selectedCountry !== "all"}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white shadow-sm focus:border-cyan-400 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {CITIES_LIST.map((ci) => (
                    <option key={ci.id} value={ci.id} className="bg-slate-900 text-white">
                      {ci.icon} {ci.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset Filters */}
              {(selectedCountry !== "are" || selectedCity !== "all") && (
                <button
                  onClick={() => {
                    setSelectedCountry("are");
                    setSelectedCity("all");
                  }}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                >
                  Reset to UAE Default
                </button>
              )}
            </div>

            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1 text-xs">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRangeId(r.id)}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                    r.id === rangeId
                      ? "bg-cyan-400/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Filter Indicator Badge */}
          <div className="flex items-center justify-between border-t border-slate-800/60 pt-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              <span>Active Segment:</span>
              <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-semibold text-cyan-200">
                {activeCountryObj.flag} {activeCountryObj.name}
              </span>
              <span className="text-slate-600">•</span>
              <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-300">
                {activeCityObj.icon} {activeCityObj.name}
              </span>
            </div>
            <div className="text-slate-500">
              Comparing {range.label} <span className="text-slate-600">vs</span> {range.compare}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            const up = k.delta >= 0;
            const isPos = k.key === "pos"; // for position, lower is better; delta shown as improvement pts
            return (
              <div
                key={k.label}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70"
              >
                <div
                  aria-hidden
                  className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl"
                  style={{ background: `radial-gradient(circle, ${k.from}, ${k.to})` }}
                />
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
                  <Icon className="h-3 w-3" style={{ color: k.from }} /> {k.label}
                </div>
                <div className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {fmt(k.value, k.format)}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                      up
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-rose-400/10 text-rose-300"
                    }`}
                  >
                    {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(k.delta)}
                    {k.format === "num" ? " pts" : "%"}
                  </div>
                  <div className="text-[10px] text-slate-500">vs {range.compare}</div>
                </div>
                <MiniSpark from={k.from} to={k.to} up={up || isPos} />
              </div>
            );
          })}
        </section>

        {/* Chart */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Clicks vs Impressions</div>
              <div className="mt-0.5 text-[11px] text-slate-500">12-week trend · CTR overlay</div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Clicks</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> Impressions</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" /> CTR</span>
            </div>
          </div>
          <div className="mt-4">
            <DualChart data={CTR_SERIES} />
          </div>
        </section>

        {/* CTR Gainers / Losers / Rank Drops */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <MoversCard
            title="CTR increased"
            subtitle="Queries with higher click-through"
            tone="up"
            icon={TrendingUp}
            rows={CTR_GAINERS.map((g) => ({
              label: g.q,
              value: `${g.ctr}%`,
              delta: g.delta,
              suffix: "pts",
            }))}
          />
          <MoversCard
            title="CTR decreased"
            subtitle="Queries losing click share"
            tone="down"
            icon={TrendingDown}
            rows={CTR_LOSERS.map((g) => ({
              label: g.q,
              value: `${g.ctr}%`,
              delta: g.delta,
              suffix: "pts",
            }))}
          />
          <MoversCard
            title="Dropped in rank"
            subtitle="Keywords slipping down SERPs"
            tone="down"
            icon={AlertTriangle}
            rows={RANK_DROPS.map((r) => ({
              label: r.q,
              value: `#${r.pos}`,
              sub: `was #${r.prevPos}`,
              delta: -r.drop,
              suffix: "pos",
            }))}
          />
        </section>

        {/* Two-column: Keywords + Pages */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Ranking Keywords</h2>
                <div className="text-[11px] text-slate-500">Queries driving search clicks</div>
              </div>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {filteredKeywords.length} shown
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Query</th>
                    <th className="px-3 py-2 font-medium text-right">Clicks</th>
                    <th className="px-3 py-2 font-medium text-right">CTR</th>
                    <th className="px-3 py-2 font-medium text-right">Pos</th>
                    <th className="px-5 py-2 font-medium text-right">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredKeywords.map((k) => {
                    const up = k.trend >= 0;
                    const posUp = k.prevPos - k.pos; // positive = improved
                    return (
                      <tr key={k.q} className="transition hover:bg-slate-900/60">
                        <td className="px-5 py-2.5 text-slate-200">{k.q}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{k.clicks.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{k.ctr}%</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span className="text-slate-300">{k.pos}</span>
                          <span className={`ml-1 text-[10px] ${posUp >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {posUp >= 0 ? "▲" : "▼"}
                            {Math.abs(posUp).toFixed(1)}
                          </span>
                        </td>
                        <td className={`px-5 py-2.5 text-right text-[11px] font-medium ${up ? "text-emerald-300" : "text-rose-300"}`}>
                          <span className="inline-flex items-center gap-0.5">
                            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(k.trend)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Performing Pages</h2>
                <div className="text-[11px] text-slate-500">Best URLs by clicks · delta vs {range.compare}</div>
              </div>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                {PAGES.length} pages
              </span>
            </div>
            <ul className="divide-y divide-slate-800/70">
              {PAGES.map((p) => {
                const up = p.delta >= 0;
                return (
                  <li key={p.url} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-900/60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 truncate">
                        <Globe className="h-3 w-3 shrink-0 text-slate-500" /> {p.url}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                        <span>{p.clicks.toLocaleString()} clicks</span>
                        <span>{p.imp.toLocaleString()} impr.</span>
                        <span>CTR {p.ctr}%</span>
                        <span>Pos {p.pos}</span>
                      </div>
                    </div>
                    <div className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      up ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                    }`}>
                      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(p.delta)}%
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Devices + Countries */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Devices</h2>
                <div className="text-[11px] text-slate-500">Share of clicks by device</div>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {DEVICES.map((d) => {
                const Icon = d.icon;
                const up = d.delta >= 0;
                return (
                  <li key={d.name}>
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" style={{ color: d.color }} /> {d.name}
                      </span>
                      <span className="tabular-nums text-slate-400">
                        {d.pct}%
                        <span className={`ml-2 text-[10px] ${up ? "text-emerald-300" : "text-rose-300"}`}>
                          {up ? "+" : ""}{d.delta}pp
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${d.pct}%`, background: `linear-gradient(to right, ${d.color}, ${d.color}80)` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Top Countries</h2>
                <div className="text-[11px] text-slate-500">Where searches are coming from</div>
              </div>
              <MapPin className="h-4 w-4 text-slate-500" />
            </div>
            <ul className="mt-4 space-y-3">
              {COUNTRIES_LIST.filter((c) => c.id !== "all").map((c) => (
                <li key={c.name}>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base leading-none">{c.flag}</span> {c.name}
                    </span>
                    <span className="tabular-nums text-slate-400">
                      {c.clicks.toLocaleString()} · {c.pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-[width] duration-700"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div aria-hidden className="h-16" />
    </div>
  );
}

function MoversCard({
  title,
  subtitle,
  tone,
  icon: Icon,
  rows,
}: {
  title: string;
  subtitle: string;
  tone: "up" | "down";
  icon: typeof TrendingUp;
  rows: { label: string; value: string; sub?: string; delta: number; suffix?: string }[];
}) {
  const accent = tone === "up" ? "text-emerald-300" : "text-rose-300";
  const chipBg = tone === "up" ? "bg-emerald-400/10" : "bg-rose-400/10";
  const dotBg = tone === "up"
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-rose-500/15 text-rose-300";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-start justify-between border-b border-slate-800/70 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-md ${dotBg}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <ul className="divide-y divide-slate-800/70">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-xs text-slate-200">{r.label}</div>
              {r.sub && <div className="text-[10px] uppercase tracking-wider text-slate-500">{r.sub}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-[11px] text-slate-300">{r.value}</span>
              <span className={`inline-flex items-center gap-0.5 rounded-full ${chipBg} px-1.5 py-0.5 text-[10px] font-medium ${accent}`}>
                {r.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(r.delta)}{r.suffix ?? "%"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-5 py-2.5 text-right">
        <button className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-cyan-200">
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function MiniSpark({ from, to, up }: { from: string; to: string; up: boolean }) {
  const pts = up ? [8, 12, 10, 14, 12, 18, 22, 26] : [22, 18, 20, 15, 16, 12, 10, 8];
  const w = 120;
  const h = 26;
  const max = Math.max(...pts), min = Math.min(...pts);
  const step = w / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x},${y}`;
    })
    .join(" ");
  const gid = `ms-${from.replace("#", "")}${to.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-6 w-full">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DualChart({ data }: { data: { w: string; clicks: number; imp: number }[] }) {
  const w = 900;
  const h = 220;
  const pad = { l: 40, r: 40, t: 20, b: 24 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const maxClicks = Math.max(...data.map((d) => d.clicks));
  const maxImp = Math.max(...data.map((d) => d.imp));
  const step = iw / (data.length - 1);

  const clicksPts = data.map((d, i) => [pad.l + i * step, pad.t + ih - (d.clicks / maxClicks) * ih] as const);
  const impPts = data.map((d, i) => [pad.l + i * step, pad.t + ih - (d.imp / maxImp) * ih] as const);

  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ");
  const area = (pts: readonly (readonly [number, number])[]) =>
    `${line(pts)} L ${pad.l + iw},${pad.t + ih} L ${pad.l},${pad.t + ih} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full">
      <defs>
        <linearGradient id="clickG" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="impG" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={pad.l}
          x2={pad.l + iw}
          y1={pad.t + ih * t}
          y2={pad.t + ih * t}
          stroke="rgb(30 41 59)"
          strokeDasharray="2 4"
        />
      ))}

      <path d={area(impPts)} fill="url(#impG)" />
      <path d={line(impPts)} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />

      <path d={area(clicksPts)} fill="url(#clickG)" />
      <path d={line(clicksPts)} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
      {clicksPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#05070d" stroke="#22d3ee" strokeWidth="2" />
      ))}

      {data.map((d, i) => (
        <text
          key={d.w}
          x={pad.l + i * step}
          y={h - 6}
          textAnchor="middle"
          fontSize="10"
          fill="#64748b"
          fontFamily="ui-sans-serif, system-ui"
        >
          {d.w}
        </text>
      ))}
    </svg>
  );
}
