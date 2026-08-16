/**
 * CLI: import a network-health audit run into the platform DB.
 *
 * Usage:
 *   npm run health:import                  # latest run on disk
 *   npm run health:import -- --date=2026-06-11
 */

import { ensureSchema } from "../db/client";
import { importNetworkHealthRun } from "../lib/health-audit-import";

async function main() {
  await ensureSchema();
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const result = await importNetworkHealthRun({ runDate: dateArg });
  if (!result.ok) {
    console.error(`[health-import] FAIL: ${result.error}`);
    process.exit(1);
  }
  console.log(`[health-import] OK run=${result.runDate} sites=${result.sitesImported} issues=${result.issuesImported}`);
}

main().catch((err) => {
  console.error("[health-import] fatal:", err);
  process.exit(1);
});
