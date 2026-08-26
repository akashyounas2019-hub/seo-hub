/**
 * Real QA Suite check engine — runs inside the worker process only.
 * Playwright needs a real browser, which the Docker app container (Alpine,
 * no browser deps) doesn't have and shouldn't need; this worker process
 * runs on the operator's own machine (same place the `claude` CLI already
 * runs from), so that's where the browser lives too.
 *
 * Plain JS (no TypeScript build step) to match aks-worker.mjs's existing
 * zero-build design — the worker is launched with plain `node`, not tsx.
 * The sitemap-fetch logic here is intentionally a lightweight duplicate of
 * src/lib/sitemap-crawler.ts (that one is TS, imported by the app's API
 * routes; this one needs to run standalone under plain node).
 */

const FETCH_TIMEOUT_MS = 10000;
const MAX_SITEMAPS = 25;
const MAX_URLS = 5000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEOHubQaWorker/1.0";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function extractAllBlocks(xml, tag) {
  return xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gi")) || [];
}

function parseSitemapXml(xml) {
  if (/<sitemapindex/i.test(xml)) {
    const childSitemaps = extractAllBlocks(xml, "sitemap").map((b) => extractTag(b, "loc")).filter(Boolean);
    return { urls: [], childSitemaps };
  }
  const urls = extractAllBlocks(xml, "url")
    .map((b) => extractTag(b, "loc"))
    .filter(Boolean);
  return { urls, childSitemaps: [] };
}

/** Discovers real page URLs from the site's sitemap.xml (recursing sitemap indexes). Falls back to just the homepage if none found. */
async function crawlSitemapUrls(baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  const roots = [`${origin}/sitemap.xml`];
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  if (robotsTxt) {
    for (const line of robotsTxt.match(/^sitemap:\s*(\S+)/gim) || []) {
      const url = line.replace(/^sitemap:\s*/i, "").trim();
      if (url && !roots.includes(url)) roots.push(url);
    }
  }

  let seedXml = null;
  let seedRoot = null;
  for (const root of roots) {
    const xml = await fetchText(root);
    if (xml && (/<urlset/i.test(xml) || /<sitemapindex/i.test(xml))) {
      seedXml = xml;
      seedRoot = root;
      break;
    }
  }
  if (!seedXml) return [];

  const visited = new Set([seedRoot]);
  const queue = [{ url: seedRoot, xml: seedXml }];
  const urls = new Set();
  let sitemapCount = 1;

  while (queue.length > 0 && sitemapCount <= MAX_SITEMAPS && urls.size < MAX_URLS) {
    const { xml } = queue.shift();
    const { urls: pageUrls, childSitemaps } = parseSitemapXml(xml);
    for (const u of pageUrls) {
      urls.add(u);
      if (urls.size >= MAX_URLS) break;
    }
    for (const child of childSitemaps) {
      if (visited.has(child) || sitemapCount >= MAX_SITEMAPS) continue;
      visited.add(child);
      sitemapCount++;
      const childXml = await fetchText(child);
      if (childXml) queue.push({ url: child, xml: childXml });
    }
  }

  return Array.from(urls);
}

async function resolvePagesForScope(opts) {
  const cap = opts.maxPages || 8;

  if (opts.scope === "page") {
    if (!opts.targetUrl) throw new Error("targetUrl is required for scope 'page'");
    const resolved = opts.targetUrl.startsWith("http") ? opts.targetUrl : new URL(opts.targetUrl, opts.baseUrl).toString();
    return [resolved];
  }

  const all = await crawlSitemapUrls(opts.baseUrl);
  if (all.length === 0) return [opts.baseUrl];

  let candidates = all;
  if (opts.scope === "blog") {
    candidates = candidates.filter((u) => /\/(blog|news|articles?)\//i.test(u));
  } else if (opts.scope === "landing") {
    candidates = candidates.filter((u) => !/\/(blog|news|articles?)\//i.test(u));
  }
  if (candidates.length === 0) candidates = [opts.baseUrl];

  return candidates.slice(0, cap);
}

async function checkViewports(page, url) {
  const findings = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (e) {
      findings.push({ suite: "viewport", pageUrl: url, severity: "critical", passed: false, message: `Failed to load at ${vp.name} (${vp.width}x${vp.height}): ${e.message}` });
      continue;
    }

    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = document.documentElement.clientWidth;
      return { overflowX: docWidth > winWidth + 4, docWidth, winWidth };
    });

    if (overflow.overflowX) {
      findings.push({ suite: "viewport", pageUrl: url, severity: "warning", passed: false, message: `Horizontal overflow at ${vp.name} (${vp.width}px): content is ${overflow.docWidth}px wide`, detail: overflow });
    } else {
      findings.push({ suite: "viewport", pageUrl: url, severity: "info", passed: true, message: `No horizontal overflow at ${vp.name} (${vp.width}px)` });
    }
  }
  return findings;
}

async function checkLinks(page, url) {
  const findings = [];
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.href));
  const base = new URL(url);
  const uniqueSameOrigin = Array.from(
    new Set(hrefs.filter((h) => { try { return new URL(h).hostname === base.hostname; } catch { return false; } })),
  ).slice(0, 25);

  for (const href of uniqueSameOrigin) {
    try {
      let res;
      try {
        res = await page.request.head(href, { timeout: 8000 });
      } catch {
        res = await page.request.get(href, { timeout: 8000 });
      }
      if (res.status() >= 400) {
        findings.push({ suite: "links", pageUrl: url, severity: "critical", passed: false, message: `Broken link (HTTP ${res.status()}): ${href}` });
      }
    } catch (e) {
      findings.push({ suite: "links", pageUrl: url, severity: "warning", passed: false, message: `Could not verify link: ${href} (${e.message})` });
    }
  }

  if (findings.length === 0) {
    findings.push({ suite: "links", pageUrl: url, severity: "info", passed: true, message: `All ${uniqueSameOrigin.length} same-origin link(s) responded OK` });
  }
  return findings;
}

async function checkSchema(page, url) {
  const blocks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent || ""),
  );

  if (blocks.length === 0) {
    return [{ suite: "schema", pageUrl: url, severity: "warning", passed: false, message: "No JSON-LD structured data found on this page" }];
  }

  const findings = [];
  for (const [i, block] of blocks.entries()) {
    try {
      const parsed = JSON.parse(block);
      const type = parsed["@type"] || (Array.isArray(parsed) && parsed[0]?.["@type"]) || "unknown";
      findings.push({ suite: "schema", pageUrl: url, severity: "info", passed: true, message: `Valid JSON-LD block #${i + 1} (@type: ${type})` });
    } catch (e) {
      findings.push({ suite: "schema", pageUrl: url, severity: "critical", passed: false, message: `Invalid JSON-LD block #${i + 1}: ${e.message}` });
    }
  }
  return findings;
}

async function checkAccessibility(page, url, AxeBuilder) {
  try {
    const results = await new AxeBuilder({ page }).analyze();
    if (results.violations.length === 0) {
      return [{ suite: "accessibility", pageUrl: url, severity: "info", passed: true, message: "No axe-core accessibility violations found" }];
    }
    return results.violations.map((v) => ({
      suite: "accessibility",
      pageUrl: url,
      severity: v.impact === "critical" || v.impact === "serious" ? "critical" : "warning",
      passed: false,
      message: `${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? "" : "s"})`,
      detail: { id: v.id, impact: v.impact, helpUrl: v.helpUrl },
    }));
  } catch (e) {
    return [{ suite: "accessibility", pageUrl: url, severity: "warning", passed: false, message: `axe-core scan failed: ${e.message}` }];
  }
}

async function checkVitals(page, url) {
  try {
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
      return {
        ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        fcpMs: fcp !== null ? Math.round(fcp) : null,
      };
    });

    if (metrics.fcpMs !== null) {
      return [{ suite: "vitals", pageUrl: url, severity: metrics.fcpMs > 3000 ? "warning" : "info", passed: metrics.fcpMs <= 3000, message: `First Contentful Paint: ${metrics.fcpMs}ms`, detail: metrics }];
    }
    return [{ suite: "vitals", pageUrl: url, severity: "info", passed: true, message: "Timing metrics captured", detail: metrics }];
  } catch (e) {
    return [{ suite: "vitals", pageUrl: url, severity: "warning", passed: false, message: `Could not capture timing metrics: ${e.message}` }];
  }
}

/**
 * Runs the full real QA pass for one site/scope. Launches its own Chromium
 * instance and closes it when done -- callers don't manage browser lifecycle.
 */
export async function runQaSuite(opts) {
  const { chromium } = await import("playwright");
  const { AxeBuilder } = await import("@axe-core/playwright");

  const browser = await chromium.launch();
  try {
    const pages = await resolvePagesForScope(opts);
    const allFindings = [];

    for (const url of pages) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        allFindings.push(...(await checkViewports(page, url)));
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        allFindings.push(...(await checkLinks(page, url)));
        allFindings.push(...(await checkSchema(page, url)));
        allFindings.push(...(await checkAccessibility(page, url, AxeBuilder)));
        allFindings.push(...(await checkVitals(page, url)));
      } finally {
        await context.close();
      }
    }

    return { findings: allFindings, pagesChecked: pages.length };
  } finally {
    await browser.close();
  }
}
