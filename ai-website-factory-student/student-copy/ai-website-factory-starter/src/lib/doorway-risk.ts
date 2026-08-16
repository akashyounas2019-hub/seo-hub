import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePages, sites } from "@/db/schema";

/**
 * Network-level doorway / near-duplicate risk audit (live pages).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Google's scaled-content-abuse + doorway-abuse policy — enforced hard by the
 * May 2026 core update — punishes "swap-the-city-name" pages: a fleet of
 * near-identical pages where only the city / area token changes. A cluster of
 * those can drag the whole domain down, the same way thin content does.
 *
 * The *real* body-similarity detector lives in `doorway-detector.ts` and runs
 * automatically inside the publish gauntlet — but it needs body text, which we
 * only have for `siteBuildPages.bodyMarkdown` (the build workspace), NOT for
 * the live WP catalogue.
 *
 * SIGNAL USED (live network)
 * ──────────────────────────
 * `site_pages` carries `title` + `slug` but no body, so we build an honest
 * PROXY: a title/slug near-duplicate signal. We normalize each published page
 * title to a token *set* (lowercased, punctuation-stripped, stop-words +
 * brand/service-suffix removed) and compare every pair of titles in a site
 * with a blended similarity = max(token-set Jaccard, character-trigram
 * Jaccard). Pairs ≥ `DOORWAY_TITLE_THRESHOLD` join the same cluster (union-
 * find). A cluster of ≥ 2 pages with near-identical titles is the doorway
 * fingerprint — "Airport Limo Vaughan", "Airport Limo Markham", "Airport Limo
 * Aurora" collapse to the same token set once the city token is the only
 * differentiator.
 *
 * To avoid flagging a legitimately-distinct page that merely shares two words,
 * we IGNORE the single city/area token: the comparison runs on the shared
 * template tokens, so two pages are "near-duplicate" precisely when everything
 * *except* the place name matches.
 *
 * Pure SQL + JS. No LLM, no network, no new DB columns / migrations.
 */

// ────────── Thresholds ──────────

/** Blended title similarity at/above which two pages are "near-duplicate". */
export const DOORWAY_TITLE_THRESHOLD = 0.8;

/** A site with at least this share of pages inside a near-dup cluster is "at risk". */
const RISK_RATIO = 0.2;

/** Content post types we judge (attachments / nav / revisions never rank). */
const CONTENT_POST_TYPES = ["page", "post"];

/**
 * Tokens dropped before comparison: connective stop-words plus the
 * vertical's recurring brand / service vocabulary. Removing these means the
 * comparison turns on the genuinely-distinguishing tokens (mostly the place
 * name) — so "Villa Cleaning Palm Jumeirah" vs "Villa Cleaning Emirates Hills"
 * differ by exactly one token and read as a near-duplicate template, which
 * is the point.
 */
const STOP_TOKENS = new Set<string>([
  // connectives
  "the", "a", "an", "and", "or", "of", "in", "to", "for", "with", "your", "our", "near", "me", "at", "on",
  // brand / vertical vocabulary — Dubai cleaning services
  "cleaning", "clean", "cleaner", "cleaners", "service", "services",
  "maid", "maids", "housekeeping", "housekeeper", "maintenance", "sanitisation",
  "sanitization", "disinfection", "hire", "booking", "quote",
  // primary geo — Dubai + UAE.
  "dubai", "uae", "emirates", "united", "arab",
]);

export type DoorwayVerdict = "clean" | "watch" | "at_risk";

/** One near-duplicate cluster: pages whose titles are mutually near-identical. */
export type DoorwayCluster = {
  /** Normalized template signature shared by the cluster (for display). */
  signature: string;
  /** Average pairwise similarity inside the cluster, 0-100. */
  similarityPct: number;
  /** The member pages (title + slug + url). */
  pages: Array<{ title: string; slug: string; url: string }>;
};

export type SiteDoorwayReport = {
  siteId: string;
  siteSlug: string;
  siteName: string;
  siteDomain: string;
  /** Published content pages considered. */
  totalPages: number;
  /** How many of those pages sit in any near-duplicate cluster. */
  clusteredPages: number;
  /** clusteredPages / totalPages, 0 when no pages. */
  clusterRatio: number;
  /** Worst clusters first (biggest, then most-similar). */
  worstClusters: DoorwayCluster[];
  verdict: DoorwayVerdict;
};

export type DoorwayNetworkReport = {
  threshold: number;
  /** Per-site rows, most-at-risk first. */
  sites: SiteDoorwayReport[];
  sitesAtRisk: number;
  /** Sites with any near-duplicate cluster at all. */
  sitesWithClusters: number;
  /** Total clustered pages across the network. */
  totalClusteredPages: number;
};

// ────────── Normalization + similarity (pure) ──────────

/** Title → ordered list of meaningful tokens (stop/brand tokens removed). */
function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP_TOKENS.has(t));
}

/** Character trigram set of a normalized token string — catches near-spellings. */
function trigramSet(s: string): Set<string> {
  const set = new Set<string>();
  const padded = `  ${s} `;
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

type NormPage = {
  title: string;
  slug: string;
  url: string;
  tokens: Set<string>;
  trigrams: Set<string>;
};

function normalize(p: { title: string; slug: string; url: string }): NormPage {
  const toks = tokenize(p.title);
  const joined = toks.join(" ");
  return {
    title: p.title,
    slug: p.slug,
    url: p.url,
    tokens: new Set(toks),
    trigrams: trigramSet(joined),
  };
}

/**
 * Blended title similarity 0..1. We take the MAX of:
 *   - token-set Jaccard (order-free word overlap), and
 *   - character-trigram Jaccard (catches "Markham"/"Markam"-style spellings
 *     and shared substrings).
 * The max is the right combiner: either signal alone firing is enough to call
 * two template-titles near-identical.
 */
function titleSimilarity(a: NormPage, b: NormPage): number {
  return Math.max(jaccard(a.tokens, b.tokens), jaccard(a.trigrams, b.trigrams));
}

function verdictFor(totalPages: number, clusteredPages: number, ratio: number): DoorwayVerdict {
  if (totalPages === 0 || clusteredPages === 0) return "clean";
  if (ratio >= RISK_RATIO) return "at_risk";
  return "watch";
}

/**
 * Cluster a site's pages by title near-duplication using union-find over the
 * pairwise similarity graph (edge when sim ≥ threshold). Returns clusters of
 * size ≥ 2, each annotated with its average internal similarity + a display
 * signature (the most common token order among members).
 */
function clusterPages(pages: NormPage[], threshold: number): DoorwayCluster[] {
  const n = pages.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Track each edge's similarity so we can report a per-cluster average.
  const edgeSims = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = titleSimilarity(pages[i], pages[j]);
      if (sim >= threshold) {
        union(i, j);
        edgeSims.set(`${i}:${j}`, sim);
      }
    }
  }

  // Gather members + intra-cluster edges per root.
  const members = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = members.get(r) ?? [];
    list.push(i);
    members.set(r, list);
  }

  const clusters: DoorwayCluster[] = [];
  for (const [, idxs] of members) {
    if (idxs.length < 2) continue;
    // Average similarity across edges that fall inside this cluster.
    let sum = 0;
    let count = 0;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        sum += titleSimilarity(pages[idxs[a]], pages[idxs[b]]);
        count++;
      }
    }
    const avg = count > 0 ? sum / count : 0;
    // Display signature: shortest member's normalized token string, a compact
    // stand-in for "the shared template".
    const signature =
      idxs
        .map((i) => Array.from(pages[i].tokens).sort().join(" "))
        .sort((x, y) => x.length - y.length)[0] || "(untitled template)";
    clusters.push({
      signature,
      similarityPct: Math.round(avg * 100),
      pages: idxs.map((i) => ({
        title: pages[i].title,
        slug: pages[i].slug,
        url: pages[i].url,
      })),
    });
  }

  // Worst first: biggest cluster, then highest similarity.
  clusters.sort((a, b) => b.pages.length - a.pages.length || b.similarityPct - a.similarityPct);
  return clusters;
}

/**
 * Compute the network-wide doorway-risk roll-up from live `site_pages` titles.
 *
 * One bounded query pulls every published content page (title + slug + url)
 * for all sites — already indexed on `(site_id, post_type, status)`. Clustering
 * is O(pages²) per site, which is trivial at ~50-100 pages/site.
 *
 * @param worstPerSite how many clusters to surface per site (default 3)
 */
export async function getDoorwayRiskReport(worstPerSite = 3): Promise<DoorwayNetworkReport> {
  const d = db();

  const siteRows = await d
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
    })
    .from(sites);

  const pageRows = await d
    .select({
      siteId: sitePages.siteId,
      title: sitePages.title,
      slug: sitePages.slug,
      url: sitePages.url,
    })
    .from(sitePages)
    .where(
      and(
        eq(sitePages.status, "publish"),
        inArray(sitePages.postType, CONTENT_POST_TYPES),
      ),
    )
    .orderBy(asc(sitePages.slug));

  const pagesBySite = new Map<string, Array<{ title: string; slug: string; url: string }>>();
  for (const r of pageRows) {
    const list = pagesBySite.get(r.siteId) ?? [];
    list.push({ title: r.title, slug: r.slug, url: r.url });
    pagesBySite.set(r.siteId, list);
  }

  const siteReports: SiteDoorwayReport[] = siteRows.map((s) => {
    const raw = pagesBySite.get(s.id) ?? [];
    const totalPages = raw.length;
    const normalized = raw.map(normalize);
    const clusters = clusterPages(normalized, DOORWAY_TITLE_THRESHOLD);
    const clusteredPages = clusters.reduce((n, c) => n + c.pages.length, 0);
    const clusterRatio = totalPages > 0 ? clusteredPages / totalPages : 0;
    return {
      siteId: s.id,
      siteSlug: s.slug,
      siteName: s.name,
      siteDomain: s.domain,
      totalPages,
      clusteredPages,
      clusterRatio,
      worstClusters: clusters.slice(0, worstPerSite),
      verdict: verdictFor(totalPages, clusteredPages, clusterRatio),
    };
  });

  // Most-at-risk first: by ratio desc, then by absolute clustered count desc.
  siteReports.sort((a, b) => b.clusterRatio - a.clusterRatio || b.clusteredPages - a.clusteredPages);

  return {
    threshold: DOORWAY_TITLE_THRESHOLD,
    sites: siteReports,
    sitesAtRisk: siteReports.filter((s) => s.verdict === "at_risk").length,
    sitesWithClusters: siteReports.filter((s) => s.clusteredPages > 0).length,
    totalClusteredPages: siteReports.reduce((n, s) => n + s.clusteredPages, 0),
  };
}
