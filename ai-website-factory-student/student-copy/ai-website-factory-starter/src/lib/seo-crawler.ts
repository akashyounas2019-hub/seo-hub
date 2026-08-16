/**
 * SEO crawler — public HTTP fetcher + HTML parser for the audit agent.
 *
 * This module does NOT call the WordPress REST API directly (that's gated by
 * CLAUDE.md as a hard constraint). For anything that needs WP internals (post
 * IDs, attachment IDs, applying fixes) we go through the GYL Suite plugin
 * over the signed channel in `wp-plugin-client.ts`.
 *
 * Here we only do what any anonymous browser can do: fetch a public URL,
 * parse the HTML, and pull facts out of the DOM.
 *
 * Why minimal regex parsing instead of cheerio?
 *   The findings the alt-text audit needs are narrow (count <img> tags,
 *   compute which ones lack a non-empty alt attribute, capture src + nearby
 *   text). Cheerio would be cleaner but adds 600 KB of deps for a problem
 *   we can solve in 60 lines of TypeScript. If Phase 5+ needs deeper DOM
 *   work (axe-core, layout analysis) we'll add a headless browser then.
 */

interface CrawlOptions {
  maxPages?: number;          // default 25 — keep cost low for early phases
  timeoutMs?: number;          // default 15s per page
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "GYL-Platform-SEO-Agent/0.1 (+http://localhost:3001/admin/seo)";

export interface CrawledImage {
  src: string;
  alt: string;                 // "" if attribute missing or empty
  width?: string;
  height?: string;
  loading?: string;            // "lazy" | "eager" | undefined
  nearbyText: string;          // first 120 chars of surrounding paragraph context
}

export interface CrawledPage {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  canonical: string;
  robotsMeta: string;
  h1: string[];
  h2: string[];
  images: CrawledImage[];
  htmlBytes: number;
  /** First N characters of visible body text — used by the agent as context
   *  when proposing a meta description or schema. */
  bodyExcerpt: string;
  /** @type values found in existing JSON-LD script blocks on the page. */
  schemaTypes: string[];
  /** Best-effort classification of what kind of page this is. Drives
   *  schema-type selection. */
  pageKind: "home" | "service" | "city" | "article" | "faq" | "contact" | "about" | "unknown";
  /** Word count of visible body text. */
  wordCount: number;
  /** Parsed last-modified date from JSON-LD or <meta property="article:modified_time">. */
  lastModified: string | null;
  /** Parsed published date from JSON-LD or <meta property="article:published_time">. */
  publishedAt: string | null;
  /** Author name extracted from JSON-LD or <meta name="author"> — empty if absent. */
  author: string;
  /** Whether the page has any <cite>, <a href> to a verifiable source, or
   *  inline references — a rough E-E-A-T signal. */
  hasSources: boolean;
  /** Full HTML response. Kept so downstream checkers (a11y, schema
   *  validators) can run their own rules without a second fetch. Trimmed
   *  to 250 KB to bound memory across the crawl. */
  rawHtml: string;
}

/** Strip HTML tags and collapse whitespace for "nearby text" context. */
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

function firstMatch(re: RegExp, html: string): string {
  const m = html.match(re);
  return m?.[1]?.trim() ?? "";
}

function allMatches(re: RegExp, html: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(html))) {
    if (m[1]) out.push(stripTags(m[1]).slice(0, 200));
  }
  return out;
}

/** Resolve a possibly-relative URL against the page URL. Returns "" on error. */
function resolveUrl(href: string, base: string): string {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

/**
 * Find all <img> tags in the HTML and capture each one's src/alt/etc.
 * For the "nearby text" we look at the surrounding 600 characters of plain
 * text and take the trailing portion — this is intentionally crude but
 * usually catches the caption or paragraph that should anchor the alt.
 */
function extractImages(html: string, pageUrl: string): CrawledImage[] {
  const out: CrawledImage[] = [];
  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const idx = m.index;
    const contextStart = Math.max(0, idx - 400);
    const contextEnd = Math.min(html.length, idx + 400);
    const nearbyText = stripTags(html.slice(contextStart, contextEnd)).slice(0, 200);
    const src = resolveUrl(attr(tag, "src") || attr(tag, "data-src"), pageUrl);
    if (!src) continue;
    // Skip tiny tracking pixels and SVG inline data URIs — they don't need alt.
    if (src.startsWith("data:")) continue;
    out.push({
      src,
      alt: attr(tag, "alt"),
      width: attr(tag, "width") || undefined,
      height: attr(tag, "height") || undefined,
      loading: attr(tag, "loading") || undefined,
      nearbyText,
    });
  }
  return out;
}

/**
 * Fetch and parse a single public URL. Returns null on hard failure (network,
 * timeout, non-HTML response) so the caller can skip and continue.
 */
export async function crawlPage(url: string, opts: CrawlOptions = {}): Promise<CrawledPage | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT, "accept": "text/html,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
  clearTimeout(timeoutId);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;
  const html = await res.text();

  const title = firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html);
  const metaDescription = (() => {
    const m = html.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i);
    return m ? attr(m[0], "content") : "";
  })();
  const canonical = (() => {
    const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i);
    return m ? attr(m[0], "href") : "";
  })();
  const robotsMeta = (() => {
    const m = html.match(/<meta\s+[^>]*name=["']robots["'][^>]*>/i);
    return m ? attr(m[0], "content") : "";
  })();
  const h1 = allMatches(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, html).slice(0, 4);
  const h2 = allMatches(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, html).slice(0, 12);
  const schemaTypes = extractSchemaTypes(html);
  const bodyExcerpt = extractBodyExcerpt(html);
  const pageKind = classifyPage(url, title, h1[0] ?? "", bodyExcerpt);
  const wordCount = countWords(html);
  const { lastModified, publishedAt, author } = extractContentMeta(html);
  const hasSources = detectSources(html);

  return {
    url,
    status: res.status,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    h1,
    h2,
    images: extractImages(html, url),
    htmlBytes: html.length,
    bodyExcerpt,
    schemaTypes,
    pageKind,
    wordCount,
    lastModified,
    publishedAt,
    author,
    hasSources,
    rawHtml: html.slice(0, 250_000),
  };
}

/** Strip-then-count words from the body region. */
function countWords(html: string): number {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const text = stripTags(body);
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Parse content meta — checks meta tags + JSON-LD nodes. */
function extractContentMeta(html: string): { lastModified: string | null; publishedAt: string | null; author: string } {
  const result = { lastModified: null as string | null, publishedAt: null as string | null, author: "" };

  // OG / article meta tags.
  const modTag = html.match(/<meta\s+[^>]*property=["']article:modified_time["'][^>]*>/i);
  if (modTag) result.lastModified = attr(modTag[0], "content") || null;
  const pubTag = html.match(/<meta\s+[^>]*property=["']article:published_time["'][^>]*>/i);
  if (pubTag) result.publishedAt = attr(pubTag[0], "content") || null;
  const authorTag = html.match(/<meta\s+[^>]*name=["']author["'][^>]*>/i);
  if (authorTag) result.author = attr(authorTag[0], "content");

  // Fallback to JSON-LD Article / BlogPosting nodes.
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      visitForArticleMeta(parsed, result);
    } catch {
      // skip
    }
  }
  return result;
}

function visitForArticleMeta(node: unknown, out: { lastModified: string | null; publishedAt: string | null; author: string }): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) visitForArticleMeta(n, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) visitForArticleMeta(obj["@graph"], out);
  const t = obj["@type"];
  if (typeof t === "string" && /Article|BlogPosting/.test(t)) {
    if (typeof obj.dateModified === "string" && !out.lastModified) out.lastModified = obj.dateModified;
    if (typeof obj.datePublished === "string" && !out.publishedAt) out.publishedAt = obj.datePublished;
    const a = obj.author;
    if (a && !out.author) {
      if (typeof a === "string") out.author = a;
      else if (typeof a === "object" && a !== null) {
        const name = (a as Record<string, unknown>).name;
        if (typeof name === "string") out.author = name;
      }
    }
  }
}

/** Heuristic — does the page have at least one external link or <cite>? */
function detectSources(html: string): boolean {
  if (/<cite\b/i.test(html)) return true;
  // External link = href starting with http(s) and not pointing back to the
  // same host. We don't have the host here, so accept any rel="external" or
  // any href to a different domain. Cheap heuristic.
  if (/<a\s+[^>]*rel=["'][^"']*\b(external|noreferrer)\b[^"']*["'][^>]*>/i.test(html)) return true;
  return false;
}

/**
 * Pull every @type value out of <script type="application/ld+json"> blocks.
 * Handles both single objects and @graph arrays.
 */
function extractSchemaTypes(html: string): string[] {
  const out = new Set<string>();
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      visitTypes(parsed, out);
    } catch {
      // Malformed JSON — skip; the agent can later propose a replacement.
    }
  }
  return Array.from(out);
}

function visitTypes(node: unknown, out: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) visitTypes(n, out);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") out.add(t);
    else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") out.add(v);
    const graph = obj["@graph"];
    if (graph) visitTypes(graph, out);
  }
}

/** Pull the first ~1500 chars of visible body text — used as agent context. */
function extractBodyExcerpt(html: string): string {
  // Crude but effective: strip head, scripts, styles, then strip tags.
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return stripTags(body).slice(0, 1500);
}

/** Classify the page kind by URL path + heading shape — drives schema choice. */
function classifyPage(url: string, title: string, h1: string, bodyExcerpt: string): CrawledPage["pageKind"] {
  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
  })();
  if (path === "/" || path === "") return "home";
  if (/^\/(about|about-us|our-story|company)/.test(path)) return "about";
  if (/^\/(contact|contact-us|reach-us|get-in-touch)/.test(path)) return "contact";
  if (/^\/(faq|faqs|questions|help)/.test(path)) return "faq";
  if (/^\/(blog|news|articles|posts)\//.test(path)) return "article";
  const text = (title + " " + h1 + " " + bodyExcerpt).toLowerCase();
  // Neighbourhood-page URL patterns in the current cleaning-services network,
  // e.g. "/villa-cleaning-<neighbourhood>/", "/deep-cleaning-<area>/",
  // "/cleaning-services-<area>/", "/apartment-cleaning-<area>/".
  if (/^\/(villa-cleaning|deep-cleaning|move-in-cleaning|move-out-cleaning|post-construction-cleaning|sofa-cleaning|carpet-cleaning|office-cleaning|cleaning-services|maid-service)-[\w-]+\/?$/.test(path)) return "city";
  if (/\bservice\b|\bbook\b|\bquote\b|\bhire\b/.test(text)) return "service";
  return "unknown";
}

/**
 * Try to discover the site's pages via sitemap.xml (and a sitemap_index.xml
 * fallback). We deliberately keep this small — for Phase 1 we just need a
 * representative sample of URLs. If sitemap.xml is missing, we fall back to
 * the homepage and follow its outgoing same-host links.
 */
export async function discoverPages(siteDomain: string, opts: CrawlOptions = {}): Promise<string[]> {
  const base = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`;
  const max = opts.maxPages ?? 25;
  const tried: string[] = [];

  async function fetchText(u: string): Promise<string | null> {
    try {
      const r = await fetch(u, {
        headers: { "user-agent": opts.userAgent ?? DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      if (!r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  // 1. Try sitemap.xml at the canonical location.
  const sitemapXml = await fetchText(`${base}/sitemap.xml`);
  if (sitemapXml) {
    const urls = extractSitemapUrls(sitemapXml);
    if (urls.length > 0) return Array.from(new Set(urls)).slice(0, max);
    // sitemap_index — recurse one level.
    const indexes = Array.from(sitemapXml.matchAll(/<loc>([^<]+\.xml)<\/loc>/gi)).map((m) => m[1]);
    for (const idx of indexes.slice(0, 5)) {
      const inner = await fetchText(idx);
      if (inner) tried.push(...extractSitemapUrls(inner));
      if (tried.length >= max) break;
    }
    if (tried.length > 0) return Array.from(new Set(tried)).slice(0, max);
  }

  // 2. Fall back to homepage + same-host outgoing links.
  const home = await fetchText(base + "/");
  if (!home) return [base + "/"];
  const links = Array.from(home.matchAll(/href\s*=\s*"([^"]+)"/gi))
    .map((m) => resolveUrl(m[1], base + "/"))
    .filter((u) => u.startsWith(base))
    .filter((u) => !u.includes("#"))
    .filter((u) => !/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js)(?:\?|$)/i.test(u));
  return Array.from(new Set([base + "/", ...links])).slice(0, max);
}

function extractSitemapUrls(xml: string): string[] {
  // Permissive — works on both regular and image sitemaps.
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi))
    .map((m) => m[1].trim())
    .filter((u) => /^https?:\/\//.test(u))
    .filter((u) => !u.endsWith(".xml"));
}
