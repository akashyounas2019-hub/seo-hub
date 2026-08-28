// Real sitemap.xml inventory crawler. Distinct from web-scraper.ts (which
// fetches full page text for a capped set of pages to seed the Knowledge
// Base) -- this only discovers every URL the site declares, recursing into
// sitemap index files, and never fetches page bodies. Powers the "Site
// Pages" tab so page counts are real Postgres data instead of the hardcoded
// numbers that used to live in sites.$siteId.tsx's fake SITES object.

const FETCH_TIMEOUT_MS = 10000;
const MAX_SITEMAPS = 25; // guard against pathological sitemap-index fan-out
const MAX_URLS = 5000; // guard against unbounded memory growth on huge sites
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEOHubSitemapCrawler/1.0";

export type SitemapUrlEntry = {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
};

export type SitemapCrawlResult = {
  sitemapsFound: string[];
  urls: SitemapUrlEntry[];
  truncated: boolean;
  error: string | null;
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim().replace(/&amp;/g, "&") : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const matches = xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi"));
  return matches || [];
}

/**
 * Parses a sitemap XML document. Handles both a <urlset> (leaf sitemap,
 * listing actual pages) and a <sitemapindex> (listing other sitemap files
 * to recurse into) -- real-world sitemaps use either depending on site size.
 */
function parseSitemapXml(xml: string): { urls: SitemapUrlEntry[]; childSitemaps: string[] } {
  const isIndex = /<sitemapindex/i.test(xml);

  if (isIndex) {
    const childSitemaps = extractAllBlocks(xml, "sitemap")
      .map((b) => extractTag(b, "loc"))
      .filter((v): v is string => !!v);
    return { urls: [], childSitemaps };
  }

  const urls = extractAllBlocks(xml, "url")
    .map((b) => {
      const loc = extractTag(b, "loc");
      if (!loc) return null;
      return {
        loc,
        lastmod: extractTag(b, "lastmod"),
        changefreq: extractTag(b, "changefreq"),
        priority: extractTag(b, "priority"),
      };
    })
    .filter((v): v is SitemapUrlEntry => !!v);

  return { urls, childSitemaps: [] };
}

/**
 * Crawls a site's sitemap (recursing into sitemap indexes up to
 * MAX_SITEMAPS files) and returns every declared URL. If `explicitSitemapUrl`
 * is given (a user-entered sitemap URL -- e.g. when it isn't at the default
 * /sitemap.xml location, or the user wants a specific sub-sitemap), that URL
 * is tried first; otherwise falls back to /sitemap.xml, then the Sitemap:
 * directive in /robots.txt. Returns an error string (never fabricated data)
 * if nothing could be found or fetched.
 */
export async function crawlSitemap(domain: string, explicitSitemapUrl?: string): Promise<SitemapCrawlResult> {
  const origin = (domain.startsWith("http") ? domain : `https://${domain}`).replace(/\/$/, "");

  const candidateRoots: string[] = [];
  if (explicitSitemapUrl?.trim()) {
    candidateRoots.push(explicitSitemapUrl.trim());
  }
  candidateRoots.push(`${origin}/sitemap.xml`);

  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  if (robotsTxt) {
    const sitemapDirectives = robotsTxt.match(/^sitemap:\s*(\S+)/gim) || [];
    for (const line of sitemapDirectives) {
      const url = line.replace(/^sitemap:\s*/i, "").trim();
      if (url && !candidateRoots.includes(url)) candidateRoots.push(url);
    }
  }

  const sitemapsFound: string[] = [];
  const allUrls = new Map<string, SitemapUrlEntry>();
  const queue: string[] = [];
  let foundAny = false;

  for (const root of candidateRoots) {
    const xml = await fetchText(root);
    if (xml && (/<urlset/i.test(xml) || /<sitemapindex/i.test(xml))) {
      foundAny = true;
      queue.push(root);
      sitemapsFound.push(root);
      break; // first working root is enough to seed the crawl
    }
  }

  if (!foundAny) {
    const triedList = candidateRoots.join(", ");
    return {
      sitemapsFound: [],
      urls: [],
      truncated: false,
      error: `No sitemap found. Tried: ${triedList}.`,
    };
  }

  let truncated = false;
  const visited = new Set<string>(queue);

  while (queue.length > 0 && sitemapsFound.length <= MAX_SITEMAPS) {
    const current = queue.shift()!;
    const xml = await fetchText(current);
    if (!xml) continue;

    const { urls, childSitemaps } = parseSitemapXml(xml);

    for (const u of urls) {
      if (allUrls.size >= MAX_URLS) {
        truncated = true;
        break;
      }
      allUrls.set(u.loc, u);
    }

    for (const child of childSitemaps) {
      if (visited.has(child) || sitemapsFound.length >= MAX_SITEMAPS) continue;
      visited.add(child);
      queue.push(child);
      sitemapsFound.push(child);
    }

    if (allUrls.size >= MAX_URLS) {
      truncated = true;
      break;
    }
  }

  return {
    sitemapsFound,
    urls: Array.from(allUrls.values()),
    truncated,
    error: null,
  };
}
