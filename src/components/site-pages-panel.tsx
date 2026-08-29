import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Search, FileText, Link2, CheckCircle2, AlertCircle } from "lucide-react";

type SitePage = {
  id: string;
  url: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
  lastCrawledAt: string;
};

/**
 * Real sitemap.xml inventory for the current site -- total page count and
 * every URL, sourced from Postgres (site_pages table) and refreshed on
 * demand via a real crawl (api.sites.$id.pages.ts). Replaces the old
 * decorative Obsidian 2nd Brain tab in the Knowledge Base page. Accepts an
 * optional user-entered sitemap URL (for sites where it isn't at the
 * default /sitemap.xml location) and shows real Search Console indexed
 * counts when the site is GSC-connected.
 */
export function SitePagesPanel({ siteId, domain }: { siteId: string; domain: string }) {
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [lastCrawledAt, setLastCrawledAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [indexedCount, setIndexedCount] = useState<number | null>(null);
  const [indexedError, setIndexedError] = useState<string | null>(null);
  const [gscConnected, setGscConnected] = useState(false);

  const load = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages`);
      const json = await res.json();
      if (json?.ok) {
        setPages(json.pages || []);
        setLastCrawledAt(json.lastCrawledAt);
        setIndexedCount(typeof json.indexedCount === "number" ? json.indexedCount : null);
        setIndexedError(json.indexedError || null);
        setGscConnected(!!json.gscConnected);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const runCrawl = async () => {
    setCrawling(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitemapUrl: sitemapUrl.trim() || undefined }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Sitemap crawled — ${json.count} page(s) found across ${json.sitemapsFound.length} sitemap file(s)${json.truncated ? " (truncated at 5,000 URLs)" : ""}`);
        await load();
      } else {
        toast.error(json?.error || "Failed to crawl sitemap");
      }
    } catch {
      toast.error("Failed to crawl sitemap");
    } finally {
      setCrawling(false);
    }
  };

  const filtered = query.trim()
    ? pages.filter((p) => p.url.toLowerCase().includes(query.trim().toLowerCase()))
    : pages;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 shrink-0 text-cyan-300" />
            <div>
              <h3 className="text-sm font-bold text-white">Site Pages — Real Sitemap Inventory</h3>
              <p className="text-xs text-slate-400">
                Fetched from a real sitemap.xml (recursing sitemap index files) — not a hardcoded estimate.
                {lastCrawledAt && ` Last crawled ${new Date(lastCrawledAt).toLocaleString()}.`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder={`Sitemap URL (optional — defaults to https://${domain}/sitemap.xml)`}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
            />
          </div>
          <button
            onClick={runCrawl}
            disabled={crawling}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${crawling ? "animate-spin" : ""}`} />
            {crawling ? "Crawling sitemap…" : "Fetch pages"}
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Total Pages</div>
          <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{pages.length}</div>
          <div className="mt-0.5 text-[10px] text-slate-500">From sitemap</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
            Indexed
            {gscConnected && indexedCount !== null && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          </div>
          {gscConnected ? (
            indexedCount !== null ? (
              <>
                <div className="mt-1 text-2xl font-semibold text-white tabular-nums">{indexedCount}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">Sitemap pages with real search impressions (28d)</div>
              </>
            ) : (
              <div className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> {indexedError || "Unavailable"}
              </div>
            )
          ) : (
            <div className="mt-1 text-xs text-slate-500">Connect Search Console to see this</div>
          )}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Coverage</div>
          {gscConnected && indexedCount !== null && pages.length > 0 ? (
            <>
              <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
                {Math.round((indexedCount / pages.length) * 100)}%
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">Indexed / sitemap total</div>
            </>
          ) : (
            <div className="mt-1 text-xs text-slate-500">—</div>
          )}
        </div>
      </div>

      {pages.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter URLs…"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading page inventory…</div>
        ) : pages.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No page inventory yet. Enter a sitemap URL above (or leave blank for the default) and click "Fetch pages".
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-400 backdrop-blur">
                <tr>
                  <th className="px-4 py-2.5 text-left">URL</th>
                  <th className="px-4 py-2.5 text-left">Last Modified</th>
                  <th className="px-4 py-2.5 text-left">Change Freq</th>
                  <th className="px-4 py-2.5 text-left">Priority</th>
                  <th className="px-4 py-2.5 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-slate-800/70 hover:bg-slate-900/40">
                    <td className="max-w-[420px] truncate px-4 py-2 font-mono text-slate-200" title={p.url}>{p.url}</td>
                    <td className="px-4 py-2 text-slate-400">{p.lastmod || "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{p.changefreq || "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{p.priority || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500">No URLs match "{query}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
