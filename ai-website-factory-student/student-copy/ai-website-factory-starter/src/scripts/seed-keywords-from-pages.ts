/**
 * Seed tracked_keywords from the live site_pages catalogue.
 *
 * "Which keywords are we targeting right now?" = the primary keyword each
 * published commercial page is built around. We derive that from the page
 * title (the part before the first | — – or , separator), which on the GYL
 * sites is the exact head term ("Villa Deep Clean Dubai Marina", "Office
 * Cleaning DIFC"). Utility pages (about/contact/legal/machine files) are skipped.
 *
 * Idempotent: clears prior source='page-derived' rows per site, then re-seeds.
 * Rank positions stay null until a rank sweep or GSC connection fills them —
 * this just gives the operator the per-site target list to look at.
 *
 * Optional arg: a single site slug to limit the seed.
 */
import { and, eq } from "drizzle-orm";
import { ensureSchema, db } from "../db/client";
import { sites, sitePages, trackedKeywords, type NewTrackedKeyword } from "../db/schema";

const SOURCE = "page-derived";

// Pages that don't target a commercial head term.
const SKIP_SLUGS = new Set([
  "", "home", "about", "about-us", "contact", "contact-us", "contact-info",
  "llms-txt", "llms", "privacy", "privacy-policy", "terms", "terms-of-service",
  "terms-conditions", "thank-you", "thankyou", "sitemap", "reservation",
  "reservations", "book", "booking", "blog",
  // default WP sample post + navigational hubs (not head-term targets)
  "hello-world", "areas-we-serve", "our-services", "services", "areas",
]);

// Home page money keyword per known domain (title "Home" is useless).
const HOME_KEYWORD: Record<string, string> = {
  
  "example.com": "your main service keyword",
  
};

function locationFor(domain: string): string {
  if (/abudhabi|abu-dhabi/i.test(domain)) return "Abu Dhabi, United Arab Emirates";
  if (/sharjah/i.test(domain)) return "Sharjah, United Arab Emirates";
  if (/ajman/i.test(domain)) return "Ajman, United Arab Emirates";
  return "Dubai, United Arab Emirates";
}

/** Head term = title up to the first | — – or , separator, lowercased. */
function keywordFromTitle(title: string): string {
  const head = title.split(/[|—–,]/)[0] || title;
  return head.replace(/\s+/g, " ").trim().toLowerCase();
}

function isHome(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "";
  } catch {
    return url.replace(/\/+$/, "") === `https://${domain}`;
  }
}

async function main() {
  await ensureSchema();
  const onlySlug = process.argv[2]?.trim() || undefined;

  let allSites = await db()
    .select({ id: sites.id, slug: sites.slug, domain: sites.domain })
    .from(sites);
  if (onlySlug) allSites = allSites.filter((s) => s.slug === onlySlug);

  for (const site of allSites) {
    const pages = await db()
      .select({ title: sitePages.title, url: sitePages.url, slug: sitePages.slug, postType: sitePages.postType })
      .from(sitePages)
      .where(and(eq(sitePages.siteId, site.id), eq(sitePages.status, "publish")));

    const rows: NewTrackedKeyword[] = [];
    const seen = new Set<string>();
    const loc = locationFor(site.domain);

    for (const p of pages) {
      const slug = (p.slug || "").toLowerCase();
      let keyword: string | null = null;

      if (isHome(p.url, site.domain)) {
        keyword = HOME_KEYWORD[site.domain] ?? null;
      } else if (!SKIP_SLUGS.has(slug)) {
        keyword = keywordFromTitle(p.title || slug.replace(/-/g, " "));
      }
      if (!keyword || keyword.length < 3 || seen.has(keyword)) continue;
      seen.add(keyword);

      rows.push({
        siteId: site.id,
        keyword,
        targetUrl: p.url,
        location: loc,
        device: "desktop",
        source: SOURCE,
        enabled: true,
      });
    }

    // Idempotent re-seed: drop prior page-derived rows, insert fresh.
    await db()
      .delete(trackedKeywords)
      .where(and(eq(trackedKeywords.siteId, site.id), eq(trackedKeywords.source, SOURCE)));
    if (rows.length > 0) {
      await db().insert(trackedKeywords).values(rows);
    }
    console.log(`[seed-keywords] ${site.slug}: ${rows.length} target keywords from ${pages.length} pages`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed-keywords] fatal:", e);
    process.exit(1);
  });
