import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePages, sites } from "@/db/schema";

/**
 * Site-wide thin-content audit.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Google folded the Helpful Content system into core ranking in 2024, so
 * quality is now evaluated at the *domain* level: a cluster of thin pages can
 * drag down the rankings of the whole site, not just the thin pages
 * themselves. Operators therefore need a single "how much dead weight is this
 * domain carrying?" read per site — prune or improve those pages and the
 * whole domain's chances lift.
 *
 * SIGNAL USED
 * ───────────
 * Per-page word count, stored on `site_pages.word_count`. This column is
 * synced from each WordPress site via the plugin's `/seo-inventory` endpoint
 * (one row per published page/post), so it is the most direct, already-present
 * proxy for "thin". No stored 0-100 *content-quality* score exists at the page
 * level (`site_scores.content_decay` is a single per-site composite, not
 * per-page), so word count is the best available signal — and it matches the
 * 600-word service-page minimum the local-SEO rubric already enforces
 * (`local-seo-rubric.ts` → `body_word_count`).
 *
 * No DB columns or migrations are added — this reads existing data only.
 */

/** A page is "thin" below this many words. Mirrors the 600-word service-page
 *  floor in the local-SEO rubric. */
export const THIN_WORD_THRESHOLD = 600;

/** A site with at least this share of its content pages thin is flagged "at
 *  risk" — enough dead weight to plausibly drag the domain. */
const RISK_RATIO = 0.2;

/** Content post types we judge. Attachments / nav menus / revisions never
 *  carry ranking weight, so they're excluded from the denominator. */
const CONTENT_POST_TYPES = ["page", "post"];

export type ThinVerdict = "clean" | "watch" | "at_risk";

export type ThinOffender = {
  slug: string;
  title: string;
  url: string;
  wordCount: number;
};

export type SiteThinReport = {
  siteId: string;
  siteSlug: string;
  siteName: string;
  siteDomain: string;
  /** Published content pages considered (page + post, status=publish). */
  totalPages: number;
  /** How many of those are below THIN_WORD_THRESHOLD. */
  thinPages: number;
  /** thinPages / totalPages, 0 when no pages. */
  thinRatio: number;
  /** Worst offenders, fewest words first. */
  worst: ThinOffender[];
  verdict: ThinVerdict;
};

export type ThinNetworkReport = {
  threshold: number;
  /** Per-site rows, most-at-risk first. */
  sites: SiteThinReport[];
  /** Sites whose verdict is "at_risk". */
  sitesAtRisk: number;
  /** Sites with any thin page at all. */
  sitesWithThin: number;
  /** Total thin pages across the whole network. */
  totalThinPages: number;
};

function verdictFor(totalPages: number, thinPages: number, ratio: number): ThinVerdict {
  if (totalPages === 0 || thinPages === 0) return "clean";
  if (ratio >= RISK_RATIO) return "at_risk";
  return "watch";
}

/**
 * Compute the network-wide thin-content roll-up.
 *
 * One grouped aggregate pass for the per-site counts, plus one bounded query
 * for the worst offenders — both indexed on `(site_id, post_type, status)` /
 * `(site_id, slug)`, so this stays cheap even at 100 sites.
 *
 * @param worstPerSite how many offender pages to surface per site (default 5)
 */
export async function getThinContentReport(worstPerSite = 5): Promise<ThinNetworkReport> {
  const d = db();

  // ── Per-site aggregate: total content pages + thin count ──
  const agg = await d
    .select({
      siteId: sites.id,
      siteSlug: sites.slug,
      siteName: sites.name,
      siteDomain: sites.domain,
      totalPages: sql<number>`count(${sitePages.id})::int`,
      thinPages: sql<number>`coalesce(sum(case when ${sitePages.wordCount} < ${THIN_WORD_THRESHOLD} then 1 else 0 end), 0)::int`,
    })
    .from(sites)
    .leftJoin(
      sitePages,
      and(
        eq(sitePages.siteId, sites.id),
        eq(sitePages.status, "publish"),
        inArray(sitePages.postType, CONTENT_POST_TYPES),
      ),
    )
    .groupBy(sites.id, sites.slug, sites.name, sites.domain);

  // ── Worst offenders per site (only for sites that have any thin page) ──
  const siteIdsWithThin = agg.filter((r) => Number(r.thinPages) > 0).map((r) => r.siteId);
  const offendersBySite = new Map<string, ThinOffender[]>();

  if (siteIdsWithThin.length > 0) {
    const offenderRows = await d
      .select({
        siteId: sitePages.siteId,
        slug: sitePages.slug,
        title: sitePages.title,
        url: sitePages.url,
        wordCount: sitePages.wordCount,
      })
      .from(sitePages)
      .where(
        and(
          inArray(sitePages.siteId, siteIdsWithThin),
          eq(sitePages.status, "publish"),
          inArray(sitePages.postType, CONTENT_POST_TYPES),
          sql`${sitePages.wordCount} < ${THIN_WORD_THRESHOLD}`,
        ),
      )
      .orderBy(asc(sitePages.wordCount));

    for (const row of offenderRows) {
      const list = offendersBySite.get(row.siteId) ?? [];
      if (list.length < worstPerSite) {
        list.push({
          slug: row.slug,
          title: row.title,
          url: row.url,
          wordCount: Number(row.wordCount),
        });
      }
      offendersBySite.set(row.siteId, list);
    }
  }

  const siteReports: SiteThinReport[] = agg.map((r) => {
    const totalPages = Number(r.totalPages);
    const thinPages = Number(r.thinPages);
    const thinRatio = totalPages > 0 ? thinPages / totalPages : 0;
    return {
      siteId: r.siteId,
      siteSlug: r.siteSlug,
      siteName: r.siteName,
      siteDomain: r.siteDomain,
      totalPages,
      thinPages,
      thinRatio,
      worst: offendersBySite.get(r.siteId) ?? [],
      verdict: verdictFor(totalPages, thinPages, thinRatio),
    };
  });

  // Most-at-risk first: by ratio desc, then by absolute thin count desc.
  siteReports.sort((a, b) => b.thinRatio - a.thinRatio || b.thinPages - a.thinPages);

  return {
    threshold: THIN_WORD_THRESHOLD,
    sites: siteReports,
    sitesAtRisk: siteReports.filter((s) => s.verdict === "at_risk").length,
    sitesWithThin: siteReports.filter((s) => s.thinPages > 0).length,
    totalThinPages: siteReports.reduce((n, s) => n + s.thinPages, 0),
  };
}
