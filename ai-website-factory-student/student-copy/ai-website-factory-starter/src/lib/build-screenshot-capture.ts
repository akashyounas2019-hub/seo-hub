/**
 * Build-research screenshot capture.
 *
 * Reads a build project's research markdown, extracts every external URL,
 * fires up headless Chromium via Playwright, captures a 1440×900 viewport
 * screenshot of each, stores the PNG on disk, and writes a row per URL to
 * `build_research_screenshots`.
 *
 * Reuses the Playwright loader pattern from `src/scripts/screenshot-capture.ts`.
 *
 * Disk layout (under SCREENSHOT_STORAGE_PATH/build-research/):
 *   <projectId>/<hostname>.png
 *
 * Served via /api/build/screenshots/[projectId]/[hostname].
 *
 * Public surface:
 *   - `extractCompetitorUrls(markdown)` — pure, used by chat tools too
 *   - `enqueueCapturesForProject(projectId)` — inserts pending rows
 *   - `captureProjectScreenshots(projectId, opts?)` — actually runs Playwright
 *   - `captureStoragePath(projectId, hostname)` — file path helper
 *   - `publicUrlFor(projectId, hostname)` — URL the chat tool returns
 */

import { mkdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { buildResearchScreenshots, claudeJobs, siteBuildProjects } from "@/db/schema";

const STORAGE_BASE = process.env.SCREENSHOT_STORAGE_PATH
  ?? path.join(process.cwd(), ".data", "screenshots");
const SUBDIR = "build-research";

/** Lazy-load Playwright so the module loads even when the package is missing. */
async function loadPlaywright(): Promise<{ chromium: unknown } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("playwright" as any)) as { chromium: unknown };
    return { chromium: mod.chromium };
  } catch (err) {
    console.warn("[build-screenshots] playwright not installed:", err);
    return null;
  }
}

// ─────────── URL extraction ───────────

const BAD_HOSTS = [
  "example",
  "example.com",
  "schema.org",
  "google.com",
  "anthropic.com",
  "wikipedia.org",
  "youtube.com",
];

/** Common TLDs we accept when parsing bare hostnames from research markdown. */
const ACCEPTED_TLDS = new Set([
  "com", "co", "io", "ae", "us", "uk", "net", "org", "biz", "services",
  "ca", "fr", "de", "it", "es", "ch", "nl", "be", "se", "no", "dk",
  "au", "nz", "jp", "in", "br", "mx",
]);

/**
 * Extract unique external competitor URLs from research markdown.
 *
 * Handles both `https://savoya.com/...` (fully qualified) and `savoya.com`
 * (bare hostname in a table cell) — the research agent tends to drop bare
 * hostnames in markdown tables instead of full URLs. Filters out self /
 * generic-helper domains. Returns at most `max` entries in appearance order.
 */
export function extractCompetitorUrls(
  md: string,
  opts: { max?: number } = {},
): Array<{ url: string; hostname: string }> {
  const max = opts.max ?? 15;
  const seen = new Set<string>();
  const out: Array<{ url: string; hostname: string }> = [];

  const addCandidate = (rawHost: string, url: string) => {
    const host = rawHost.toLowerCase().replace(/^www\./, "");
    if (BAD_HOSTS.some((b) => host.includes(b))) return;
    if (seen.has(host)) return;
    seen.add(host);
    out.push({ url, hostname: host });
  };

  // 1) Fully qualified http(s)://… links
  const urlMatches = md.match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
  for (const raw of urlMatches) {
    const clean = raw.replace(/[.,;:!?]+$/, "");
    try {
      const host = new URL(clean).hostname;
      addCandidate(host, clean);
      if (out.length >= max) return out;
    } catch {
      // skip
    }
  }

  // 2) Bare `host.tld` mentions (common in research-agent markdown tables).
  //    Require a TLD from our allowlist so we don't match things like
  //    "node.js" or "v0.1" or "Mr.Smith".
  const bareMatches = md.match(/(?<![\w/@.])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?![\w/@])/gi) ?? [];
  for (const raw of bareMatches) {
    const host = raw.toLowerCase();
    const tld = host.split(".").pop()!;
    if (!ACCEPTED_TLDS.has(tld)) continue;
    if (!host.includes(".")) continue;
    // Skip obvious non-hosts: starts with a digit + dot (likely version) or
    // is too short.
    if (host.length < 5) continue;
    if (/^\d+\.\d+/.test(host)) continue;
    addCandidate(host, `https://${host.replace(/^www\./, "")}/`);
    if (out.length >= max) return out;
  }

  return out;
}

// ─────────── Storage helpers ───────────

export function captureStoragePath(projectId: string, hostname: string): string {
  const safeHost = hostname.replace(/[^a-z0-9.-]/g, "_");
  return path.join(STORAGE_BASE, SUBDIR, projectId, `${safeHost}.png`);
}

export function publicUrlFor(projectId: string, hostname: string): string {
  return `/api/build/screenshots/${encodeURIComponent(projectId)}/${encodeURIComponent(hostname)}`;
}

// ─────────── Enqueue ───────────

/**
 * Find competitor URLs for a project (from research markdown), upsert one
 * row per (project, hostname) with status='pending'. Returns the rows.
 */
export async function enqueueCapturesForProject(projectId: string): Promise<{
  enqueued: number;
  alreadyKnown: number;
  competitors: Array<{ url: string; hostname: string }>;
}> {
  // Source the research markdown — try project.research first, fall back to job output
  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const research = (project.research ?? {}) as Record<string, unknown>;
  let md = typeof research.markdown === "string" ? research.markdown : "";
  if (!md) {
    const [job] = await db()
      .select()
      .from(claudeJobs)
      .where(
        and(
          eq(claudeJobs.kind, "build:global_research"),
          sql`${claudeJobs.input}->>'projectId' = ${projectId}`,
          eq(claudeJobs.status, "done"),
        ),
      )
      .orderBy(desc(claudeJobs.createdAt))
      .limit(1);
    md = job?.outputMarkdown ?? "";
  }
  if (!md) return { enqueued: 0, alreadyKnown: 0, competitors: [] };

  const competitors = extractCompetitorUrls(md, { max: 12 });

  let enqueued = 0;
  let alreadyKnown = 0;
  for (const c of competitors) {
    // onConflictDoNothing on (project_id, hostname)
    const res = await db()
      .insert(buildResearchScreenshots)
      .values({
        projectId,
        url: c.url,
        hostname: c.hostname,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: buildResearchScreenshots.id });
    if (res.length > 0) enqueued += 1;
    else alreadyKnown += 1;
  }
  return { enqueued, alreadyKnown, competitors };
}

// ─────────── Capture ───────────

/**
 * Run Playwright against every pending row for the given project. Updates
 * each row to status='captured' (+ file_path + bytes) or 'failed' (+ error).
 *
 * Sequential — cleaning-services sites are usually small + we don't want to spike CPU
 * on the VPS. Add `concurrency` later if needed.
 */
export async function captureProjectScreenshots(
  projectId: string,
  opts: { force?: boolean; timeoutMs?: number; viewportWidth?: number; viewportHeight?: number } = {},
): Promise<{
  total: number;
  captured: number;
  failed: number;
  skipped: number;
  results: Array<{ hostname: string; url: string; status: "captured" | "failed" | "skipped"; bytes?: number; error?: string }>;
}> {
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      total: 0,
      captured: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };
  }

  // Get pending rows for this project (or all rows if `force`)
  const rows = await db()
    .select()
    .from(buildResearchScreenshots)
    .where(
      opts.force
        ? eq(buildResearchScreenshots.projectId, projectId)
        : and(
            eq(buildResearchScreenshots.projectId, projectId),
            sql`${buildResearchScreenshots.status} in ('pending','failed')`,
          ),
    );

  if (rows.length === 0) {
    return { total: 0, captured: 0, failed: 0, skipped: 0, results: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromium = pw.chromium as any;
  // On Alpine, point Playwright at the system chromium binary installed via
  // apk. Locally (macOS dev) the env is unset and Playwright uses its own
  // download. `--no-sandbox` is required for Alpine chromium running as a
  // non-root user inside Docker.
  const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: execPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : undefined,
  });

  const results: Array<{
    hostname: string;
    url: string;
    status: "captured" | "failed" | "skipped";
    bytes?: number;
    error?: string;
  }> = [];

  try {
    for (const row of rows) {
      const targetPath = captureStoragePath(projectId, row.hostname);

      // Skip if file already exists + status='captured' (idempotent unless force)
      if (!opts.force && row.status === "captured" && row.filePath && existsSync(targetPath)) {
        results.push({ hostname: row.hostname, url: row.url, status: "skipped" });
        continue;
      }

      const context = await browser.newContext({
        viewport: {
          width: opts.viewportWidth ?? 1440,
          height: opts.viewportHeight ?? 900,
        },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      try {
        await page.goto(row.url, {
          waitUntil: "networkidle",
          timeout: opts.timeoutMs ?? 30_000,
        });
        // Let above-the-fold content settle (hero animations, font swaps)
        await page.waitForTimeout(800);
        mkdirSync(path.dirname(targetPath), { recursive: true });
        await page.screenshot({
          path: targetPath,
          // Just the viewport (hero) — full-page screenshots get huge + slow
          fullPage: false,
        });
        const bytes = statSync(targetPath).size;
        const relPath = `${projectId}/${path.basename(targetPath)}`;
        await db()
          .update(buildResearchScreenshots)
          .set({
            status: "captured",
            filePath: relPath,
            bytes,
            error: null,
            capturedAt: new Date(),
          })
          .where(eq(buildResearchScreenshots.id, row.id));
        results.push({ hostname: row.hostname, url: row.url, status: "captured", bytes });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db()
          .update(buildResearchScreenshots)
          .set({ status: "failed", error: msg.slice(0, 500) })
          .where(eq(buildResearchScreenshots.id, row.id));
        results.push({ hostname: row.hostname, url: row.url, status: "failed", error: msg });
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return {
    total: rows.length,
    captured: results.filter((r) => r.status === "captured").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
