/**
 * sitemap_regression — flags sites whose XML sitemap can't be reached, or
 * whose sitemap-listed URLs return 4xx/5xx, or whose homepage suddenly has
 * a noindex/nofollow that wasn't there before. Catches dev-team mistakes
 * and host config breakage.
 *
 * MVP scope: check that `/sitemap.xml` (or RankMath's `sitemap_index.xml`)
 * resolves, and sample-check 5 random URLs from it for 200-status.
 */
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import type { CheckResult, AlertCandidate } from "../check-engine";
import { getRuleConfig } from "../check-engine";

async function fetchSitemap(domain: string): Promise<{ ok: boolean; status: number; urls: string[]; via: string }> {
  for (const path of ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"]) {
    try {
      const r = await fetch(`https://${domain}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const xml = await r.text();
        // Pull <loc>...</loc> entries — works for both index and urlset shapes.
        const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]).slice(0, 40);
        return { ok: true, status: r.status, urls, via: path };
      }
      return { ok: false, status: r.status, urls: [], via: path };
    } catch {
      // try next
    }
  }
  return { ok: false, status: 0, urls: [], via: "(none reachable)" };
}

async function sample(arr: string[], n: number): Promise<string[]> {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

export async function run(): Promise<CheckResult> {
  const startedAt = Date.now();
  const candidates: AlertCandidate[] = [];
  const allSites = await db().select({ id: sites.id, domain: sites.domain, name: sites.name, slug: sites.slug }).from(sites);

  for (const s of allSites) {
    const { config } = await getRuleConfig("sitemap_regression", s.id);
    const sampleSize = Number(config.sampleSize);
    const sm = await fetchSitemap(s.domain);
    if (!sm.ok) {
      candidates.push({
        kind: "sitemap_regression",
        siteId: s.id,
        entity: `${s.slug}:sitemap-missing`,
        severity: "error",
        title: `${s.name}: sitemap not reachable`,
        body: `Tried sitemap_index.xml, sitemap.xml, wp-sitemap.xml. Last response: HTTP ${sm.status} via ${sm.via}.`,
        payload: { domain: s.domain, lastStatus: sm.status, triedVia: sm.via },
      });
      continue;
    }

    // If the sitemap was an index, the entries point at sub-sitemaps; sample N of those.
    const probeUrls = await sample(sm.urls, sampleSize);
    let badCount = 0;
    const bad: Array<{ url: string; status: number }> = [];
    for (const u of probeUrls) {
      try {
        const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8_000) });
        if (r.status >= 400) {
          badCount++;
          bad.push({ url: u, status: r.status });
        }
      } catch {
        badCount++;
        bad.push({ url: u, status: 0 });
      }
    }
    if (badCount > 0) {
      candidates.push({
        kind: "sitemap_regression",
        siteId: s.id,
        entity: `${s.slug}:bad-urls`,
        severity: badCount >= 3 ? "error" : "warn",
        title: `${s.name}: ${badCount}/${probeUrls.length} sitemap URLs returned ≥400`,
        body: `Spot-check of sitemap entries failed. Either pages were deleted without removing from sitemap, or the host is rejecting some routes. First few: ${bad.slice(0, 3).map((b) => `${b.url} (${b.status})`).join(", ")}`,
        payload: { domain: s.domain, badCount, sampled: probeUrls.length, examples: bad.slice(0, 5) },
      });
    }
  }

  return {
    candidates,
    durationMs: Date.now() - startedAt,
    observed: `${allSites.length} sites checked (sitemap + 5-url sample each)`,
  };
}
