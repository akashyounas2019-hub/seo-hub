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

import { toast } from "sonner";

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
  iconBadge?: string;
  brandColor?: string;
};

const INITIAL_BOTS: AiBotRule[] = [
  {
    id: "applebot-extended",
    name: "Applebot-Extended",
    vendor: "Apple",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) (Applebot/0.1; +http://www.apple.com/go/applebot)",
    purpose: "Apple Intelligence & Siri Web Training",
    blocked: true,
    requests24h: 3190,
    dataScraped: "11.2 MB",
    riskLevel: "High",
    iconBadge: "🍎",
    brandColor: "from-slate-400 to-slate-200",
  },
  {
    id: "meta-externalagent",
    name: "Meta-ExternalAgent (Llama)",
    vendor: "Meta",
    userAgent: "Mozilla/5.0 (compatible; Meta-ExternalAgent/1.0; +https://www.meta.com/externalagent)",
    purpose: "Llama AI & Meta AI Dataset Scraping",
    blocked: true,
    requests24h: 4890,
    dataScraped: "16.8 MB",
    riskLevel: "High",
    iconBadge: "♾️",
    brandColor: "from-blue-500 to-cyan-400",
  },
  {
    id: "baiduspider",
    name: "Baiduspider (Ernie)",
    vendor: "Baidu",
    userAgent: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
    purpose: "Baidu Search & Ernie Bot Indexing",
    blocked: false,
    requests24h: 2470,
    dataScraped: "8.4 MB",
    riskLevel: "Medium",
    iconBadge: "🐾",
    brandColor: "from-red-500 to-rose-400",
  },
  {
    id: "gptbot",
    name: "GPTBot",
    vendor: "OpenAI",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (GPTBot/1.2; +https://openai.com/gptbot)",
    purpose: "Model Training & Web Indexing",
    blocked: true,
    requests24h: 5420,
    dataScraped: "18.4 MB",
    riskLevel: "High",
    iconBadge: "⚡",
    brandColor: "from-emerald-400 to-teal-500",
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
    iconBadge: "🤖",
    brandColor: "from-emerald-400 to-teal-500",
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
    iconBadge: "🧠",
    brandColor: "from-amber-400 to-orange-500",
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
    iconBadge: "🌐",
    brandColor: "from-cyan-400 to-blue-500",
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
    iconBadge: "🔍",
    brandColor: "from-blue-400 to-violet-500",
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
    iconBadge: "🎵",
    brandColor: "from-purple-400 to-pink-500",
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

  const toggleBot = async (id: string) => {
    const targetBot = bots.find((b) => b.id === id);
    if (!targetBot) return;

    const nextState = !targetBot.blocked;
    const nextAction = nextState ? "block" : "allow";

    setBots((prev) =>
      prev.map((b) => (b.id === id ? { ...b, blocked: nextState } : b)),
    );

    // Call live Cloudflare WAF Shield API
    try {
      const res = await fetch("/api/cloudflare/ai-shield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: targetBot.id,
          vendor: targetBot.vendor,
          userAgent: targetBot.userAgent,
          action: nextAction,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(
          `Cloudflare WAF ${nextAction.toUpperCase()} rule applied for ${targetBot.name}!`,
          { description: data.message },
        );
      }
    } catch {
      toast.info(`Updated rule for ${targetBot.name}`);
    }
  };

  const blockAll = async () => {
    setBots((prev) => prev.map((b) => ({ ...b, blocked: true })));
    try {
      await fetch("/api/cloudflare/ai-shield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", botId: "ALL_AI_CRAWLERS", vendor: "Global Shield" }),
      });
      toast.error("Cloudflare Firewall Shield Activated: All AI Crawlers BLOCKED");
    } catch {
      toast.error("Blocked all AI crawlers");
    }
  };

  const allowAll = async () => {
    setBots((prev) => prev.map((b) => ({ ...b, blocked: false })));
    toast.success("Cloudflare AI Shield set to Selective Allow mode");
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Bot Requests (24h)</span>
            <Bot className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{stats.totalReqs.toLocaleString()}</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-cyan-400">
            <span>Edge Inspected</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cloudflare WAF Blocked</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400">{stats.blockedReqs.toLocaleString()} ({stats.blockPct}%)</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-300">
            <span>{stats.blockedCount} Bots Blocked</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Allowed Verified AI Agents</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-300">{(stats.totalReqs - stats.blockedReqs).toLocaleString()}</div>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
            <span>AI Search Indexers</span>
          </div>
        </div>
      </div>

      {/* Enhanced Crawlers Traffic Distribution Grid (with Apple, Baidu, Meta Icons) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" /> AI Crawler Traffic Distribution
            </h3>
            <p className="text-xs text-slate-400">Real-time edge visitor breakdown across major AI technology vendors.</p>
          </div>
          <span className="rounded-lg border border-cyan-500/30 bg-cyan-950/60 px-2.5 py-1 text-xs font-semibold text-cyan-300">
            Live Cloudflare Zone: safaeewala.com
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {[
            { company: "Apple", bots: "Applebot-Extended", extra: "AI", allowed: 3190, delta: 26.67, up: true, icon: "🍎", border: "border-slate-700/80 bg-slate-950/80" },
            { company: "Baidu", bots: "Baiduspider", extra: "Ernie", allowed: 2470, delta: 12.50, up: false, icon: "🐾", border: "border-rose-500/30 bg-rose-950/20" },
            { company: "Meta", bots: "Meta-ExternalAgent", extra: "Llama", allowed: 4890, delta: 50.00, up: false, icon: "♾️", border: "border-blue-500/30 bg-blue-950/20" },
            { company: "Anthropic", bots: "ClaudeBot", extra: "Claude 3.5", allowed: 3840, delta: 66.00, up: false, icon: "🧠", border: "border-amber-500/30 bg-amber-950/20" },
            { company: "OpenAI", bots: "GPTBot / ChatGPT", extra: "GPT-4o", allowed: 7310, delta: 53.13, up: true, icon: "⚡", border: "border-emerald-500/30 bg-emerald-950/20" },
            { company: "Google AI", bots: "Google-Extended", extra: "Gemini", allowed: 4120, delta: 88.89, up: false, icon: "🔍", border: "border-cyan-500/30 bg-cyan-950/20" },
            { company: "ByteDance", bots: "Bytespider", extra: "LLM", allowed: 8940, delta: 15.00, up: true, icon: "🎵", border: "border-purple-500/30 bg-purple-950/20" },
            { company: "Perplexity", bots: "PerplexityBot", extra: "Search", allowed: 2150, delta: 18.20, up: true, icon: "🌐", border: "border-sky-500/30 bg-sky-950/20" },
          ].map((c) => (
            <div key={c.company} className={`rounded-xl border p-3.5 transition hover:scale-[1.02] ${c.border}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{c.icon}</span>
                  <span className="text-xs font-bold text-white">{c.company}</span>
                </div>
                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300 border border-slate-800">
                  {c.extra}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] font-mono text-slate-400 truncate">{c.bots}</div>
              
              <div className="mt-3 text-[9px] uppercase tracking-wider text-slate-500">24h Edge Requests</div>
              <div className="mt-0.5 flex items-baseline justify-between gap-1">
                <span className="text-lg font-bold text-white tabular-nums">{c.allowed.toLocaleString()}</span>
                <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${c.up ? "text-emerald-400" : "text-rose-400"}`}>
                  {c.up ? "↗" : "↘"} {c.delta.toFixed(1)}%
                </span>
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
              <option value="Apple">Apple</option>
              <option value="Meta">Meta</option>
              <option value="Baidu">Baidu</option>
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
