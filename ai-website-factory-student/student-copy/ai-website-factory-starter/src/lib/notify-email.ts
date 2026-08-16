import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgSettings, userPrefs, users } from "@/db/schema";
import { sendMail, type SendResult } from "./email";

/**
 * Email side of the notification system. Reads `user_prefs` to determine if
 * the recipient has opted in for the given kind, then formats and sends.
 *
 * Always best-effort: returns a `SendResult` but never throws — broken email
 * delivery must not break the underlying business action (task assign, etc.).
 *
 * Defaults: when there's no `user_prefs` row for a user, every email type is
 * considered opted-in (matching the DDL defaults).
 */

export type EmailNotifyKind =
  | "task_assigned"
  | "task_comment"
  | "lead_assigned"
  | "daily_digest"
  | "ai_flag";

const KIND_TO_PREF_FIELD = {
  task_assigned: "emailOnTaskAssigned",
  task_comment: "emailOnTaskComment",
  lead_assigned: "emailOnLeadAssigned",
  daily_digest: "emailOnDailyDigest",
  ai_flag: "emailOnAiFlag",
} as const;

export type EmailPayload =
  | { kind: "task_assigned"; taskTitle: string; siteSlug?: string | null; link?: string }
  | { kind: "task_comment"; taskTitle: string; commentSnippet: string; authorName?: string; link?: string }
  | { kind: "lead_assigned"; leadName?: string | null; siteSlug?: string | null; link?: string }
  | { kind: "daily_digest"; markdown: string; date?: string }
  | { kind: "ai_flag"; subject: string; body: string; link?: string };

async function isOptedIn(userId: string, kind: EmailNotifyKind): Promise<boolean> {
  const [row] = await db()
    .select()
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .limit(1);
  if (!row) return true; // no prefs row → defaults are "true" per DDL
  const field = KIND_TO_PREF_FIELD[kind];
  return Boolean((row as Record<string, unknown>)[field] ?? true);
}

async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

async function getBaseUrl(): Promise<string> {
  const [row] = await db().select({ url: orgSettings.publicBaseUrl }).from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  return row?.url ?? process.env.PUBLIC_BASE_URL ?? "";
}

function render(payload: EmailPayload, baseUrl: string): { subject: string; text: string } {
  switch (payload.kind) {
    case "task_assigned": {
      const subject = `[GYL] Task assigned: ${payload.taskTitle.slice(0, 100)}`;
      const link = payload.link ? `${baseUrl}${payload.link}` : "";
      const text =
        `You've been assigned a new task: ${payload.taskTitle}\n` +
        (payload.siteSlug ? `Site: ${payload.siteSlug}\n` : "") +
        (link ? `\nOpen: ${link}\n` : "") +
        `\n— GYL Platform`;
      return { subject, text };
    }
    case "task_comment": {
      const subject = `[GYL] New comment on: ${payload.taskTitle.slice(0, 90)}`;
      const link = payload.link ? `${baseUrl}${payload.link}` : "";
      const text =
        `${payload.authorName ?? "Someone"} commented on "${payload.taskTitle}":\n\n` +
        `${payload.commentSnippet}\n` +
        (link ? `\nReply: ${link}\n` : "") +
        `\n— GYL Platform`;
      return { subject, text };
    }
    case "lead_assigned": {
      const subject = `[GYL] New lead assigned${payload.leadName ? `: ${payload.leadName}` : ""}`;
      const link = payload.link ? `${baseUrl}${payload.link}` : "";
      const text =
        `A new lead has been assigned to you.\n` +
        (payload.siteSlug ? `Site: ${payload.siteSlug}\n` : "") +
        (payload.leadName ? `Lead: ${payload.leadName}\n` : "") +
        (link ? `\nOpen: ${link}\n` : "") +
        `\n— GYL Platform`;
      return { subject, text };
    }
    case "daily_digest": {
      const date = payload.date ?? new Date().toISOString().slice(0, 10);
      const subject = `[GYL] Daily digest · ${date}`;
      return { subject, text: payload.markdown };
    }
    case "ai_flag": {
      const link = payload.link ? `${baseUrl}${payload.link}` : "";
      const text = `${payload.body}\n${link ? `\nDetails: ${link}\n` : ""}\n— GYL Platform`;
      return { subject: `[GYL] ${payload.subject}`, text };
    }
  }
}

/**
 * Send an email to `userId` IF their prefs allow this kind. No-op on missing
 * email, no opt-in, or unconfigured SMTP. Never throws.
 */
export async function emailIfOptedIn(
  userId: string,
  kind: EmailNotifyKind,
  payload: EmailPayload,
): Promise<SendResult> {
  try {
    if (!(await isOptedIn(userId, kind))) {
      return { ok: false, error: "user-opted-out" };
    }
    const email = await getUserEmail(userId);
    if (!email) return { ok: false, error: "user-has-no-email" };
    const baseUrl = await getBaseUrl();
    const { subject, text } = render(payload, baseUrl);
    return await sendMail({ to: email, subject, text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[notify-email] failed", { userId, kind, err: msg });
    return { ok: false, error: msg };
  }
}
