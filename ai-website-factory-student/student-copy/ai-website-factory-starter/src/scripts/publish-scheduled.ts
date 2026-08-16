/**
 * Cron worker — runs every minute. Picks up any `publish_schedule` row
 * whose `scheduled_at` has passed, re-runs the (cheap) gauntlet, and if
 * verdict !== "block" pushes the page to WordPress.
 *
 * Idempotent: `claimRow` uses a status-transition update so two workers
 * hitting the same row never double-publish.
 *
 * Schedule: `* * * * *` (every minute) in deploy/crontab.
 */

import { ensureSchema } from "../db/client";
import { runPublishGauntlet } from "../lib/publish-gauntlet";
import {
  claimRow,
  fetchDueRows,
  markFailed,
  markPublished,
  publishSinglePage,
} from "../lib/publish-scheduler";

async function main() {
  await ensureSchema();
  const due = await fetchDueRows(new Date());
  if (due.length === 0) {
    // Quiet success — cron logs would explode otherwise
    return;
  }
  console.log(`[publish-scheduled] ${due.length} row(s) due`);

  for (const row of due) {
    if (!(await claimRow(row.id))) {
      console.log(`[publish-scheduled] ${row.pageId} — already claimed, skipping`);
      continue;
    }

    try {
      // Re-run the cheap deterministic checks at publish time. Skip the
      // expensive external ones — the operator already saw those when
      // they scheduled.
      const gauntlet = await runPublishGauntlet(row.pageId, { skipExternal: true });
      if (gauntlet.verdict === "block") {
        console.warn(`[publish-scheduled] ${row.pageId} blocked at publish-time:`, gauntlet.top_fixes);
        await markFailed(
          row.id,
          `Gauntlet blocked at publish time: ${gauntlet.top_fixes.join(" | ")}`,
        );
        continue;
      }

      const resp = await publishSinglePage(row.pageId);
      if (resp.ok && resp.wpPostId) {
        await markPublished(row.id, resp.wpPostId);
        console.log(`[publish-scheduled] ${row.pageId} → wp_post_id ${resp.wpPostId}`);
      } else {
        await markFailed(row.id, resp.error ?? "publishSinglePage returned ok:false");
        console.warn(`[publish-scheduled] ${row.pageId} failed:`, resp.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(row.id, msg);
      console.warn(`[publish-scheduled] ${row.pageId} crashed:`, msg);
    }
  }
}

main().catch((err) => {
  console.error("[publish-scheduled] crashed at top level:", err);
  process.exit(1);
});
