/**
 * Weekly health-digest cron — sends per-site + rollup emails (Resend) and
 * an optional WhatsApp short digest (Twilio) summarizing the audit run.
 *
 * Suggested cron entry (runs ~6h after the sweep so audits have landed):
 *   0 12 * * MON  cd /app && npm run health:digest >> /var/log/gyl/health-digest.log 2>&1
 */
import { ensureSchema } from "../db/client";
import { sendWeeklyDigest } from "../lib/health-digest";

async function main() {
  await ensureSchema();
  const recipientEmail = process.env.HEALTH_DIGEST_EMAIL || undefined;
  const recipientPhone = process.env.HEALTH_DIGEST_WHATSAPP || undefined;
  const result = await sendWeeklyDigest({ recipientEmail, recipientPhone });
  console.log(`[health-digest] perSite=${result.perSiteSent} rollup=${result.rollupSent ? "yes" : "no"} skipped=${result.skipped.length}`);
  if (result.skipped.length > 0) console.log("[health-digest] skipped:", result.skipped.join(" · "));
}

main().catch((err) => {
  console.error("[health-digest] fatal:", err);
  process.exit(1);
});
