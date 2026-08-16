/**
 * Outbound webhook delivery — fires registered subscribers when a
 * tracked event happens. Fire-and-forget; failures get logged on the
 * subscriber row but never block the caller.
 *
 * Signature scheme matches the inbound HMAC: hex(hmac_sha256(secret,
 * timestamp + "." + body)). Receivers verify with the same logic the WP
 * plugin uses (see wp-plugin/.../class-hmac.php).
 *
 * Slack incoming-webhooks use a different envelope — when the URL host
 * is hooks.slack.com we automatically wrap the payload in Slack's
 * `{ text: "..." }` shape.
 */
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./../db/client";
import { webhookSubscribers } from "./../db/schema";

export type WebhookEvent =
  | "lead.captured"
  | "quote.requested"
  | "reservation.created"
  | "reservation.confirmed"
  | "seo.fix_applied"
  | "seo.proposal_pending"
  | "seo.ranking_drop"
  | "payment.received";

export interface DeliverInput {
  event: WebhookEvent;
  /** JSON-serializable payload. */
  payload: Record<string, unknown>;
  /** Plain-English summary — used for Slack envelope text. */
  summary: string;
}

const SLACK_HOSTS = ["hooks.slack.com"];

export async function deliverWebhook(input: DeliverInput): Promise<void> {
  let subs;
  try {
    subs = await db()
      .select()
      .from(webhookSubscribers)
      .where(eq(webhookSubscribers.active, true));
  } catch (err) {
    console.error("[webhook] could not load subscribers", err);
    return;
  }

  const interested = subs.filter((s) => {
    if (!s.events || s.events.trim() === "") return true;
    const list = s.events.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
    return list.includes(input.event);
  });
  if (interested.length === 0) return;

  await Promise.all(interested.map((s) => deliver(s, input)));
}

async function deliver(
  sub: typeof webhookSubscribers.$inferSelect,
  input: DeliverInput,
): Promise<void> {
  const isSlack = SLACK_HOSTS.some((h) => sub.url.includes(h));
  const standardEnvelope = {
    event: input.event,
    summary: input.summary,
    payload: input.payload,
    delivered_at: new Date().toISOString(),
    deliverer: "gyl-platform",
  };
  const body = isSlack
    ? JSON.stringify({ text: `*${input.event}* — ${input.summary}`, attachments: [{ text: JSON.stringify(input.payload).slice(0, 1800) }] })
    : JSON.stringify(standardEnvelope);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-gyl-event": input.event,
    "user-agent": "gyl-platform-webhook/1.0",
  };
  if (sub.secret) {
    const ts = String(Math.floor(Date.now() / 1000));
    headers["x-gyl-timestamp"] = ts;
    headers["x-gyl-signature"] = createHmac("sha256", sub.secret).update(`${ts}.${body}`).digest("hex");
  }

  let status = 0;
  let errorMsg: string | null = null;
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(8_000),
    });
    status = res.status;
    if (!res.ok) errorMsg = `HTTP ${res.status}`;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // Update subscriber's delivery state. Errors swallowed — never block
  // the caller on bookkeeping.
  try {
    await db()
      .update(webhookSubscribers)
      .set({
        lastDeliveredAt: new Date(),
        lastStatus: status,
        lastError: errorMsg,
        updatedAt: new Date(),
      })
      .where(and(eq(webhookSubscribers.id, sub.id)));
  } catch {
    // best-effort
  }
  if (errorMsg) {
    console.warn(`[webhook] delivery to ${sub.label} (${sub.url}) failed: ${errorMsg}`);
  }
}
