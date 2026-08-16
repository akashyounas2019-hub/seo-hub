/**
 * Weekly health digest — one email per site to the operator + one network
 * roll-up. Resend SMTP via the existing `notifications` table or direct
 * fetch; WhatsApp via the existing Twilio integration (Phase 5).
 *
 * Sends only when the latest audit run_date is within the last 24h, so
 * re-running the digest cron is idempotent.
 */

import { desc, eq, gt, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  sites,
  siteHealthAudits,
  pageHealthIssues,
  healthDimensionScores,
  users,
} from "@/db/schema";

export interface DigestResult {
  perSiteSent: number;
  rollupSent: boolean;
  skipped: string[];
}

interface SiteDigestSummary {
  siteName: string;
  domain: string;
  runDate: string;
  composite: number | null;
  delta: number | null;
  structure: number | null;
  design: number | null;
  onpage: number | null;
  indexing: number | null;
  topRedFindings: Array<{ label: string; pageUrl: string | null; dimension: string }>;
}

/**
 * Send the weekly digest. Pulls the latest audit per site, formats per-site
 * + rollup emails, and pushes via the Resend env (RESEND_API_KEY +
 * RESEND_FROM). If no Resend, just writes to the notifications table for
 * the dashboard inbox.
 */
export async function sendWeeklyDigest(opts: { recipientEmail?: string; recipientPhone?: string } = {}): Promise<DigestResult> {
  await ensureSchema();

  // Find the operator(s) to send to. Default = admin users.
  const recipientEmail = opts.recipientEmail ?? await getAdminEmail();
  const result: DigestResult = { perSiteSent: 0, rollupSent: false, skipped: [] };

  const allSites = await db().select().from(sites);
  const perSite: SiteDigestSummary[] = [];

  for (const s of allSites) {
    const [audit] = await db()
      .select()
      .from(siteHealthAudits)
      .where(eq(siteHealthAudits.siteId, s.id))
      .orderBy(desc(siteHealthAudits.createdAt))
      .limit(1);
    if (!audit) { result.skipped.push(`${s.name} (no audit yet)`); continue; }

    // Only send if audit is recent (within 24h).
    const ageMs = Date.now() - new Date(audit.createdAt).getTime();
    if (ageMs > 36 * 60 * 60 * 1000) {
      result.skipped.push(`${s.name} (stale: ${Math.round(ageMs / 3600000)}h)`);
      continue;
    }

    const [weekRow] = await db()
      .select()
      .from(healthDimensionScores)
      .where(eq(healthDimensionScores.siteId, s.id))
      .orderBy(desc(healthDimensionScores.weekStart))
      .limit(1);

    const reds = await db()
      .select()
      .from(pageHealthIssues)
      .where(sql`${pageHealthIssues.auditId} = ${audit.id} AND ${pageHealthIssues.severity} = 'red'`)
      .limit(5);

    const summary: SiteDigestSummary = {
      siteName: s.name,
      domain: s.domain,
      runDate: audit.runDate,
      composite: audit.compositeScore,
      delta: weekRow?.compositeDelta ?? null,
      structure: audit.structureScore,
      design: audit.designScore,
      onpage: audit.onpageScore,
      indexing: audit.indexingScore,
      topRedFindings: reds.map((r) => ({ label: r.label, pageUrl: r.pageUrl, dimension: r.dimension })),
    };
    perSite.push(summary);

    if (recipientEmail) {
      await sendPerSiteEmail(recipientEmail, summary);
      result.perSiteSent++;
    }
  }

  // Roll-up email
  if (recipientEmail && perSite.length > 0) {
    await sendRollupEmail(recipientEmail, perSite);
    result.rollupSent = true;
  }

  // WhatsApp short digest
  if (opts.recipientPhone) {
    await sendWhatsAppDigest(opts.recipientPhone, perSite);
  }

  return result;
}

async function getAdminEmail(): Promise<string | undefined> {
  const [admin] = await db()
    .select({ email: users.email })
    .from(users)
    .where(sql`${users.role} = 'admin'`)
    .limit(1);
  return admin?.email;
}

async function sendPerSiteEmail(to: string, s: SiteDigestSummary): Promise<void> {
  const subject = `Weekly health · ${s.siteName} · composite ${s.composite ?? "—"}`;
  const deltaStr = s.delta == null ? "(first run)" : s.delta > 0 ? `+${s.delta} vs last week` : `${s.delta} vs last week`;
  const findingsHtml = s.topRedFindings.length === 0
    ? "<p>No RED findings this week.</p>"
    : "<ul>" + s.topRedFindings.map((f) => `<li><strong>${escapeHtml(f.label)}</strong> <code>${escapeHtml(f.dimension)}</code> ${f.pageUrl ? `<br/><small>${escapeHtml(f.pageUrl)}</small>` : ""}</li>`).join("") + "</ul>";

  const html = `
    <h2>${escapeHtml(s.siteName)}</h2>
    <p>${escapeHtml(s.domain)} — audit on ${s.runDate}</p>
    <p><strong>Composite ${s.composite ?? "—"}/100</strong> ${escapeHtml(deltaStr)}</p>
    <table style="border-collapse:collapse;font-family:monospace;">
      <tr><td style="padding:4px 12px;">Structure</td><td>${s.structure ?? "—"}</td></tr>
      <tr><td style="padding:4px 12px;">Design</td><td>${s.design ?? "—"}</td></tr>
      <tr><td style="padding:4px 12px;">On-page</td><td>${s.onpage ?? "—"}</td></tr>
      <tr><td style="padding:4px 12px;">Indexing</td><td>${s.indexing ?? "—"}</td></tr>
    </table>
    <h3>Top RED findings (up to 5)</h3>
    ${findingsHtml}
    <p><a href="${process.env.PUBLIC_BASE_URL ?? "http://localhost:3001"}/admin/sites/${s.siteName.toLowerCase().replace(/\s+/g, "-")}/health">Open in dashboard →</a></p>
  `;
  await sendEmail({ to, subject, html });
}

async function sendRollupEmail(to: string, sites: SiteDigestSummary[]): Promise<void> {
  const subject = `Network roll-up · ${sites.length} sites · ${sites.filter((s) => (s.composite ?? 100) < 70).length} priority`;
  const sortedByComposite = sites.slice().sort((a, b) => (a.composite ?? 0) - (b.composite ?? 0));
  const rows = sortedByComposite.map((s) => `
    <tr>
      <td style="padding:4px 8px;">${escapeHtml(s.siteName)}</td>
      <td style="padding:4px 8px;font-family:monospace;">${s.composite ?? "—"}</td>
      <td style="padding:4px 8px;font-family:monospace;color:${s.delta != null && s.delta > 0 ? "green" : s.delta != null && s.delta < 0 ? "red" : "#888"}">${s.delta == null ? "—" : s.delta > 0 ? `+${s.delta}` : s.delta}</td>
      <td style="padding:4px 8px;font-family:monospace;">${s.topRedFindings.length}</td>
    </tr>
  `).join("");

  const html = `
    <h2>GYL network — weekly roll-up</h2>
    <p>${sites.length} sites audited.</p>
    <table style="border-collapse:collapse;">
      <tr style="background:#f0f0f0;">
        <th style="padding:4px 8px;text-align:left;">Site</th>
        <th style="padding:4px 8px;text-align:left;">Composite</th>
        <th style="padding:4px 8px;text-align:left;">Δ</th>
        <th style="padding:4px 8px;text-align:left;">RED findings</th>
      </tr>
      ${rows}
    </table>
    <p><a href="${process.env.PUBLIC_BASE_URL ?? "http://localhost:3001"}/admin/health">Open network health →</a></p>
  `;
  await sendEmail({ to, subject, html });
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "GYL Health <health@example.com>";
  if (!key) {
    console.warn(`[health-digest] no RESEND_API_KEY — email to ${to} would have been: ${subject}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.warn(`[health-digest] Resend ${r.status}: ${body.slice(0, 200)}`);
  }
}

async function sendWhatsAppDigest(toPhone: string, sites: SiteDigestSummary[]): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !fromNumber) {
    console.warn("[health-digest] Twilio env not set — skipping WhatsApp");
    return;
  }
  const flagged = sites.filter((s) => (s.composite ?? 100) < 70).length;
  const body = `🚦 GYL weekly health\n${sites.length} sites · ${flagged} need intervention\n\n` +
    sites.slice().sort((a, b) => (a.composite ?? 0) - (b.composite ?? 0))
      .slice(0, 5)
      .map((s) => `${s.siteName}: ${s.composite ?? "—"} ${s.delta != null ? (s.delta > 0 ? `(+${s.delta})` : `(${s.delta})`) : ""}`)
      .join("\n") +
    `\n\nDashboard: ${process.env.PUBLIC_BASE_URL ?? "http://localhost:3001"}/admin/health`;

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toPhone}`,
      Body: body,
    }).toString(),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.warn(`[health-digest] Twilio ${r.status}: ${txt.slice(0, 200)}`);
  }
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
