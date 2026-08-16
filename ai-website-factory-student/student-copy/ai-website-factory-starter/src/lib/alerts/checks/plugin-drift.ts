/**
 * plugin_drift — flags any GYL site whose deployed gyl-bookings version is
 * older than the operator's target. Catches the site-stuck-at-v0.9.1
 * silent failure pattern.
 *
 * Detection: grep `gyl-bookings/assets/...?ver=X.Y.Z` from homepage HTML.
 * LiteSpeed-cached sites may hide it — those emit a low-severity "version
 * unknown" alert separately, instead of false-positive drift.
 *
 * Target version comes from the GYL_TARGET_PLUGIN_VERSION env var. Bump
 * this every time the operator cuts a new release.
 *
 * Severity:
 *   - missing / probe failed → info (separate signal so the matrix doesn't lie)
 *   - 2+ minor versions behind → error
 *   - 1 minor version behind → warn
 */
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import type { CheckResult, AlertCandidate } from "../check-engine";
import { getRuleConfig } from "../check-engine";

const PLUGIN_SLUG = "gyl-bookings";

function loadTargetVersion(ruleVersion?: string): string {
  if (ruleVersion && /^\d+\.\d+\.\d+/.test(ruleVersion)) return ruleVersion;
  const env = process.env.GYL_TARGET_PLUGIN_VERSION;
  if (env && /^\d+\.\d+\.\d+/.test(env)) return env;
  return "0.25.0";
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

async function detectVersion(domain: string): Promise<string | null> {
  try {
    const html = await fetch(`https://${domain}/?probe=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.text());
    const m = html.match(/gyl-bookings[^"' ]*?\?ver=([\d.]+(?:[-+][\w.-]+)?)/);
    if (m) return m[1];
  } catch {
    // ignore — emit "unknown" candidate
  }
  return null;
}

export async function run(): Promise<CheckResult> {
  const startedAt = Date.now();
  const candidates: AlertCandidate[] = [];

  const allSites = await db().select({ id: sites.id, domain: sites.domain, name: sites.name, slug: sites.slug }).from(sites);

  let probed = 0;
  for (const s of allSites) {
    const { config } = await getRuleConfig("plugin_drift", s.id);
    const target = loadTargetVersion(config.targetVersion as string);
    const installed = await detectVersion(s.domain);
    probed++;
    if (!installed) {
      candidates.push({
        kind: "plugin_drift",
        siteId: s.id,
        entity: `${s.slug}:probe`,
        severity: "info",
        title: `${s.name}: plugin version unknown`,
        body: `Couldn't read ${PLUGIN_SLUG} version from ${s.domain} — may be cache-combined or not installed. Check via wp-admin or the gyl-deploy plan.mjs.`,
        payload: { domain: s.domain, target },
      });
      continue;
    }
    if (compareSemver(installed, target) >= 0) continue; // same-or-newer

    const installedParts = installed.split(".").map((n) => parseInt(n, 10) || 0);
    const targetParts = target.split(".").map((n) => parseInt(n, 10) || 0);
    const minorBehind = (targetParts[1] ?? 0) - (installedParts[1] ?? 0);

    const severity: AlertCandidate["severity"] = minorBehind >= 2 ? "error" : "warn";

    candidates.push({
      kind: "plugin_drift",
      siteId: s.id,
      entity: s.slug,
      severity,
      title: `${s.name}: ${PLUGIN_SLUG} ${installed} → ${target}`,
      body: `Installed plugin version is ${installed}; target is ${target}. Deploy via /gyl-deploy or the platform's self-update endpoint.`,
      payload: { domain: s.domain, installed, target, minorBehind },
    });
  }

  return {
    candidates,
    durationMs: Date.now() - startedAt,
    observed: `${probed} sites probed`,
  };
}
