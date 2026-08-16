/**
 * Sitemap discovery. Resolves a site's sitemap (index or urlset) and returns
 * the full list of page URLs, following one level of sitemap-index nesting.
 * Caps total URLs so a runaway sitemap can't blow up a cron run.
 */
const MAX_URLS = 500;
const MAX_SUB_SITEMAPS = 25;

async function fetchXml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "GYL-Indexer/1.0" } });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim());
}

/** True if the XML is a sitemap index (points at other sitemaps). */
function isIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml);
}

export async function discoverSitemapUrls(domain: string): Promise<{ urls: string[]; via: string }> {
  const candidates = ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"];
  for (const path of candidates) {
    const xml = await fetchXml(`https://${domain}${path}`);
    if (!xml) continue;

    if (isIndex(xml)) {
      const subSitemaps = extractLocs(xml).slice(0, MAX_SUB_SITEMAPS);
      const all: string[] = [];
      for (const sm of subSitemaps) {
        // Skip image/video/news sub-sitemaps — we only index page URLs.
        if (/(image|video|news)-sitemap/i.test(sm)) continue;
        const subXml = await fetchXml(sm);
        if (subXml) all.push(...extractLocs(subXml));
        if (all.length >= MAX_URLS) break;
      }
      return { urls: dedupe(all).slice(0, MAX_URLS), via: `${path} (index)` };
    }

    // Plain urlset.
    return { urls: dedupe(extractLocs(xml)).slice(0, MAX_URLS), via: path };
  }
  return { urls: [], via: "(no sitemap reachable)" };
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))];
}
