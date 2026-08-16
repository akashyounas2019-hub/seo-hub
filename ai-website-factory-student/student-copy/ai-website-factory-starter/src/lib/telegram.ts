/**
 * Telegram Bot API client + helpers.
 *
 * Telegram bots are free to operate — there is no SaaS subscription. The
 * bot creator gets a token from @BotFather (free, one-shot setup), we
 * store the token encrypted in `org_settings`, and the platform talks
 * directly to `https://api.telegram.org/bot<token>/<method>`.
 *
 * This module covers the outbound side (sending messages, registering
 * the webhook) plus a tiny inbound parser for the webhook route.
 *
 * We don't use the official Node SDK because:
 *   1. It adds 800 KB for two endpoints we use.
 *   2. The official SDK assumes long-polling — our setup uses webhooks,
 *      which is just plain HTTPS.
 *   3. CLAUDE.md's "no SaaS deps" rule is satisfied; Telegram Bot API is
 *      a public free API, not a vendor lock-in.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { decrypt } from "./crypto";

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super("Telegram bot is not configured. Set the token at /admin/settings.");
    this.name = "TelegramNotConfiguredError";
  }
}

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: number,
    public readonly description: string,
  ) {
    super(`Telegram ${method} failed (${code}): ${description}`);
    this.name = "TelegramApiError";
  }
}

let _cachedToken: { ciphertext: string; plaintext: string } | null = null;

async function getBotToken(): Promise<{ token: string; webhookSecret: string; botUsername: string | null }> {
  await ensureSchema();
  const [row] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  if (!row?.telegramBotTokenCiphertext) throw new TelegramNotConfiguredError();
  if (_cachedToken?.ciphertext !== row.telegramBotTokenCiphertext) {
    _cachedToken = {
      ciphertext: row.telegramBotTokenCiphertext,
      plaintext: decrypt(row.telegramBotTokenCiphertext),
    };
  }
  return {
    token: _cachedToken.plaintext,
    webhookSecret: row.telegramWebhookSecret ?? "",
    botUsername: row.telegramBotUsername ?? null,
  };
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const { token } = await getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) {
    throw new TelegramApiError(method, json.error_code ?? res.status, json.description ?? "(no description)");
  }
  return json.result as T;
}

/**
 * Send a Markdown message. Telegram's "MarkdownV2" requires escaping a
 * handful of special characters — we use the older `Markdown` flavour
 * because it's tolerant and good enough for the kind of digests we send.
 */
export async function sendMessage(chatId: string, text: string, opts: {
  silent?: boolean;
  disableWebPagePreview?: boolean;
} = {}): Promise<{ message_id: number }> {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: opts.disableWebPagePreview ?? true,
    disable_notification: opts.silent ?? false,
  });
}

/** Register the platform's webhook URL with Telegram. Idempotent. */
export async function setWebhook(publicBaseUrl: string): Promise<{ url: string; secret: string }> {
  const { webhookSecret } = await getBotToken();
  if (!webhookSecret) throw new Error("telegram_webhook_secret missing on org_settings");
  const url = `${publicBaseUrl.replace(/\/$/, "")}/api/integrations/telegram/webhook?s=${webhookSecret}`;
  await call("setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: false,
    // Use Telegram's secret-token header as additional auth on top of our
    // query-string secret.
    secret_token: webhookSecret,
  });
  return { url, secret: webhookSecret };
}

/** Look up the bot's own identity. Useful right after token setup to
 * cache the username so /start links can include @<botname>. */
export async function getMe(): Promise<{
  id: number;
  username: string;
  first_name: string;
}> {
  return call("getMe", {});
}

// ─────────────────────────────────────────────────────────────────────
// Inbound parsing — narrow types for what we actually consume from a
// Telegram webhook update.
// ─────────────────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
}

export function parseUpdate(raw: unknown): TelegramUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.update_id !== "number") return null;
  return u as unknown as TelegramUpdate;
}

/**
 * Parse a message body into a command + args. `/inbox` → cmd='inbox', args=[].
 * `/health yoursite` → cmd='health', args=['yoursite'].
 * Non-command text returns { cmd: null, text: '<original>' }.
 */
export function parseCommand(text: string): { cmd: string | null; args: string[]; text: string } {
  const t = text.trim();
  if (!t.startsWith("/")) return { cmd: null, args: [], text: t };
  // Strip the bot mention suffix some clients add: /inbox@MyBot → /inbox
  const [head, ...rest] = t.slice(1).split(/\s+/);
  const cmd = head.split("@")[0].toLowerCase();
  return { cmd: cmd || null, args: rest, text: t };
}
