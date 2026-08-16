/**
 * G8 fallback — free SERP rank scrape via DuckDuckGo HTML.
 *
 * No auth, no key, no SaaS. We hit the no-JS endpoint
 * `https://html.duckduckgo.com/html/?q=<keyword>`, parse the result
 * anchors, and look for the target domain (or any landing URL on it).
 *
 * Returns { position, url, raw } or { position: null, ... } when not found
 * in the first 60 results. Position is 1-indexed.
 *
 * Caveats:
 *  - DDG ≠ Google rank. Treat as a proxy, not ground truth. GSC is preferred
 *    when connected.
 *  - DDG can rate-limit if hit too aggressively — we sleep 1.2s between calls
 *    inside the worker handler.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export async function scrapeRank({ keyword, targetDomain }) {
  if (!keyword || !targetDomain) return { position: null, url: null, raw: { error: "missing-input" } };
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
  let html = "";
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!resp.ok) {
      return { position: null, url: null, raw: { error: `ddg http ${resp.status}` } };
    }
    html = await resp.text();
  } catch (err) {
    return { position: null, url: null, raw: { error: `ddg fetch failed: ${err.message}` } };
  }

  // DDG result anchors look like:
  //   <a rel="nofollow" class="result__a" href="https://example.com/page">…</a>
  // Or wrapped redirects:
  //   <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&...">
  const anchors = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    // Unwrap DDG redirects.
    if (href.startsWith("//duckduckgo.com/l/") || href.startsWith("/l/")) {
      const u = new URL(href.startsWith("//") ? `https:${href}` : `https://duckduckgo.com${href}`);
      const target = u.searchParams.get("uddg");
      if (target) href = decodeURIComponent(target);
    }
    anchors.push(href);
    if (anchors.length >= 60) break;
  }

  const normalizedTarget = targetDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  for (let i = 0; i < anchors.length; i++) {
    let host;
    try { host = new URL(anchors[i]).host.replace(/^www\./, "").toLowerCase(); }
    catch { continue; }
    if (host === normalizedTarget || host.endsWith(`.${normalizedTarget}`)) {
      return { position: i + 1, url: anchors[i], raw: { source: "ddg-html", totalAnchors: anchors.length } };
    }
  }

  return { position: null, url: null, raw: { source: "ddg-html", totalAnchors: anchors.length, note: "not-in-top-60" } };
}
