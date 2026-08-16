/**
 * G1 — Network-health audit importer.
 *
 * Reads the JSON outputs produced by ~/.claude/skills/gyl-network-health and
 * the per-site audit subdirs, then upserts into:
 *   - site_health_audits         (one row per site per run_date)
 *   - page_health_issues         (one row per finding from any dimension)
 *   - health_dimension_scores    (weekly denorm for fast dashboard reads)
 *
 * Usage:
 *   import { importNetworkHealthRun } from "./health-audit-import";
 *   await importNetworkHealthRun({ runDate: "2026-06-11" });
 *
 * Also exposed as a CLI via src/scripts/health-import.ts.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  sites,
  siteHealthAudits,
  pageHealthIssues,
  healthDimensionScores,
} from "@/db/schema";

const HOME = process.env.HOME ?? "/root";
const NETWORK_DIR = resolve(HOME, "gyl-sites", "_network");
const SITES_ROOT = resolve(HOME, "gyl-sites");

export interface ImportOptions {
  /** YYYY-MM-DD of the run to import. Defaults to the latest network matrix on disk. */
  runDate?: string;
}

export interface ImportResult {
  ok: boolean;
  runDate: string;
  sitesImported: number;
  issuesImported: number;
  error?: string;
}

interface NetworkMatrixRow {
  slug: string;
  host: string;
  site: string;
  score: {
    structure: number | null;
    design: number | null;
    onpage: number | null;
    indexing: number | null;
    composite: number | null;
  };
  steps: Record<string, { ok: boolean; error?: string; cached?: boolean; skipped?: boolean }>;
}

function safeReadJson<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")) as T; }
  catch { return null; }
}

function detectLatestRunDate(): string | null {
  if (!existsSync(NETWORK_DIR)) return null;
  const files = readdirSync(NETWORK_DIR).filter((f) => f.startsWith("health-matrix-") && f.endsWith(".json"));
  if (files.length === 0) return null;
  files.sort().reverse();
  const match = files[0].match(/^health-matrix-(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

function weekStartFromDate(dateISO: string): string {
  // Monday of the week containing dateISO (UTC).
  const d = new Date(dateISO + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Pull per-page findings out of the various per-dimension JSON files for a
 * single site. Returns a flat array of issues with normalized severity +
 * issueKey so the dashboard can group/filter.
 */
function extractIssuesForSite(siteSlug: string, runDate: string, siteId: string): Array<{
  pageUrl: string | null;
  pageType: string | null;
  dimension: string;
  issueKey: string;
  severity: "red" | "amber";
  label: string;
  detail: Record<string, unknown>;
}> {
  const out: Array<ReturnType<typeof extractIssuesForSite>[number]> = [];

  const structureDir = resolve(SITES_ROOT, siteSlug, "audits", `structure-audit-${runDate}`);
  const designDir = resolve(SITES_ROOT, siteSlug, "audits", `design-audit-${runDate}`);
  const seoDir = resolve(SITES_ROOT, siteSlug, "audits", `seo-audit-${runDate}`);

  // STRUCTURE — from inventory.json (probeResults + spoke floors).
  const inv = safeReadJson<{
    probeResults?: Array<{ type: string; required: boolean; found: boolean; canonical: boolean; path: string | null }>;
    countByType?: Record<string, number>;
    spokeFloors?: { services: number; areas: number };
  }>(resolve(structureDir, "inventory.json"));
  if (inv?.probeResults) {
    for (const r of inv.probeResults) {
      if (!r.found) {
        out.push({
          pageUrl: null, pageType: r.type,
          dimension: "structure", issueKey: "missing_page",
          severity: "red",
          label: `MISSING ${r.type} page`,
          detail: { type: r.type, canonical: r.path ?? null },
        });
      } else if (!r.canonical) {
        out.push({
          pageUrl: r.path, pageType: r.type,
          dimension: "structure", issueKey: "non_canonical_path",
          severity: "amber",
          label: `${r.type} on non-canonical path ${r.path}`,
          detail: { type: r.type, foundPath: r.path },
        });
      }
    }
    if (inv.spokeFloors) {
      const sc = inv.countByType?.service ?? 0;
      const ac = inv.countByType?.area ?? 0;
      if (sc < inv.spokeFloors.services) {
        out.push({
          pageUrl: null, pageType: "services_hub",
          dimension: "structure", issueKey: "underfilled_services",
          severity: "amber",
          label: `UNDERFILLED services ${sc}/${inv.spokeFloors.services}`,
          detail: { current: sc, floor: inv.spokeFloors.services },
        });
      }
      if (ac < inv.spokeFloors.areas) {
        out.push({
          pageUrl: null, pageType: "areas_hub",
          dimension: "structure", issueKey: "underfilled_areas",
          severity: "amber",
          label: `UNDERFILLED areas ${ac}/${inv.spokeFloors.areas}`,
          detail: { current: ac, floor: inv.spokeFloors.areas },
        });
      }
    }
  }

  // DESIGN — chrome-parity.json drift
  const chrome = safeReadJson<{
    pages?: Array<{ url: string; type: string; headerStatus?: string; footerStatus?: string; headerDiff?: string | null; footerDiff?: string | null }>;
  }>(resolve(designDir, "chrome-parity.json"));
  if (chrome?.pages) {
    for (const p of chrome.pages) {
      if (p.headerStatus === "drift") {
        out.push({
          pageUrl: p.url, pageType: p.type,
          dimension: "design", issueKey: "header_drift",
          severity: "red",
          label: `Header drift vs reference page`,
          detail: { diff: p.headerDiff },
        });
      }
      if (p.footerStatus === "drift") {
        out.push({
          pageUrl: p.url, pageType: p.type,
          dimension: "design", issueKey: "footer_drift",
          severity: "red",
          label: `Footer drift vs reference page`,
          detail: { diff: p.footerDiff },
        });
      }
    }
  }

  // DESIGN — mobile-sweep.json hard-bar failures
  const mobile = safeReadJson<Array<{ label: string; url: string; reachable: boolean; audit?: Record<string, unknown> }>>(
    resolve(designDir, "mobile-sweep.json"),
  );
  if (Array.isArray(mobile)) {
    for (const p of mobile) {
      if (!p.reachable || !p.audit) continue;
      const a = p.audit as {
        hasViewportMeta?: boolean; scrollWidth?: number; viewportWidth?: number;
        smallText?: number; smallTaps?: number; h1Count?: number; h1Visible?: boolean;
        h1Contrast?: number | null; ctaAboveFold?: boolean; telAboveFold?: boolean;
      };
      if (a.hasViewportMeta === false) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "no_viewport_meta", severity: "red", label: "No viewport meta tag", detail: {} });
      if ((a.scrollWidth ?? 0) > (a.viewportWidth ?? 0) + 1) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "horizontal_scroll", severity: "red", label: `Horizontal scroll (${a.scrollWidth} > ${a.viewportWidth})`, detail: { scrollWidth: a.scrollWidth, viewportWidth: a.viewportWidth } });
      if ((a.smallText ?? 0) >= 3) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "small_text", severity: "red", label: `${a.smallText} text element(s) <16px`, detail: { count: a.smallText } });
      if ((a.smallTaps ?? 0) >= 1) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "small_tap_targets", severity: "red", label: `${a.smallTaps} tap target(s) <44px`, detail: { count: a.smallTaps } });
      if (a.h1Count !== 1) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "h1_count", severity: "red", label: `H1 count = ${a.h1Count}`, detail: { count: a.h1Count } });
      else if (a.h1Visible === false) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "h1_not_above_fold", severity: "red", label: "H1 not above fold on mobile", detail: {} });
      if (a.ctaAboveFold === false) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "no_cta_above_fold", severity: "red", label: "No Reserve/Book CTA above fold", detail: {} });
      if (a.telAboveFold === false) out.push({ pageUrl: p.url, pageType: p.label, dimension: "design", issueKey: "no_tel_above_fold", severity: "red", label: "No tel: link above fold", detail: {} });
    }
  }

  // DESIGN — hero-uniqueness.json duplicate pairs
  const hero = safeReadJson<Array<{ url: string; ok: boolean; type: string; hero?: { h1: string; bgKey?: string } }>>(
    resolve(designDir, "hero-uniqueness.json"),
  );
  if (Array.isArray(hero)) {
    const usable = hero.filter((h) => h.ok && h.hero);
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const a = usable[i].hero!;
        const b = usable[j].hero!;
        if (a.bgKey && a.bgKey === b.bgKey && a.h1 && a.h1 === b.h1) {
          out.push({
            pageUrl: usable[j].url, pageType: usable[j].type,
            dimension: "design", issueKey: "duplicate_hero",
            severity: "red",
            label: `Duplicate hero shared with ${usable[i].url}`,
            detail: { otherUrl: usable[i].url, h1: a.h1, bgKey: a.bgKey },
          });
        }
      }
    }
  }

  // ONPAGE — onpage.json per-page RED fails
  const onpage = safeReadJson<{
    results?: Array<{ url: string; type: string; ok?: boolean; redFails?: string[]; amberScore?: number }>;
  }>(resolve(seoDir, "onpage.json"));
  if (onpage?.results) {
    for (const r of onpage.results) {
      if (!r.ok) continue;
      for (const fail of r.redFails ?? []) {
        out.push({
          pageUrl: r.url, pageType: r.type,
          dimension: "onpage", issueKey: fail.replace(/\s+/g, "_").toLowerCase().slice(0, 50),
          severity: "red",
          label: fail,
          detail: { amberScore: r.amberScore },
        });
      }
    }
  }

  // INDEXING — index.json probe-detected problems
  const index = safeReadJson<{ results?: Array<{ url: string; httpStatus: number; noindex?: boolean; finalUrl?: string }> }>(
    resolve(seoDir, "index.json"),
  );
  if (index?.results) {
    for (const r of index.results) {
      if (r.httpStatus === 200 && !r.noindex) continue;
      let key = "index_unknown";
      let severity: "red" | "amber" = "amber";
      let label = `HTTP ${r.httpStatus}`;
      if (r.noindex) { key = "noindex_on_commercial"; severity = "amber"; label = "noindex tag on page"; }
      else if (r.httpStatus === 404 || r.httpStatus === 410) { key = "sitemap_404"; severity = "red"; label = "Sitemap URL returns 404"; }
      else if (r.httpStatus >= 300 && r.httpStatus < 400) { key = "redirected"; severity = "amber"; label = `Redirect to ${r.finalUrl ?? "?"}`; }
      else if (r.httpStatus >= 500) { key = "server_error"; severity = "red"; label = `Server error ${r.httpStatus}`; }
      out.push({
        pageUrl: r.url, pageType: null,
        dimension: "indexing", issueKey: key, severity, label,
        detail: { httpStatus: r.httpStatus, finalUrl: r.finalUrl, noindex: r.noindex },
      });
    }
  }

  return out;
}

export async function importNetworkHealthRun(opts: ImportOptions = {}): Promise<ImportResult> {
  const runDate = opts.runDate ?? detectLatestRunDate();
  if (!runDate) {
    return { ok: false, runDate: "", sitesImported: 0, issuesImported: 0, error: "no network matrix found on disk" };
  }
  const matrixPath = resolve(NETWORK_DIR, `health-matrix-${runDate}.json`);
  const matrix = safeReadJson<NetworkMatrixRow[]>(matrixPath);
  if (!matrix) {
    return { ok: false, runDate, sitesImported: 0, issuesImported: 0, error: `cannot read ${matrixPath}` };
  }

  // Index sites by slug (skipping any matrix row we can't resolve).
  const allSites = await db().select().from(sites);
  const siteBySlug = new Map(allSites.map((s) => [s.slug, s]));

  const weekStart = weekStartFromDate(runDate);
  let sitesImported = 0;
  let issuesImported = 0;

  for (const row of matrix) {
    const dbSite = siteBySlug.get(row.slug);
    if (!dbSite) {
      // Site exists in workspace but not in DB — skip silently. Operator
      // creates the platform-side site row via the sites wizard.
      continue;
    }

    // Upsert site_health_audits.
    const overallStatus = Object.values(row.steps).some((s) => !s.ok) ? "partial" : "ok";
    const [inserted] = await db()
      .insert(siteHealthAudits)
      .values({
        siteId: dbSite.id,
        runDate,
        compositeScore: row.score.composite,
        structureScore: row.score.structure,
        designScore: row.score.design,
        onpageScore: row.score.onpage,
        indexingScore: row.score.indexing,
        raw: row as unknown as Record<string, unknown>,
        status: overallStatus,
      })
      .onConflictDoUpdate({
        target: [siteHealthAudits.siteId, siteHealthAudits.runDate],
        set: {
          compositeScore: row.score.composite,
          structureScore: row.score.structure,
          designScore: row.score.design,
          onpageScore: row.score.onpage,
          indexingScore: row.score.indexing,
          raw: row as unknown as Record<string, unknown>,
          status: overallStatus,
        },
      })
      .returning();
    if (!inserted) continue;

    // Clear existing issues for this audit then re-insert fresh.
    await db().delete(pageHealthIssues).where(eq(pageHealthIssues.auditId, inserted.id));
    const issues = extractIssuesForSite(row.slug, runDate, dbSite.id);
    if (issues.length > 0) {
      await db().insert(pageHealthIssues).values(
        issues.map((i) => ({ ...i, auditId: inserted.id, siteId: dbSite.id })),
      );
    }
    issuesImported += issues.length;
    sitesImported++;

    // Weekly denorm.
    const redCount = issues.filter((i) => i.severity === "red").length;
    const amberCount = issues.length - redCount;
    // Previous week composite for delta.
    const previousWeek = (() => {
      const d = new Date(weekStart + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 7);
      return d.toISOString().slice(0, 10);
    })();
    const [prev] = await db()
      .select({ composite: healthDimensionScores.composite })
      .from(healthDimensionScores)
      .where(and(eq(healthDimensionScores.siteId, dbSite.id), eq(healthDimensionScores.weekStart, previousWeek)))
      .limit(1);
    const delta = (prev?.composite != null && row.score.composite != null) ? row.score.composite - prev.composite : null;

    await db()
      .insert(healthDimensionScores)
      .values({
        siteId: dbSite.id,
        weekStart,
        composite: row.score.composite,
        structure: row.score.structure,
        design: row.score.design,
        onpage: row.score.onpage,
        indexing: row.score.indexing,
        redCount,
        amberCount,
        compositeDelta: delta,
      })
      .onConflictDoUpdate({
        target: [healthDimensionScores.siteId, healthDimensionScores.weekStart],
        set: {
          composite: row.score.composite,
          structure: row.score.structure,
          design: row.score.design,
          onpage: row.score.onpage,
          indexing: row.score.indexing,
          redCount,
          amberCount,
          compositeDelta: delta,
        },
      });
  }

  return { ok: true, runDate, sitesImported, issuesImported };
}
