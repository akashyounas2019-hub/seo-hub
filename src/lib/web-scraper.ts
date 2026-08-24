import * as cheerio from "cheerio";

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
}

export interface ScrapeResult {
  baseUrl: string;
  pages: ScrapedPage[];
  linksFound: number;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_INTERIOR_PAGES = 5;
const MAX_TEXT_CHARS_PER_PAGE = 12000; // keep prompt size bounded downstream

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEOHubAutoCrawler/1.0";

// Interior pages worth following, matched against href or link text.
const INTERESTING_PATTERNS = [
  /about/i,
  /service/i,
  /contact/i,
  /pricing/i,
  /price/i,
  /faq/i,
  /booking/i,
];

async function fetchHtml(url: string): Promise<string | null> {
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

/**
 * Strips script/style/nav/header/footer and returns clean visible text plus
 * page title, using proper DOM parsing (Cheerio) instead of regex.
 */
function extractCleanPage(html: string, pageUrl: string): { title: string; text: string; links: { href: string; text: string }[] } {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim() || "";

  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS_PER_PAGE);

  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const linkText = $(el).text().trim();
    if (href) links.push({ href, text: linkText });
  });

  return { title, text, links };
}

function resolveInteriorUrls(baseUrl: string, links: { href: string; text: string }[]): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const { href, text } of links) {
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    // Only follow same-origin links.
    if (resolved.hostname !== base.hostname) continue;
    resolved.hash = "";
    const normalized = resolved.toString();
    if (normalized === baseUrl || seen.has(normalized)) continue;

    const matchesInterest = INTERESTING_PATTERNS.some(
      (p) => p.test(resolved.pathname) || p.test(text),
    );
    if (!matchesInterest) continue;

    seen.add(normalized);
    candidates.push(normalized);
    if (candidates.length >= MAX_INTERIOR_PAGES) break;
  }

  return candidates;
}

/**
 * Fetches the homepage plus a small, bounded set of likely-useful interior
 * pages (about/services/contact/pricing/faq), strips boilerplate via
 * Cheerio, and returns clean text per page. Returns null if the homepage
 * itself couldn't be fetched — callers must not fabricate content on failure.
 */
export async function scrapeSite(baseUrl: string): Promise<ScrapeResult | null> {
  const homeHtml = await fetchHtml(baseUrl);
  if (!homeHtml) return null;

  const home = extractCleanPage(homeHtml, baseUrl);
  const pages: ScrapedPage[] = [{ url: baseUrl, title: home.title, text: home.text }];

  const interiorUrls = resolveInteriorUrls(baseUrl, home.links);

  const interiorResults = await Promise.all(
    interiorUrls.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return null;
      const page = extractCleanPage(html, url);
      return { url, title: page.title, text: page.text };
    }),
  );

  for (const page of interiorResults) {
    if (page && page.text) pages.push(page);
  }

  return {
    baseUrl,
    pages,
    linksFound: home.links.length,
  };
}
