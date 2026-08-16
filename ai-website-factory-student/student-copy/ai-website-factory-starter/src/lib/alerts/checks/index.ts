/**
 * Registry of all built-in alert checks. Imports are static so they all
 * tree-shake into the cron route bundle.
 */
import type { CheckDef } from "../check-engine";
import * as pluginDrift from "./plugin-drift";
import * as siteUnreachable from "./site-unreachable";
import * as workerDeath from "./worker-death";
import * as sitemapRegression from "./sitemap-regression";
import * as trafficDrop from "./traffic-drop";

export const ALL_CHECKS: CheckDef[] = [
  { kind: "plugin_drift", run: pluginDrift.run },
  { kind: "site_unreachable", run: siteUnreachable.run },
  { kind: "worker_death", run: workerDeath.run },
  { kind: "sitemap_regression", run: sitemapRegression.run },
  { kind: "traffic_drop", run: trafficDrop.run },
];

export function checksFor(only?: string[] | null): CheckDef[] {
  if (!only || only.length === 0) return ALL_CHECKS;
  const set = new Set(only);
  return ALL_CHECKS.filter((c) => set.has(c.kind));
}
