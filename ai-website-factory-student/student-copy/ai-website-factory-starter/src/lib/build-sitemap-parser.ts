/**
 * Sitemap markdown → site_build_pages rows.
 *
 * The `build:sitemap_plan` job outputs free-form Markdown with sections
 * for Homepage, Service pages, Service-area pages, Trust pages, Blog
 * seed. We parse it into structured rows so each page can be queued for
 * generation.
 *
 * The parser is forgiving — it accepts many bullet variants. If the
 * output diverges wildly from the expected shape, callers can manually
 * `addPageAction` rows.
 */

export type SiteBuildPageType =
  | "home"
  | "service"
  | "service_area"
  | "fleet"
  | "about"
  | "contact"
  | "blog"
  | "faq";

export interface ParsedPage {
  pageType: SiteBuildPageType;
  pageSlug: string;
  title: string;
  h1: string | null;
  targetKeyword: string | null;
  aiOverviewAngle: string | null;
  sortOrder: number;
}

const SECTION_TO_TYPE: Array<{
  match: RegExp;
  type: SiteBuildPageType;
}> = [
  { match: /^#{1,3}\s*Home(page)?\b/i, type: "home" },
  { match: /^#{1,3}\s*Service pages?\b/i, type: "service" },
  { match: /^#{1,3}\s*Service[- ]area pages?\b/i, type: "service_area" },
  { match: /^#{1,3}\s*Fleet\b/i, type: "fleet" },
  { match: /^#{1,3}\s*Trust pages?\b/i, type: "about" }, // mapped specially below
  { match: /^#{1,3}\s*About\b/i, type: "about" },
  { match: /^#{1,3}\s*Contact\b/i, type: "contact" },
  { match: /^#{1,3}\s*Blog( seed)?\b/i, type: "blog" },
  { match: /^#{1,3}\s*FAQ\b/i, type: "faq" },
];

const TRUST_PAGE_MAP: Record<string, SiteBuildPageType> = {
  about: "about",
  fleet: "fleet",
  contact: "contact",
  reviews: "about",
  insurance: "about",
  licensing: "about",
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `page-${Math.random().toString(36).slice(2, 7)}`
  );
}

/**
 * Split a bullet line like `- /villa-deep-clean · Villa Deep Cleaning · villa deep clean dubai · How much…`
 * Returns ordered fields by separator (· | — |).
 */
function splitBulletFields(line: string): string[] {
  const cleaned = line.replace(/^\s*[-*+]\s+/, "").trim();
  return cleaned
    .split(/\s*[·•|—–]\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractSlug(field: string): string | null {
  const m = field.match(/\/([a-z0-9][a-z0-9-]*)/i);
  return m ? m[1] : null;
}

export function parseSitemapMarkdown(md: string): ParsedPage[] {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const pages: ParsedPage[] = [];
  let currentType: SiteBuildPageType | null = null;
  let order = 0;

  // Homepage is implicit — always add as the first page if the sitemap mentions one.
  let homeAdded = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Section heading?
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentType = null;
      for (const rule of SECTION_TO_TYPE) {
        if (rule.match.test(line)) {
          currentType = rule.type;
          if (currentType === "home" && !homeAdded) {
            pages.push({
              pageType: "home",
              pageSlug: "/",
              title: "Home",
              h1: null,
              targetKeyword: null,
              aiOverviewAngle: null,
              sortOrder: order++,
            });
            homeAdded = true;
          }
          break;
        }
      }
      continue;
    }

    if (!currentType) continue;
    if (!/^\s*[-*+]\s+/.test(line)) continue; // only bullets

    const fields = splitBulletFields(line);
    if (fields.length === 0) continue;

    let type = currentType;
    let slug: string | null = null;
    let title = "";
    let h1: string | null = null;
    let kw: string | null = null;
    let angle: string | null = null;

    // Trust section: "About · Fleet · Contact · Reviews · Insurance & Licensing"
    if (currentType === "about" && fields.length > 0) {
      // Try to match each token to a known trust page
      for (const f of fields) {
        const lower = f.toLowerCase();
        for (const [name, mappedType] of Object.entries(TRUST_PAGE_MAP)) {
          if (lower.includes(name)) {
            const t = mappedType;
            const s = slugify(name);
            pages.push({
              pageType: t,
              pageSlug: s,
              title: f,
              h1: null,
              targetKeyword: null,
              aiOverviewAngle: null,
              sortOrder: order++,
            });
            break;
          }
        }
      }
      continue;
    }

    // Service / service-area / blog bullet — typically: slug · H1 · keyword · angle
    if (fields[0]?.startsWith("/")) {
      slug = extractSlug(fields[0]);
      title = fields[1] ?? fields[0];
      h1 = fields[1] ?? null;
      kw = fields[2] ?? null;
      angle = fields[3] ?? null;
    } else {
      title = fields[0];
      h1 = fields[0];
      slug = slugify(fields[0]);
      kw = fields[1] ?? null;
      angle = fields[2] ?? null;
    }

    if (!slug) slug = slugify(title);
    pages.push({
      pageType: type,
      pageSlug: slug.startsWith("/") ? slug : `/${slug}`,
      title,
      h1,
      targetKeyword: kw,
      aiOverviewAngle: angle,
      sortOrder: order++,
    });
  }

  // Always include a home if not detected
  if (!homeAdded && pages.length > 0) {
    pages.unshift({
      pageType: "home",
      pageSlug: "/",
      title: "Home",
      h1: null,
      targetKeyword: null,
      aiOverviewAngle: null,
      sortOrder: -1,
    });
  }

  return pages;
}
