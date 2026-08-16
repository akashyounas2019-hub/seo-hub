/**
 * Prune abandoned public chat sessions.
 *
 * What it deletes:
 *   - `public_chat_sessions` rows where `expires_at < now()`
 *   - AND that did NOT produce a quote or reservation (i.e. abandoned).
 *
 * Sessions that converted into a booking are kept indefinitely so we can
 * trace back from the quote/reservation to the chat history that produced
 * it. Abandoned sessions are pure cost — they're useful only as funnel
 * analytics, and we have a dedicated `voice_telemetry_events` table for
 * that now.
 *
 * Suggested cron: `0 4 * * *` (4 AM daily, off-peak).
 *
 * Also prunes `voice_telemetry_events` older than 180 days to keep the
 * analytics table from growing unbounded. Recent funnel data is what
 * matters; ancient mic-tap events are noise.
 */
import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { publicChatSessions, voiceTelemetryEvents } from "../db/schema";

async function main() {
  await ensureSchema();
  const d = db();

  const now = new Date();
  const telemetryCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // Delete expired abandoned chat sessions.
  const deletedSessions = await d
    .delete(publicChatSessions)
    .where(
      and(
        lt(publicChatSessions.expiresAt, now),
        isNull(publicChatSessions.derivedQuoteId),
        isNull(publicChatSessions.derivedReservationId),
      ),
    )
    .returning({ id: publicChatSessions.id });

  console.log(`✓ Pruned ${deletedSessions.length} abandoned chat session(s)`);

  // Delete ancient telemetry events.
  const deletedEvents = await d
    .delete(voiceTelemetryEvents)
    .where(lt(voiceTelemetryEvents.createdAt, telemetryCutoff))
    .returning({ id: voiceTelemetryEvents.id });

  console.log(`✓ Pruned ${deletedEvents.length} stale telemetry event(s) (older than 180 days)`);

  // Quiet unused imports (kept for documentation / future tightening).
  void isNotNull;
  void or;
  void sql;

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
