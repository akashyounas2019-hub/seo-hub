/**
 * Generic URL → screenshot capture for the chat agent.
 *
 * Unlike `build-screenshot-capture.ts` which is keyed by (projectId, hostname)
 * and reads competitor URLs out of research markdown, this module is for
 * ad-hoc captures: any URL, any subset of {desktop, tablet, mobile}, results
 * stored on disk and served back as Markdown images the chat renders inline.
 *
 * Also exposes accessibility checking via axe-core injection — same browser
 * launch path, different post-load action, so we keep one shared Playwright
 * loader.
 *
 * Disk layout (under SCREENSHOT_STORAGE_PATH/url-previews/):
 *   <urlHash>/<viewport>.png
 *
 * Served via /api/preview/url/[hash]/[viewport].png. Admin-only.
 */

import { mkdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const STORAGE_BASE = process.env.SCREENSHOT_STORAGE_PATH
  ?? path.join(process.cwd(), ".data", "screenshots");
const SUBDIR = "url-previews";

export type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_DIMS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

/** Lazy Playwright loader — matches build-screenshot-capture.ts. */
async function loadPlaywright(): Promise<{ chromium: unknown } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("playwright" as any)) as { chromium: unknown };
    return { chromium: mod.chromium };
  } catch (err) {
    console.warn("[url-preview] playwright not installed:", err);
    return null;
  }
}

/** Deterministic short hash for a URL — used as the storage + URL key. */
export function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export function previewStoragePath(url: string, viewport: Viewport): string {
  const hash = urlHash(url);
  return path.join(STORAGE_BASE, SUBDIR, hash, `${viewport}.png`);
}

export function previewPublicUrl(url: string, viewport: Viewport): string {
  const hash = urlHash(url);
  return `/api/preview/url/${hash}/${viewport}.png`;
}

// ────────── Screenshot capture ──────────

export interface CaptureResult {
  viewport: Viewport;
  width: number;
  height: number;
  status: "captured" | "failed" | "skipped";
  publicUrl: string | null;
  bytes: number | null;
  error: string | null;
}

export async function captureUrlAtViewports(
  url: string,
  viewports: Viewport[],
  opts: { force?: boolean; timeoutMs?: number; fullPage?: boolean } = {},
): Promise<{ url: string; results: CaptureResult[] }> {
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      url,
      results: viewports.map((vp) => ({
        viewport: vp,
        width: VIEWPORT_DIMS[vp].width,
        height: VIEWPORT_DIMS[vp].height,
        status: "failed",
        publicUrl: null,
        bytes: null,
        error: "playwright not installed on server",
      })),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = pw.chromium as any;
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: execPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined,
  });

  const results: CaptureResult[] = [];
  try {
    for (const vp of viewports) {
      const dims = VIEWPORT_DIMS[vp];
      const targetPath = previewStoragePath(url, vp);

      if (!opts.force && existsSync(targetPath)) {
        const bytes = statSync(targetPath).size;
        results.push({
          viewport: vp,
          width: dims.width,
          height: dims.height,
          status: "skipped",
          publicUrl: previewPublicUrl(url, vp),
          bytes,
          error: null,
        });
        continue;
      }

      const context = await browser.newContext({
        viewport: dims,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        deviceScaleFactor: vp === "mobile" ? 2 : 1,
      });
      const page = await context.newPage();
      try {
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: opts.timeoutMs ?? 30_000,
        });
        await page.waitForTimeout(600);
        mkdirSync(path.dirname(targetPath), { recursive: true });
        await page.screenshot({ path: targetPath, fullPage: opts.fullPage === true });
        const bytes = statSync(targetPath).size;
        results.push({
          viewport: vp,
          width: dims.width,
          height: dims.height,
          status: "captured",
          publicUrl: previewPublicUrl(url, vp),
          bytes,
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          viewport: vp,
          width: dims.width,
          height: dims.height,
          status: "failed",
          publicUrl: null,
          bytes: null,
          error: msg.slice(0, 500),
        });
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { url, results };
}

// ────────── Accessibility (axe-core) ──────────

export interface AccessibilityViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  helpUrl: string;
  affected_nodes: number;
  sample_target: string | null;
  sample_html: string | null;
}

export interface AccessibilityResult {
  url: string;
  viewport: Viewport;
  passes: number;
  violations: AccessibilityViolation[];
  incomplete: number;
  inapplicable: number;
  worst_impact: "none" | "minor" | "moderate" | "serious" | "critical";
  error: string | null;
}

const IMPACT_RANK: Record<string, number> = {
  none: 0,
  minor: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};

/**
 * Run axe-core against a URL. Loads axe-core into the page via
 * `page.addScriptTag` so we don't need to pre-bundle the axe runtime —
 * picks it up from the installed npm package. Returns violations sorted
 * by impact (critical first).
 */
export async function checkUrlAccessibility(
  url: string,
  viewport: Viewport = "desktop",
  opts: { timeoutMs?: number } = {},
): Promise<AccessibilityResult> {
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      url,
      viewport,
      passes: 0,
      violations: [],
      incomplete: 0,
      inapplicable: 0,
      worst_impact: "none",
      error: "playwright not installed on server",
    };
  }

  // Resolve axe-core path from the installed package so we can inject it
  // into the page. Lazy require so the lib loads even when axe isn't
  // installed yet (dev-time).
  let axePath: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    axePath = require.resolve("axe-core/axe.min.js");
  } catch {
    return {
      url,
      viewport,
      passes: 0,
      violations: [],
      incomplete: 0,
      inapplicable: 0,
      worst_impact: "none",
      error: "axe-core not installed on server (run: npm install axe-core)",
    };
  }

  const dims = VIEWPORT_DIMS[viewport];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = pw.chromium as any;
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: execPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined,
  });

  let result: AccessibilityResult;
  try {
    const context = await browser.newContext({ viewport: dims });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: opts.timeoutMs ?? 30_000 });
      await page.addScriptTag({ path: axePath });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axeOut: any = await page.evaluate(`
        new Promise((resolve, reject) => {
          axe.run(document, { resultTypes: ['violations', 'incomplete', 'inapplicable', 'passes'] })
            .then(resolve)
            .catch(reject);
        })
      `);

      const violations: AccessibilityViolation[] = (axeOut.violations ?? []).map((v: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nodes = (v.nodes as any[]) ?? [];
        const first = nodes[0];
        return {
          id: String(v.id ?? ""),
          impact: (v.impact as AccessibilityViolation["impact"]) ?? null,
          description: String(v.description ?? ""),
          help: String(v.help ?? ""),
          helpUrl: String(v.helpUrl ?? ""),
          affected_nodes: nodes.length,
          sample_target: Array.isArray(first?.target) ? first.target.join(", ") : null,
          sample_html: typeof first?.html === "string" ? first.html.slice(0, 200) : null,
        };
      });
      // Sort by impact, critical first
      violations.sort(
        (a, b) => (IMPACT_RANK[b.impact ?? "none"] ?? 0) - (IMPACT_RANK[a.impact ?? "none"] ?? 0),
      );

      const worst = violations.reduce<AccessibilityResult["worst_impact"]>((acc, v) => {
        const rank = IMPACT_RANK[v.impact ?? "none"] ?? 0;
        const accRank = IMPACT_RANK[acc] ?? 0;
        return rank > accRank ? ((v.impact ?? "none") as AccessibilityResult["worst_impact"]) : acc;
      }, "none");

      result = {
        url,
        viewport,
        passes: Array.isArray(axeOut.passes) ? axeOut.passes.length : 0,
        incomplete: Array.isArray(axeOut.incomplete) ? axeOut.incomplete.length : 0,
        inapplicable: Array.isArray(axeOut.inapplicable) ? axeOut.inapplicable.length : 0,
        violations,
        worst_impact: worst,
        error: null,
      };
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } catch (err) {
    result = {
      url,
      viewport,
      passes: 0,
      violations: [],
      incomplete: 0,
      inapplicable: 0,
      worst_impact: "none",
      error: err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}
