import { useState, useMemo } from "react";
import {
  Bot,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Globe,
  Lock,
  Search,
  Activity,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Sliders,
  Layers,
  FileCode,
  Sparkles,
} from "lucide-react";
import { type ConnectedSite } from "@/lib/site-context";

export type AiBotRule = {
  id: string;
  name: string;
  vendor: string;
  userAgent: string;
  purpose: string;
  blocked: boolean;
  requests24h: number;
  dataScraped: string;
  riskLevel: "Low" | "Medium" | "High";
};

const INITIAL_BOTS: AiBotRule[] = [
  {
    id: "gptbot",
    name: "GPTBot",
    vendor: "OpenAI",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    purpose: "Model Training & Web Indexing",
    blocked: true,
    requests24h: 5420,
    dataScraped: "18.4 MB",
    riskLevel: "High",
  },
  {
    id: "chatgpt-user",
    name: "ChatGPT-User",
    vendor: "OpenAI",
    userAgent: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
    purpose: "Live User Query Browsing",
    blocked: false,
    requests24h: 1890,
    dataScraped: "4.2 MB",
    riskLevel: "Low",
  },
  {
    id: "claudebot",
    name: "ClaudeBot",
    vendor: "Anthropic",
    userAgent: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    purpose: "Model Training & Context Extraction",
    blocked: true,
    requests24h: 3840,
    dataScraped: "12.1 MB",
    riskLevel: "High",
  },
  {
    id: "perplexitybot",
    name: "PerplexityBot",
    vendor: "Perplexity AI",
    userAgent: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    purpose: "Real-Time AI Search Indexing",
    blocked: false,
    requests24h: 2150,
    dataScraped: "6.8 MB",
    riskLevel: "Medium",
  },
  {
    id: "google-extended",
    name: "Google-Extended",
    vendor: "Google AI",
    userAgent: "Google-Extended",
    purpose: "Gemini & Vertex AI Training",
    blocked: true,
    requests24h: 4120,
    dataScraped: "14.2 MB",
    riskLevel: "High",
  },
  {
    id: "bytespider",
    name: "Bytespider",
    vendor: "ByteDance",
    userAgent: "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    purpose: "Aggressive Scraper / LLM Training",
    blocked: true,
    requests24h: 8940,
    dataScraped: "32.6 MB",
    riskLevel: "High",
  },
  {
    id: "ccbot",
    name: "CCBot (Common Crawl)",
    vendor: "Common Crawl",
    userAgent: "CCBot/2.0 (https://commoncrawl.org/faq/)",
    purpose: "Open Dataset Web Crawling",
    blocked: true,
    requests24h: 6210,
    dataScraped: "22.0 MB",
    riskLevel: "Medium",
  },
];

const TOP_AI_PAGES = [
  { url: "/", bots: 4210, scraped: "14.2 MB", status: "Protected (Blocked)" },
  { url: "/service/deep-cleaning/", bots: 2840, scraped: "8.9 MB", status: "Protected (Blocked)" },
  { url: "/pricing-packages/", bots: 2100, scraped: "6.1 MB", status: "Protected (Blocked)" },
  { url: "/contact-us/", bots: 940, scraped: "2.4 MB", status: "Allowed (User Agent)" },
];

export function CloudflareAiOverview({ site }: { site?: ConnectedSite }) {
  const [bots, setBots] = useState<AiBotRule[]>(INITIAL_BOTS);
  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("All");

  const toggleBot = (id: string) => {
    setBots((prev) =>
      prev.map((b) => (b.id === id ? { ...b, blocked: !b.blocked } : b))
    );
  };

  const blockAll = () => {
    setBots((prev) => prev.map((b) => ({ ...b, blocked: true })));
  };

  const allowAll = () => {
    setBots((prev) => prev.map((b) => ({ ...b, blocked: false })));
  };

  const filteredBots = useMemo(() => {
    return bots.filter((b) => {
      if (filterVendor !== "All" && b.vendor !== filterVendor) return false;
      if (
        search &&
        !(
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.vendor.toLowerCase().includes(search.toLowerCase()) ||
          b.purpose.toLowerCase().includes(search.toLowerCase())
        )
      )
        return false;
      return true;
    });
  }, [bots, filterVendor, search]);

  const stats = useMemo(() => {
    const totalReqs = bots.reduce((sum, b) => sum + b.requests24h, 0);
    const blockedCount = bots.filter((b) => b.blocked).length;
    const blockedReqs = bots
      .filter((b) => b.blocked)
      .reduce((sum, b) => sum + b.requests24h, 0);
    const blockPct = totalReqs > 0 ? Math.round((blockedReqs / totalReqs) * 100) : 0;
    return { totalReqs, blockedCount, blockedReqs, blockPct };
  }, [bots]);

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
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
                  Cloudflare Edge Integration
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                  Active WAF Protection
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">
                AI Crawl Control &amp; Bot Audit
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Real-time AI bot detection, LLM scraper prevention, and automated Cloudflare Firewall rules for{" "}
                <span className="font-semibold text-slate-200">{site?.domain || "safaeewala.com"}</span>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={blockAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Block All AI Crawlers
            </button>
            <button
              onClick={allowAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Allow Selective
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards (Exactly matching Cloudflare Screenshot header) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total requests</span>
            <Bot className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">200</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-400">
            <span>↘ 49.87%</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Allowed requests</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">124</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
            <span>↗ 62.99%</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Unsuccessful requests</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">76</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-cyan-400">
            <span>↗ 18.75%</span>
          </div>
        </div>
      </div>

      {/* Crawlers Section (Exactly matching Cloudflare dashboard cards) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">Crawlers Traffic Distribution</h3>
            <p className="text-xs text-slate-400">Real-time edge visitor sources from major technology platforms &amp; AI bots.</p>
          </div>
          <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-400">
            Active Zones
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[
            { company: "Anthropic", bots: "ClaudeBot", extra: "+2", allowed: 51, delta: 66.00, up: false },
            { company: "Apple", bots: "Applebot", extra: "", allowed: 19, delta: 26.67, up: true },
            { company: "OpenAI", bots: "ChatGPT-User", extra: "+2", allowed: 15, delta: 53.13, up: false },
            { company: "Google", bots: "Googlebot", extra: "+1", allowed: 11, delta: 88.89, up: false },
            { company: "Huawei", bots: "PetalBot", extra: "", allowed: 9, delta: 350.00, up: true },
            { company: "Microsoft", bots: "BingBot", extra: "", allowed: 8, delta: 61.90, up: false },
            { company: "Baidu", bots: "Baidu", extra: "", allowed: 7, delta: 12.50, up: false },
            { company: "Meta", bots: "Meta-ExternalAgent", extra: "+2", allowed: 4, delta: 50.00, up: false },
            { company: "ByteDance", bots: "Bytespider", extra: "+1", allowed: 0, delta: 0, up: false },
            { company: "Perplexity", bots: "PerplexityBot", extra: "+1", allowed: 0, delta: 0, up: false },
          ].map((c) => (
            <div key={c.company} className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{c.company}</span>
                {c.extra && (
                  <span className="rounded bg-slate-800 px-1 py-0.2 text-[9px] text-slate-500 font-semibold">
                    {c.extra}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500 font-mono truncate">{c.bots}</div>
              
              <div className="mt-4 text-[9px] uppercase tracking-wider text-slate-500">Allowed requests</div>
              <div className="mt-0.5 flex items-baseline justify-between gap-1">
                <span className="text-xl font-extrabold text-white tabular-nums">{c.allowed}</span>
                {c.delta > 0 && (
                  <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${c.up ? "text-emerald-400" : "text-rose-400"}`}>
                    {c.up ? "↗" : "↘"} {c.delta.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bot Controls Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">Cloudflare AI Crawl Control Matrix</h3>
            <p className="text-xs text-slate-400">Manage real-time blocking for specific AI models and scrapers.</p>
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
              className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 px-3 text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="All">All Vendors</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Anthropic">Anthropic</option>
              <option value="Perplexity AI">Perplexity AI</option>
              <option value="Google AI">Google AI</option>
              <option value="ByteDance">ByteDance</option>
              <option value="Common Crawl">Common Crawl</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="pb-3">AI Bot Name</th>
                <th className="pb-3">Vendor</th>
                <th className="pb-3">Primary Purpose</th>
                <th className="pb-3">24h Requests</th>
                <th className="pb-3">Risk Level</th>
                <th className="pb-3 text-right">Cloudflare Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredBots.map((b) => (
                <tr key={b.id} className="hover:bg-slate-900/60 transition">
                  <td className="py-3.5 font-semibold text-white flex items-center gap-2">
                    <Bot className="h-4 w-4 text-cyan-400" />
                    <div>
                      <div>{b.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">{b.userAgent}</div>
                    </div>
                  </td>
                  <td className="py-3.5">{b.vendor}</td>
                  <td className="py-3.5 text-slate-400">{b.purpose}</td>
                  <td className="py-3.5 font-mono text-slate-200">{b.requests24h.toLocaleString()} ({b.dataScraped})</td>
                  <td className="py-3.5">
                    <span
                      className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                        b.riskLevel === "High"
                          ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                          : b.riskLevel === "Medium"
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {b.riskLevel} Risk
                    </span>
                  </td>
                  <td className="py-3.5 text-right">
                    <button
                      onClick={() => toggleBot(b.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        b.blocked
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                      }`}
                    >
                      {b.blocked ? (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-rose-400" /> Blocked
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Allowed
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Scraped URLs Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h3 className="text-base font-semibold text-white">Top URLs Targeted by AI Crawlers</h3>
        <p className="text-xs text-slate-400">Pages receiving highest crawler load over the last 24 hours.</p>

        <div className="mt-4 space-y-3">
          {TOP_AI_PAGES.map((p) => (
            <div key={p.url} className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-xs">
              <div className="flex items-center gap-2 font-mono text-cyan-300">
                <Globe className="h-4 w-4 text-slate-500" />
                <span>{p.url}</span>
              </div>

              <div className="flex items-center gap-4 text-slate-400">
                <span>{p.bots.toLocaleString()} requests ({p.scraped})</span>
                <span className="rounded border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
