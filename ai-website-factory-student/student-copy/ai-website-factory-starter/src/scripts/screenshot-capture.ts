/**
 * P3 — Nightly headless-browser screenshot capture.
 *
 * Captures the homepage (+ optional configured URLs) of every site at two
 * viewports (desktop 1280×800, mobile 390×844), stores the PNG on disk,
 * and computes a perceptual-diff vs the previous capture of the same
 * (site, url, viewport).
 *
 * Dependencies (install on the VPS):
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 *
 * Both `playwright` and `pixelmatch` are loaded via dynamic import so the
 * platform's typecheck + build keep working even when they're not yet
 * installed. The script will print an actionable error message instead.
 *
 * Usage:
 *   npm run screenshots:capture                   # all sites, all viewports
 *   npm run screenshots:capture -- --site=slug    # one site
 *   npm run screenshots:capture -- --viewport=desktop
 *
 * Suggested cron: every 24h at 02:30 UTC.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { siteScreenshots, sites } from "../db/schema";

interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  isMobile?: boolean;
}

const VIEWPORTS: ViewportSpec[] = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

const STORAGE_BASE = process.env.SCREENSHOT_STORAGE_PATH ?? path.join(process.cwd(), ".data", "screenshots");
const DIFF_WARNING_PCT = Number(process.env.SCREENSHOT_DIFF_WARNING_PCT ?? "5");
const DIFF_MAJOR_PCT = Number(process.env.SCREENSHOT_DIFF_MAJOR_PCT ?? "15");

function arg(name: string): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  return hit ? hit.slice(flag.length) : undefined;
}

async function loadPlaywright(): Promise<{ chromium: any } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("playwright" as any)) as { chromium: any };
    return mod;
  } catch {
    return null;
  }
}

async function loadPixelmatch(): Promise<{
  pixelmatch: (a: Buffer, b: Buffer, out: Buffer | null, w: number, h: number, opts?: object) => number;
  PNG: { sync: { read: (buf: Buffer) => { data: Buffer; width: number; height: number } } };
} | null> {
  try {
    const [pm, pngjs] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      import("pixelmatch" as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      import("pngjs" as any),
    ]);
    return { pixelmatch: pm.default ?? pm, PNG: pngjs.PNG ?? pngjs.default?.PNG };
  } catch {
    return null;
  }
}

async function diffAgainst(prevPath: string, nextBytes: Buffer): Promise<number | null> {
  const tools = await loadPixelmatch();
  if (!tools) return null;
  try {
    const prevBytes = await fs.readFile(prevPath);
    const prev = tools.PNG.sync.read(prevBytes);
    const next = tools.PNG.sync.read(nextBytes);
    if (prev.width !== next.width || prev.height !== next.height) return 100;
    const diff = tools.pixelmatch(prev.data, next.data, null, prev.width, prev.height, { threshold: 0.1 });
    const total = prev.width * prev.height;
    return Math.round((diff / total) * 100);
  } catch {
    return null;
  }
}

async function captureOne(
  playwright: { chromium: any },
  browser: any,
  site: { id: string; slug: string; domain: string },
  url: string,
  label: string,
  vp: ViewportSpec,
): Promise<{ ok: boolean; reason?: string } > {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 2 : 1,
    userAgent: vp.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 GYL-Platform/1.0",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // Wait for fonts + animations to settle.
    await page.waitForTimeout(1500);
    const png: Buffer = await page.screenshot({ type: "png", fullPage: false });

    const sha = crypto.createHash("sha256").update(png).digest("hex");
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(STORAGE_BASE, site.slug, day);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${label}-${vp.name}-${sha.slice(0, 8)}.png`;
    const relPath = path.join(site.slug, day, filename);
    await fs.writeFile(path.join(STORAGE_BASE, relPath), png);

    // Diff vs latest previous screenshot of same site/url/viewport
    const [prev] = await db()
      .select({ pngPath: siteScreenshots.pngPath })
      .from(siteScreenshots)
      .where(
        and(
          eq(siteScreenshots.siteId, site.id),
          eq(siteScreenshots.url, url),
          eq(siteScreenshots.viewport, vp.name),
        ),
      )
      .orderBy(desc(siteScreenshots.capturedAt))
      .limit(1);

    let diffPct: number | null = null;
    if (prev) {
      diffPct = await diffAgainst(path.join(STORAGE_BASE, prev.pngPath), png);
    }
    let status: "ok" | "changed" | "major_change" = "ok";
    if (diffPct !== null) {
      if (diffPct >= DIFF_MAJOR_PCT) status = "major_change";
      else if (diffPct >= DIFF_WARNING_PCT) status = "changed";
    }

    await db().insert(siteScreenshots).values({
      siteId: site.id,
      url,
      label,
      viewport: vp.name,
      pngPath: relPath,
      width: vp.width,
      height: vp.height,
      sha256: sha,
      diffPct,
      status,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  await ensureSchema();
  const onlySlug = arg("site");
  const onlyViewport = arg("viewport");

  const playwright = await loadPlaywright();
  if (!playwright) {
    console.error("[screenshots] playwright not installed.");
    console.error("[screenshots] Install on the VPS:");
    console.error("  npm install --save-dev playwright pixelmatch pngjs");
    console.error("  npx playwright install chromium");
    process.exit(2);
  }

  const targetVps = onlyViewport ? VIEWPORTS.filter((v) => v.name === onlyViewport) : VIEWPORTS;
  if (targetVps.length === 0) {
    console.error(`[screenshots] viewport '${onlyViewport}' not recognized — available: ${VIEWPORTS.map((v) => v.name).join(", ")}`);
    process.exit(1);
  }

  const rows = onlySlug
    ? await db().select().from(sites).where(eq(sites.slug, onlySlug))
    : await db().select().from(sites);

  if (rows.length === 0) {
    console.warn(onlySlug ? `[screenshots] site '${onlySlug}' not found` : "[screenshots] no sites");
    return;
  }

  console.log(`[screenshots] launching chromium for ${rows.length} site(s) × ${targetVps.length} viewport(s)`);
  const browser = await playwright.chromium.launch({ headless: true });

  let ok = 0;
  let fail = 0;
  let major = 0;

  try {
    for (const site of rows) {
      const baseUrl = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;
      for (const vp of targetVps) {
        const res = await captureOne(playwright, browser, site, baseUrl, "home", vp);
        if (res.ok) {
          ok++;
          // Re-query the row we just wrote to log the diff
          const [latest] = await db()
            .select({ status: siteScreenshots.status, diffPct: siteScreenshots.diffPct })
            .from(siteScreenshots)
            .where(eq(siteScreenshots.siteId, site.id))
            .orderBy(desc(siteScreenshots.capturedAt))
            .limit(1);
          if (latest?.status === "major_change") major++;
          console.log(`[screenshots] ${site.slug} ${vp.name} — ok (diff=${latest?.diffPct ?? "—"}%, status=${latest?.status})`);
        } else {
          fail++;
          console.warn(`[screenshots] ${site.slug} ${vp.name} — failed: ${res.reason}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`[screenshots] done — ok=${ok} fail=${fail} major-change=${major}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[screenshots] fatal", err);
    process.exit(1);
  });
