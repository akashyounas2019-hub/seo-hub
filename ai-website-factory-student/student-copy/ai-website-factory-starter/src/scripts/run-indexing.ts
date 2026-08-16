/**
 * Daily indexing sweep (cron).
 * sitemap → GSC URL Inspection (or HTTP probe) → indexing_status →
 * IndexNow submit not-indexed → index_low alert. Calls the same lib the
 * /api/cron/run-indexing route uses, but runs in-container with direct DB
 * access (no HTTP, no bearer secret).
 *
 * Optional arg: a single site slug to limit the sweep (e.g. `... run-indexing.ts taxi`).
 */
import { ensureSchema } from "../db/client";
import { syncAllSitesIndexing } from "../lib/indexing/sync";

async function main() {
  await ensureSchema();
  const onlySlug = process.argv[2]?.trim() || undefined;
  const results = await syncAllSitesIndexing(onlySlug);
  for (const r of results) {
    console.log(
      `[indexing] ${r.slug}: ${r.indexed}/${r.sitemapUrls} indexed` +
        `, ${r.notIndexed} not-indexed, ${r.submitted} submitted to IndexNow` +
        (r.error ? ` — ERROR: ${r.error}` : ""),
    );
  }
  console.log(`[indexing] done — ${results.length} site(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[indexing] fatal:", e);
    process.exit(1);
  });
