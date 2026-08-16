/**
 * Indexing sync orchestrator. Per site:
 *   1. Discover sitemap URLs
 *   2. Determine index status — GSC URL Inspection if Google connected, else
 *      a light HTTP reachability probe (we DON'T scrape `site:` by default —
 *      Google rate-limits it hard and it's unreliable; HTTP probe at least
 *      confirms the URL is live so a not-indexed live page is actionable)
 *   3. Upsert into indexing_status
 *   4. Submit not-indexed + never-submitted (or >7d since submit) URLs to IndexNow
 *   5. Emit a low-index alert when the indexed ratio is poor
 *
 * Designed to be called from the cron route. Caps inspections per run so we
 * stay within GSC quota and finish inside a reasonable window.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, sitePages, indexingStatus, alerts, type NewAlert } from "@/db/schema";
import { discoverSitemapUrls } from "./sitemap";
import { submitIndexNow, getIndexNowKey } from "./indexnow";
import { recordIndexNowUsage } from "./quota";
import { inspectUrl, resolveProperty, tokenForSite } from "./gsc-inspect";

const MAX_INSPECTS_PER_SITE = 200;
const RESUBMIT_AFTER_MS = 7 * 24 * 3600_000;
const LOW_INDEX_RATIO = 0.7; // alert when < 70% of sitemap URLs are indexed

export interface SiteSyncResult {
  slug: string;
  domain: string;
  sitemapUrls: number;
  inspected: number;
  detection: "gsc" | "http";
  indexed: number;
  notIndexed: number;
  submitted: number;
  submitStatus?: number;
  error?: string;
}

/**
 * URL source for indexing. PREFERS the plugin-fed `site_pages` catalogue,
 * which is populated through the GYL Suite /wp-json endpoint — reachable from
 * this server even when the public front-end sits behind a WAF/anti-bot
 * captcha (e.g. SiteGround SG-Captcha) that 202-challenges our server IP and
 * blocks a direct sitemap fetch. Falls back to the public sitemap only when
 * the catalogue is empty (e.g. a site without the plugin installed).
 */
async function resolveSiteUrls(site: { id: string; domain: string }): Promise<{ urls: string[]; via: string }> {
  const rows = await db()
    .select({ url: sitePages.url })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), eq(sitePages.status, "publish")));

  const normalized = rows
    .map((r) => {
      const u = (r.url || "").trim();
      if (!u) return null;
      if (/^https?:\/\//i.test(u)) return u;
      return `https://${site.domain}${u.startsWith("/") ? "" : "/"}${u}`;
    })
    .filter((u): u is string => !!u);

  const fromCatalogue = [...new Set(normalized)];
  if (fromCatalogue.length > 0) {
    return { urls: fromCatalogue.slice(0, MAX_INSPECTS_PER_SITE), via: "site_pages" };
  }
  return discoverSitemapUrls(site.domain);
}

async function httpProbe(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    return r.status;
  } catch {
    return 0;
  }
}

export async function syncSiteIndexing(site: { id: string; slug: string; domain: string }): Promise<SiteSyncResult> {
  const res: SiteSyncResult = {
    slug: site.slug,
    domain: site.domain,
    sitemapUrls: 0,
    inspected: 0,
    detection: "http",
    indexed: 0,
    notIndexed: 0,
    submitted: 0,
  };

  const { urls } = await resolveSiteUrls(site);
  res.sitemapUrls = urls.length;
  if (urls.length === 0) {
    res.error = "no page URLs (empty catalogue + no reachable sitemap)";
    return res;
  }

  // Decide detection method.
  const token = await tokenForSite(site.id);
  let property: string | null = null;
  if (token) {
    property = await resolveProperty(token, site.domain);
    if (property) res.detection = "gsc";
  }

  const toInspect = urls.slice(0, MAX_INSPECTS_PER_SITE);
  const notIndexedUrls: string[] = [];

  for (const url of toInspect) {
    let indexState = "unknown";
    let coverageState: string | null = null;
    let verdict: string | null = null;
    let lastCrawlAt: Date | null = null;
    let httpStatus: number | null = null;

    if (token && property) {
      const r = await inspectUrl({ token, siteUrl: property, inspectionUrl: url });
      if (r !== "property_mismatch" && r !== "error") {
        indexState = r.indexState;
        coverageState = r.coverageState;
        verdict = r.verdict;
        lastCrawlAt = r.lastCrawlAt;
      } else {
        httpStatus = await httpProbe(url);
        indexState = "unknown";
      }
    } else {
      httpStatus = await httpProbe(url);
      // HTTP probe can't confirm indexing — mark unknown but reachable. A
      // reachable-but-unknown URL is still a submit candidate.
      indexState = httpStatus >= 200 && httpStatus < 400 ? "unknown" : "excluded";
    }

    res.inspected++;
    if (indexState === "indexed") res.indexed++;
    else {
      res.notIndexed++;
      if (indexState !== "excluded") notIndexedUrls.push(url);
    }

    await db()
      .insert(indexingStatus)
      .values({
        siteId: site.id,
        url,
        inSitemap: true,
        indexState,
        coverageState,
        verdict,
        httpStatus,
        lastCheckedAt: new Date(),
        lastCrawlAt,
        detectionSource: res.detection,
      })
      .onConflictDoUpdate({
        target: [indexingStatus.siteId, indexingStatus.url],
        set: {
          inSitemap: true,
          indexState,
          coverageState,
          verdict,
          httpStatus,
          lastCheckedAt: new Date(),
          lastCrawlAt,
          detectionSource: res.detection,
        },
      });
  }

  // Submit the not-indexed URLs we haven't pushed in the last 7 days.
  if (getIndexNowKey() && notIndexedUrls.length > 0) {
    // Find which of these were submitted recently.
    const recent = await db()
      .select({ url: indexingStatus.url, lastSubmittedAt: indexingStatus.lastSubmittedAt })
      .from(indexingStatus)
      .where(eq(indexingStatus.siteId, site.id));
    const recentMap = new Map(recent.map((r) => [r.url, r.lastSubmittedAt]));
    const cutoff = Date.now() - RESUBMIT_AFTER_MS;
    const fresh = notIndexedUrls.filter((u) => {
      const last = recentMap.get(u);
      return !last || last.getTime() < cutoff;
    });

    if (fresh.length > 0) {
      const submit = await submitIndexNow(site.domain, fresh);
      res.submitStatus = submit.status;
      res.submitted = submit.submitted;
      if (submit.ok && submit.submitted > 0) {
        await recordIndexNowUsage(submit.submitted);
        const submittedSet = fresh.slice(0, submit.submitted);
        for (const u of submittedSet) {
          await db()
            .update(indexingStatus)
            .set({ lastSubmittedAt: new Date(), submitSource: "indexnow" })
            .where(and(eq(indexingStatus.siteId, site.id), eq(indexingStatus.url, u)));
        }
      }
    }
  }

  // Low-index alert.
  if (res.inspected >= 5) {
    const ratio = res.indexed / res.inspected;
    if (ratio < LOW_INDEX_RATIO) {
      const fp = `index_low::${site.id}::ratio`;
      const [existing] = await db().select({ id: alerts.id, status: alerts.status, occurrences: alerts.occurrences }).from(alerts).where(eq(alerts.fingerprint, fp)).limit(1);
      const title = `${site.slug}: only ${Math.round(ratio * 100)}% of sitemap pages indexed`;
      const body = `${res.indexed}/${res.inspected} pages indexed (detection: ${res.detection}). ${res.notIndexed} not indexed. Submitted ${res.submitted} to IndexNow this run.`;
      if (existing) {
        if (existing.status !== "dismissed") {
          await db().update(alerts).set({
            lastSeenAt: new Date(),
            occurrences: existing.occurrences + 1,
            title, body, severity: ratio < 0.4 ? "error" : "warn",
            ...(existing.status === "resolved" ? { status: "open", resolvedAt: null } : {}),
            payload: { indexed: res.indexed, inspected: res.inspected, ratio },
          }).where(eq(alerts.id, existing.id));
        }
      } else {
        const row: NewAlert = {
          kind: "index_low",
          severity: ratio < 0.4 ? "error" : "warn",
          status: "open",
          siteId: site.id,
          fingerprint: fp,
          title,
          body,
          payload: { indexed: res.indexed, inspected: res.inspected, ratio },
        };
        await db().insert(alerts).values(row);
      }
    }
  }

  return res;
}

export async function syncAllSitesIndexing(onlySlug?: string): Promise<SiteSyncResult[]> {
  const all = await db().select({ id: sites.id, slug: sites.slug, domain: sites.domain }).from(sites);
  const targets = onlySlug ? all.filter((s) => s.slug === onlySlug) : all;
  const results: SiteSyncResult[] = [];
  for (const s of targets) {
    try {
      results.push(await syncSiteIndexing(s));
    } catch (e) {
      results.push({
        slug: s.slug, domain: s.domain, sitemapUrls: 0, inspected: 0,
        detection: "http", indexed: 0, notIndexed: 0, submitted: 0,
        error: (e as Error).message,
      });
    }
  }
  return results;
}
