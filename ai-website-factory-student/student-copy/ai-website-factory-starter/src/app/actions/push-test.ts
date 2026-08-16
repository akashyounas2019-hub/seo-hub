"use server";

import { eq, isNotNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { userPrefs, users } from "@/db/schema";
import * as telegram from "@/lib/telegram";
import { requireAdmin } from "@/lib/server-auth";

/**
 * Smoke-test the push pipeline. Sends a Telegram message to the caller
 * directly (or to all opted-in admins if the caller has no chat_id).
 * Bypasses the worker queue + push_sent dedup so it's safe to run any time.
 */
export async function sendTestPush(): Promise<{
  ok: boolean;
  sent: number;
  error?: string;
  reason?: string;
}> {
  await ensureSchema();
  const me = await requireAdmin();

  // Prefer sending only to the caller. Fall back to all admins if caller
  // hasn't linked their chat id yet.
  const [myPrefs] = await db().select().from(userPrefs).where(eq(userPrefs.userId, me.id)).limit(1);
  let targets: { chatId: string }[] = [];
  if (myPrefs?.telegramChatId) {
    targets = [{ chatId: myPrefs.telegramChatId }];
  } else {
    const rows = await db()
      .select({ chatId: userPrefs.telegramChatId, role: users.role, optIn: userPrefs.telegramOptIn })
      .from(userPrefs)
      .leftJoin(users, eq(users.id, userPrefs.userId))
      .where(isNotNull(userPrefs.telegramChatId));
    targets = rows
      .filter((r) => r.optIn && r.role === "admin" && r.chatId)
      .map((r) => ({ chatId: r.chatId! }));
  }

  if (targets.length === 0) {
    return {
      ok: false,
      sent: 0,
      reason: "no-linked-chat-id",
      error: "No admin has linked a Telegram chat id yet. Send /start to your bot first.",
    };
  }

  const text = [
    "*Test push from GYL Platform*",
    "If you can read this, the Inbox push pipeline is wired correctly.",
    "Triggers will fire as: stuck builds, stale leads, high-priority fixes, composite drops.",
  ].join("\n");

  let sent = 0;
  let firstError: string | undefined;
  for (const t of targets) {
    try {
      await telegram.sendMessage(t.chatId, text, { disableWebPagePreview: true });
      sent++;
    } catch (err) {
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }
  if (sent === 0) {
    return { ok: false, sent: 0, error: firstError ?? "telegram-send-failed" };
  }
  return { ok: true, sent };
}
