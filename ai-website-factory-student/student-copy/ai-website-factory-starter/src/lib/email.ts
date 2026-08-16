import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { decrypt } from "./crypto";

/**
 * SMTP / outbound email infrastructure.
 *
 * The transport is built from `org_settings` (admin pastes SMTP creds in the
 * settings page). We cache the transport keyed by a sha256 fingerprint of the
 * stored ciphertext so it's reused across requests but rebuilt automatically
 * when the password is rotated.
 *
 * No SaaS dependency: any SMTP server works (Sendgrid SMTP, AWS SES SMTP,
 * Mailgun SMTP, plain Postfix on the same VPS, etc.).
 */

type CachedTransport = {
  fingerprint: string;
  transport: Transporter;
  from: string;
};

let cached: CachedTransport | null = null;

function fingerprintFor(ciphertext: string, host: string, port: number, user: string): string {
  return createHash("sha256")
    .update(`${ciphertext}|${host}|${port}|${user}`)
    .digest("hex")
    .slice(0, 32);
}

export type SmtpTransport = {
  transport: Transporter;
  from: string;
};

/**
 * Read the SMTP config from `org_settings`. Returns null if disabled or any
 * required field is missing. Decrypts the password using the
 * "smtp_password" purpose key.
 */
export async function getSmtpTransport(): Promise<SmtpTransport | null> {
  const [row] = await db()
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, "singleton"))
    .limit(1);
  if (!row) return null;
  if (!row.smtpEnabled) return null;
  if (!row.smtpHost || !row.smtpPort || !row.smtpUser || !row.smtpPasswordCiphertext || !row.smtpFrom) {
    return null;
  }

  const fp = fingerprintFor(row.smtpPasswordCiphertext, row.smtpHost, row.smtpPort, row.smtpUser);
  if (cached && cached.fingerprint === fp) {
    return { transport: cached.transport, from: cached.from };
  }

  let password: string;
  try {
    password = decrypt(row.smtpPasswordCiphertext);
  } catch (err) {
    console.warn("[email] failed to decrypt SMTP password", err);
    return null;
  }

  const transport = nodemailer.createTransport({
    host: row.smtpHost,
    port: row.smtpPort,
    // 465 → implicit TLS; everything else → STARTTLS-or-plain.
    secure: row.smtpPort === 465,
    auth: { user: row.smtpUser, pass: password },
  });

  cached = { fingerprint: fp, transport, from: row.smtpFrom };
  return { transport, from: row.smtpFrom };
}

/** Reset the cached transport. Useful in tests / after rotation. */
export function resetSmtpCache(): void {
  cached = null;
}

export type SendResult = { ok: boolean; error?: string; messageId?: string };

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Send a plaintext (+ optional HTML) email. Always returns a result object —
 * never throws. If SMTP isn't configured the call is a no-op (returns
 * `{ ok: false, error: "smtp-not-configured" }`).
 *
 * Optional `attachments` are passed straight through to nodemailer — used by
 * the customer-facing emails (.ics calendar invite on reservation confirmed).
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}): Promise<SendResult> {
  const t = await getSmtpTransport();
  if (!t) {
    console.warn("[email] sendMail skipped — SMTP not configured");
    return { ok: false, error: "smtp-not-configured" };
  }
  try {
    const info = await t.transport.sendMail({
      from: t.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[email] sendMail failed", { to: opts.to, subject: opts.subject, err: msg });
    return { ok: false, error: msg };
  }
}
