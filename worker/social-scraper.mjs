/**
 * Real social profile link scraper — runs inside the worker process only
 * (same reasoning as qa-engine.mjs: needs a real Chromium instance, which
 * only exists on the worker's host machine, not the Docker app container).
 *
 * Given a Google Business Profile URL or a plain website URL, navigates
 * with Playwright and extracts real <a href> links pointing at known social
 * platforms. Nothing here is invented -- if a platform isn't linked
 * anywhere on the page, it's simply omitted from the result.
 */

const SOCIAL_PATTERNS = [
  { key: "facebook", re: /(?:facebook\.com|fb\.com)\/(?!sharer|share|plugins)[^/?#"']+/i },
  { key: "instagram", re: /instagram\.com\/(?!p\/|reel\/)[^/?#"']+/i },
  { key: "tiktok", re: /tiktok\.com\/@[^/?#"']+/i },
  { key: "snapchat", re: /snapchat\.com\/add\/[^/?#"']+/i },
  { key: "x", re: /(?:twitter\.com|x\.com)\/(?!intent|share)[^/?#"']+/i },
  { key: "pinterest", re: /pinterest\.[a-z.]+\/[^/?#"']+/i },
  { key: "linkedin", re: /linkedin\.com\/(?:company|in)\/[^/?#"']+/i },
  { key: "youtube", re: /youtube\.com\/(?:channel|c|@)[^/?#"']+/i },
];

function normalizeUrl(url) {
  const withProtocol = url.startsWith("http") ? url : `https://${url}`;
  return withProtocol;
}

function extractSocialLinksFromHrefs(hrefs) {
  const found = {};
  for (const href of hrefs) {
    if (!href) continue;
    for (const { key, re } of SOCIAL_PATTERNS) {
      if (found[key]) continue; // first match wins per platform
      const m = href.match(re);
      if (m) {
        // Reconstruct a clean https:// URL from the matched fragment.
        found[key] = href.startsWith("http") ? href.split("?")[0].split("#")[0] : `https://${m[0]}`;
      }
    }
  }
  return found;
}

/**
 * Scrapes real social profile links from a Google Business Profile listing
 * URL or a plain website URL. Returns { socialLinks, scrapedFrom } -- no
 * fabricated data; a platform not found on the page is simply absent from
 * socialLinks.
 */
export async function scrapeSocialLinks(targetUrl) {
  const { chromium } = await import("playwright");
  const url = normalizeUrl(targetUrl);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEOHubSocialScraper/1.0",
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    // GBP listing pages (google.com/maps/place/... or business profile
    // short links) render their website/social panel via JS after initial
    // load -- give it a moment before reading links.
    await page.waitForTimeout(2500);

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || ""),
    );

    let socialLinks = extractSocialLinksFromHrefs(hrefs);

    // If this was a GBP listing page and it links out to the business's own
    // website, follow that link too -- social icons often live in the site
    // footer rather than on the Maps listing itself.
    const isGbpUrl = /google\.[a-z.]+\/maps|g\.page|business\.google\.com/i.test(url);
    if (isGbpUrl) {
      const websiteHref = hrefs.find((h) => h && /^https?:\/\//.test(h) && !/google\.[a-z.]+/i.test(h));
      if (websiteHref && Object.keys(socialLinks).length < SOCIAL_PATTERNS.length) {
        try {
          await page.goto(websiteHref, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(1000);
          const siteHrefs = await page.evaluate(() =>
            Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || ""),
          );
          socialLinks = { ...extractSocialLinksFromHrefs(siteHrefs), ...socialLinks }; // GBP-found links take priority
        } catch {
          /* website fetch failed -- keep whatever GBP itself yielded */
        }
      }
    }

    await context.close();
    return { socialLinks, scrapedFrom: url };
  } finally {
    await browser.close();
  }
}
