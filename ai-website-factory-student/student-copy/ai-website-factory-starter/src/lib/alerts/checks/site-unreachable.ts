/**
 * site_unreachable — flags any site whose homepage returns 5xx, fails to
 * connect, or times out. Catches "site is down" silently.
 *
 * Severity:
 *   - DNS/connection fail → critical
 *   - 5xx → error
 *   - 4xx (including 404) → warn (homepage shouldn't 4xx but it's not as bad)
 */
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import type { CheckResult, AlertCandidate } from "../check-engine";

export async function run(): Promise<CheckResult> {
  const startedAt = Date.now();
  const candidates: AlertCandidate[] = [];

  const allSites = await db().select({ id: sites.id, domain: sites.domain, name: sites.name, slug: sites.slug }).from(sites);

  for (const s of allSites) {
    let status = 0;
    let networkError: string | null = null;
    try {
      const r = await fetch(`https://${s.domain}/?probe=${Date.now()}`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "GYL-Alert-Check/1.0", "Cache-Control": "no-cache" },
      });
      status = r.status;
    } catch (e) {
      networkError = (e as Error).message;
    }

    if (networkError) {
      candidates.push({
        kind: "site_unreachable",
        siteId: s.id,
        entity: s.slug,
        severity: "critical",
        title: `${s.name}: site unreachable`,
        body: `DNS or connection failure on ${s.domain}: ${networkError}`,
        payload: { domain: s.domain, error: networkError },
      });
      continue;
    }

    if (status >= 500) {
      candidates.push({
        kind: "site_unreachable",
        siteId: s.id,
        entity: s.slug,
        severity: "error",
        title: `${s.name}: HTTP ${status} on homepage`,
        body: `Homepage returned ${status}. Check origin (PHP error / WAF / hosting).`,
        payload: { domain: s.domain, status },
      });
    } else if (status >= 400) {
      candidates.push({
        kind: "site_unreachable",
        siteId: s.id,
        entity: s.slug,
        severity: "warn",
        title: `${s.name}: HTTP ${status} on homepage`,
        body: `Homepage returned ${status}. Verify routing, DNS, plugin state.`,
        payload: { domain: s.domain, status },
      });
    }
  }

  return {
    candidates,
    durationMs: Date.now() - startedAt,
    observed: `${allSites.length} sites probed`,
  };
}
