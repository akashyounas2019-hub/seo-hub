import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  PlugZap,
} from "lucide-react";
import { type ConnectedSite } from "@/lib/site-context";
import { toast } from "sonner";

type BotTraffic = { id: string; label: string; vendor: string; userAgentMatch: string; requests: number; bytesScraped: number };
type TopUrl = { path: string; requests: number };
type FirewallRule = { id: string; userAgent: string; mode: string; notes: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CloudflareAiOverview({ site }: { site?: ConnectedSite }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [bots, setBots] = useState<BotTraffic[]>([]);
  const [topUrls, setTopUrls] = useState<TopUrl[]>([]);
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("All");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/cloudflare/ai-traffic").then((r) => r.json()),
      fetch("/api/cloudflare/ai-shield").then((r) => r.json()),
    ])
      .then(([traffic, shield]) => {
        setConfigured(!!traffic.configured);
        if (traffic.ok) {
          setBots(traffic.bots || []);
          setTopUrls(traffic.topUrls || []);
        } else if (traffic.configured) {
          setError(traffic.error);
        }
        if (shield.ok) setRules(shield.rules || []);
      })
      .catch((err) => setError(err.message || "Failed to load Cloudflare data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBlocked = (b: BotTraffic) => rules.some((r) => r.userAgent === b.userAgentMatch && r.mode === "block");

  const toggleBot = async (b: BotTraffic) => {
    const nextAction = isBlocked(b) ? "allow" : "block";
    try {
      const res = await fetch("/api/cloudflare/ai-shield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: b.id, vendor: b.vendor, userAgent: b.userAgentMatch, action: nextAction }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Cloudflare WAF ${nextAction.toUpperCase()} rule applied for ${b.label}`, { description: data.message });
        load();
      } else {
        toast.error(data.error || "Failed to update Cloudflare rule");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update Cloudflare rule");
    }
  };

  const filteredBots = useMemo(() => {
    return bots.filter((b) => {
      if (filterVendor !== "All" && b.vendor !== filterVendor) return false;
      if (search && !(b.label.toLowerCase().includes(search.toLowerCase()) || b.vendor.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [bots, filterVendor, search]);

  const vendors = useMemo(() => Array.from(new Set(bots.map((b) => b.vendor))), [bots]);

  const stats = useMemo(() => {
    const totalReqs = bots.reduce((sum, b) => sum + b.requests, 0);
    const blocked = bots.filter(isBlocked);
    const blockedReqs = blocked.reduce((sum, b) => sum + b.requests, 0);
    const blockPct = totalReqs > 0 ? Math.round((blockedReqs / totalReqs) * 100) : 0;
    return { totalReqs, blockedCount: blocked.length, blockedReqs, blockPct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bots, rules]);

  if (configured === false) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
        <PlugZap className="mx-auto h-8 w-8 text-slate-600" />
        <h3 className="mt-3 text-sm font-semibold text-white">Cloudflare not connected</h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
          Set <code className="text-cyan-300">CLOUDFLARE_API_TOKEN</code> (Zone Analytics: Read + Firewall Services: Edit) and{" "}
          <code className="text-cyan-300">CLOUDFLARE_ZONE_ID</code> in the environment to see real AI bot traffic and manage
          firewall rules here. Nothing is fabricated in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cloudflare Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-950 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-orange-400/30 bg-orange-400/10 text-orange-300">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Cloudflare Edge Integration</span>
                {configured && (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                    Connected
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">AI Crawl Control &amp; Bot Audit</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Real bot traffic (last 24h) and firewall rules for{" "}
                <span className="font-semibold text-slate-200">{site?.domain || "this site"}</span>.
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/30 p-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading real Cloudflare data…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total AI Bot Requests (24h)</span>
                <Bot className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{stats.totalReqs.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Blocked (real firewall rules)</span>
                <ShieldAlert className="h-4 w-4 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-400">{stats.blockedReqs.toLocaleString()} ({stats.blockPct}%)</div>
              <div className="mt-1 text-xs font-medium text-rose-300">{stats.blockedCount} bot(s) blocked</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Allowed</span>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-300">{(stats.totalReqs - stats.blockedReqs).toLocaleString()}</div>
            </div>
          </div>

          {/* Bot Controls Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-white">AI Crawl Control Matrix</h3>
                <p className="text-xs text-slate-400">Real traffic from Cloudflare's Analytics API, filtered to known AI bot user agents.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search bot or vendor..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-xs text-slate-200 focus:border-cyan-400/40 focus:outline-none"
                  />
                </div>
                <select
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 px-3 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="All">All Vendors</option>
                  {vendors.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {bots.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
                No AI bot traffic detected in the last 24 hours for this zone.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="pb-3">AI Bot</th>
                      <th className="pb-3">Vendor</th>
                      <th className="pb-3">24h Requests</th>
                      <th className="pb-3">Data Scraped</th>
                      <th className="pb-3 text-right">Firewall Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredBots.map((b) => {
                      const blocked = isBlocked(b);
                      return (
                        <tr key={b.id} className="hover:bg-slate-900/60 transition">
                          <td className="py-3.5 font-semibold text-white flex items-center gap-2">
                            <Bot className="h-4 w-4 text-cyan-400" /> {b.label}
                          </td>
                          <td className="py-3.5">{b.vendor}</td>
                          <td className="py-3.5 font-mono text-slate-200">{b.requests.toLocaleString()}</td>
                          <td className="py-3.5 font-mono text-slate-200">{formatBytes(b.bytesScraped)}</td>
                          <td className="py-3.5 text-right">
                            <button
                              onClick={() => toggleBot(b)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                blocked
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                              }`}
                            >
                              {blocked ? (
                                <><XCircle className="h-3.5 w-3.5" /> Blocked</>
                              ) : (
                                <><CheckCircle2 className="h-3.5 w-3.5" /> Allowed</>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top URLs */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="text-base font-semibold text-white">Top URLs Targeted by AI Crawlers</h3>
            <p className="text-xs text-slate-400">Real request counts over the last 24 hours.</p>
            {topUrls.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
                No data yet.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {topUrls.map((p) => (
                  <div key={p.path} className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-xs">
                    <div className="flex items-center gap-2 font-mono text-cyan-300">
                      <Globe className="h-4 w-4 text-slate-500" /> <span>{p.path}</span>
                    </div>
                    <span className="text-slate-400">{p.requests.toLocaleString()} requests</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
