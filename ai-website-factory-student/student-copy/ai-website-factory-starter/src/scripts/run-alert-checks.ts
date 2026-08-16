/**
 * Alert-check sweep (cron, every 15 min).
 * Runs every registered check (plugin drift, site unreachable, worker death,
 * sitemap regression, traffic drop) through the dedup/upsert/auto-resolve
 * engine. In-container, direct DB — no HTTP, no bearer secret.
 */
import { ensureSchema } from "../db/client";
import { runChecks } from "../lib/alerts/check-engine";
import { ALL_CHECKS } from "../lib/alerts/checks";

async function main() {
  await ensureSchema();
  const out = await runChecks(ALL_CHECKS);
  console.log(
    `[alert-checks] ran ${out.kinds.length} check(s) in ${out.durationMs}ms` +
      (out.hadError ? " (with errors)" : ""),
  );
  for (const c of out.perCheck) {
    console.log(`[alert-checks]   ${JSON.stringify(c)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[alert-checks] fatal:", e);
    process.exit(1);
  });
