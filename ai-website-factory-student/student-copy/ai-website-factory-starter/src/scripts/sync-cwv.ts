/**
 * Core Web Vitals sync (cron, daily).
 * Pulls CrUX History (PHONE + DESKTOP) for every site into cwv_snapshots.
 * Needs a CrUX API key — either GOOGLE_CRUX_API_KEY in the environment, or
 * configured at /admin/settings (org_settings.google_crux_api_key_ciphertext).
 * Sites with no CrUX data are skipped quietly.
 */
import { ensureSchema } from "../db/client";
import { syncAllCwv } from "../lib/cwv-sync";

async function main() {
  await ensureSchema();
  const rows = await syncAllCwv();
  for (const r of rows) {
    console.log(
      `[sync-cwv] ${r.slug}: ${r.pulled} snapshot(s)` +
        (r.skipped ? " (no CrUX data)" : "") +
        (r.error ? ` — ERROR: ${r.error}` : ""),
    );
  }
  console.log(`[sync-cwv] done — ${rows.length} site(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[sync-cwv] fatal:", e);
    process.exit(1);
  });
