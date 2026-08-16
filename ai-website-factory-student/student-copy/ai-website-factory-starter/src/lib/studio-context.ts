/**
 * studio-context.ts — pure mapping helpers that turn a build project + its
 * pages into the parameter objects the site renderer expects.
 *
 * No DB access, no Node-only APIs — just data shaping so both the preview API
 * route and any server action can build a consistent render input. Types come
 * from the fixed site-renderer contract.
 */
import type {
  StudioBusiness,
  StudioPalette,
  StudioRenderPage,
} from "@/lib/site-renderer";
import { defaultPaletteFromDna } from "@/lib/site-renderer";
import { markdownToHtml } from "@/lib/markdown";
import type { SiteBuildPage, SiteBuildProject } from "@/db/schema";

/* ---------------------------------------------------------------------------- *
 *  Small string helpers
 * ---------------------------------------------------------------------------- */

function kebab(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(input: string): string {
  return String(input || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** First segment of a page title — strips the " | brand" / " - brand" tail. */
function firstSegment(title: string): string {
  return String(title || "").split(/[|\-–—]/)[0].trim();
}

/* ---------------------------------------------------------------------------- *
 *  buildStudioBusiness — project + pages → renderer business object
 * ---------------------------------------------------------------------------- */

export function buildStudioBusiness(
  project: SiteBuildProject,
  pages: SiteBuildPage[],
): StudioBusiness {
  const businessName = project.businessName || "Your Limousine Co.";
  const nameParts = businessName.trim().split(/\s+/);
  const logoA = nameParts[0] || businessName;
  const logoB = nameParts.slice(1).join(" ") || "";

  const facts = (project.businessFacts ?? {}) as Record<string, unknown>;
  const phone =
    typeof facts.contact_phone === "string" && facts.contact_phone.trim()
      ? facts.contact_phone.trim()
      : "+1 (000) 000-0000";
  const email =
    typeof facts.contact_email === "string" && facts.contact_email.trim()
      ? facts.contact_email.trim()
      : `reservations@${project.slug || kebab(businessName) || "site"}.com`;

  const services = ((project.services as string[]) || []).map((label) => ({
    label: titleCase(label),
    slug: "/" + kebab(label) + "/",
  }));

  // Areas come from the project's service-area pages.
  const areas = pages
    .filter((p) => p.pageType === "service_area" || p.pageType === "area")
    .map((p) => ({
      label: firstSegment(p.title) || p.title,
      slug: p.pageSlug,
    }));

  return {
    businessName,
    city: project.city || "",
    region: project.region || undefined,
    phone,
    email,
    services,
    areas,
    logoA,
    logoB,
  };
}

/* ---------------------------------------------------------------------------- *
 *  resolvePalette — project.studioPalette override, else derive from DNA
 * ---------------------------------------------------------------------------- */

export function resolvePalette(project: SiteBuildProject): StudioPalette {
  if (project.studioPalette && typeof project.studioPalette === "object") {
    return project.studioPalette as unknown as StudioPalette;
  }
  return defaultPaletteFromDna(project.designDna);
}

/* ---------------------------------------------------------------------------- *
 *  buildRenderPage — siteBuildPage → renderer page object
 * ---------------------------------------------------------------------------- */

export function buildRenderPage(page: SiteBuildPage): StudioRenderPage {
  const bodyHtml =
    page.bodyHtml ?? (page.bodyMarkdown ? markdownToHtml(page.bodyMarkdown) : "");

  return {
    pageType: page.pageType,
    pageSlug: page.pageSlug,
    title: page.title,
    h1: page.h1,
    metaDescription: page.metaDescription,
    bodyHtml,
    // No structured FAQ field on the page row yet — the renderer treats an
    // empty array as "skip the FAQ band".
    faq: [],
  };
}
