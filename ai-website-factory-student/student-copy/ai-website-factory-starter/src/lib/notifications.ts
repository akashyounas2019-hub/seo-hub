/**
 * Notification orchestrator — single entry point the SEO agent (and any
 * other surface) calls to push something to a user. Respects per-user
 * preference toggles and routes to whichever channel(s) the user opted
 * into (Telegram + email currently; in-app `notifications` row is
 * always written for the bell dropdown).
 *
 * Channels:
 *   - Telegram (if `telegram_chat_id` set and `telegram_opt_in` true)
 *   - Email (if SMTP configured + recipient has `email_*` flag for kind)
 *   - In-app (always — drops a row in `notifications`)
 *
 * Failure semantics: failing one channel doesn't block the others. Each
 * channel logs its own error to stderr; the function returns a summary
 * of what landed.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { notifications, userPrefs, type User } from "@/db/schema";
import { sendMessage, TelegramApiError, TelegramNotConfiguredError } from "./telegram";

export type NotificationKind =
  | "seo_fix_applied"
  | "seo_proposal_pending"
  | "seo_weekly_digest"
  | "seo_ranking_drop"
  | "seo_ranking_gain"
  | "seo_scan_failed"
  | "section_watch_missing"
  | "alert_rule_triggered";

export interface NotifyInput {
  user: User;
  kind: NotificationKind;
  /** Short one-line subject for in-app + email subject + Telegram first line. */
  title: string;
  /** Markdown body, used for Telegram + email. Plain text falls back fine. */
  body: string;
  /** Optional deep-link back into the platform UI. */
  href?: string;
}

export interface NotifyResult {
  telegram: { sent: boolean; reason?: string };
  email: { sent: boolean; reason?: string };
  inApp: { sent: boolean; reason?: string };
}

/** Look up which channels a user has opted into for this kind. */
async function userChannelsFor(userId: string, kind: NotificationKind) {
  await ensureSchema();
  const [prefs] = await db().select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  // Defaults match the schema defaults — if a user has no row yet they
  // still get sensible behavior.
  const telegramOpt = prefs?.telegramOptIn ?? true;
  const telegramChatId = prefs?.telegramChatId ?? null;
  const wantsTelegram = !!telegramChatId && telegramOpt && respectsKind(prefs, kind);
  const wantsEmail = respectsKind(prefs, kind);
  return { wantsTelegram, telegramChatId, wantsEmail };
}

function respectsKind(prefs: typeof userPrefs.$inferSelect | undefined, kind: NotificationKind): boolean {
  if (!prefs) return defaultOptIn(kind);
  switch (kind) {
    case "seo_fix_applied":
      return prefs.notifySeoFixApplied;
    case "seo_weekly_digest":
      return prefs.notifyWeeklyDigest;
    case "seo_ranking_drop":
    case "seo_ranking_gain":
      return prefs.notifyRankingDrop;
    case "seo_proposal_pending":
      return prefs.emailOnAiFlag;
    case "seo_scan_failed":
      return prefs.emailOnAiFlag;
    case "section_watch_missing":
      return prefs.emailOnAiFlag;
    case "alert_rule_triggered":
      // Gated by the rule's own notify_email/notify_in_app flags, not user prefs.
      return true;
  }
}

function defaultOptIn(kind: NotificationKind): boolean {
  // Conservative defaults when the user has no prefs row yet — only
  // surface the high-signal stuff.
  return kind === "seo_weekly_digest" || kind === "seo_ranking_drop" || kind === "seo_scan_failed" || kind === "alert_rule_triggered";
}

/** Send to all enabled channels. Returns per-channel status. */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const channels = await userChannelsFor(input.user.id, input.kind);
  const result: NotifyResult = {
    telegram: { sent: false, reason: "skipped" },
    email: { sent: false, reason: "skipped" },
    inApp: { sent: false, reason: "skipped" },
  };

  // In-app: always (cheap, gives the bell dropdown something to show).
  try {
    await db().insert(notifications).values({
      recipientId: input.user.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.href ?? null,
    });
    result.inApp.sent = true;
    delete result.inApp.reason;
  } catch (err) {
    result.inApp.reason = `db-error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Telegram.
  if (channels.wantsTelegram && channels.telegramChatId) {
    try {
      const text = formatTelegramMessage(input);
      await sendMessage(channels.telegramChatId, text, { silent: input.kind === "seo_fix_applied" });
      result.telegram.sent = true;
      delete result.telegram.reason;
    } catch (err) {
      result.telegram.reason =
        err instanceof TelegramNotConfiguredError
          ? "telegram-not-configured"
          : err instanceof TelegramApiError
            ? `telegram-${err.code}`
            : `telegram-error: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[notify] telegram failed", err);
    }
  } else {
    result.telegram.reason = channels.telegramChatId ? "opted-out" : "no-chat-id";
  }

  // Email — relies on the existing nodemailer wiring + smtp config.
  if (channels.wantsEmail && input.user.email) {
    try {
      const { sendMail } = await import("./email");
      const res = await sendMail({
        to: input.user.email,
        subject: `[GYL] ${input.title}`,
        text: input.body + (input.href ? `\n\n${input.href}` : ""),
      });
      if (!res.ok) throw new Error(res.error ?? "send-failed");
      result.email.sent = true;
      delete result.email.reason;
    } catch (err) {
      result.email.reason = `email-error: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[notify] email failed", err);
    }
  } else {
    result.email.reason = channels.wantsEmail ? "no-email" : "opted-out";
  }

  return result;
}

function formatTelegramMessage(input: NotifyInput): string {
  const lines = [`*${input.title}*`, "", input.body];
  if (input.href) lines.push("", `[Open in dashboard](${input.href})`);
  return lines.join("\n");
}

/**
 * Lower-level helper for one-off broadcasts that don't fit the per-user
 * notify() shape (e.g. weekly digest where the body is computed once
 * for the admin but sent to multiple recipients).
 */
export async function notifyMany(users: User[], kind: NotificationKind, build: (u: User) => NotifyInput): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];
  for (const u of users) {
    out.push(await notify(build(u)));
  }
  return out;
}
