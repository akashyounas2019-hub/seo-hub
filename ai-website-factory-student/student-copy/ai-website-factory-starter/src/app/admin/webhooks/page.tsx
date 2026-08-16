import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { webhookSubscribers } from "@/db/schema";
import { createWebhookAction, deleteWebhookAction, toggleWebhookAction } from "@/app/actions/webhooks";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { SettingsTabs } from "@/components/ui/SettingsTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WebhooksPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  await ensureSchema();
  await requireAdmin();
  const rows = await db().select().from(webhookSubscribers).orderBy(desc(webhookSubscribers.createdAt));

  return (
    <div className="space-y-6">
      <SettingsTabs active="webhooks" />
      <header className="brand-rule">
        <h1 className="text-2xl font-medium tracking-tightish text-text">Outbound webhooks</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Push platform events to Slack, Zapier, n8n, or any HTTPS endpoint. Each subscriber gets the same signed envelope the WP plugin sends inbound — receivers verify with the standard <code className="font-mono text-xs">x-gyl-signature</code> header.
        </p>
      </header>

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {{ created: "Webhook added.", toggled: "Webhook updated.", deleted: "Webhook deleted." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {searchParams.error}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-medium text-text">Add subscriber</h2>
        <p className="mt-1 text-xs text-text-muted">
          Paste a Slack incoming-webhook URL or a Zapier catch-hook URL. Leave the events field empty to receive everything.
        </p>
        <form action={createWebhookAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Label</span>
            <input name="label" required placeholder="Slack #ops" className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">URL</span>
            <input name="url" required type="url" placeholder="https://hooks.slack.com/..." className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Events <span className="lowercase tracking-normal text-text-faint">(optional, comma-separated; leave blank for all)</span></span>
            <input name="events" placeholder="lead.captured, reservation.created, seo.ranking_drop" className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Secret <span className="lowercase tracking-normal text-text-faint">(optional — enables HMAC signing)</span></span>
            <input name="secret" type="password" autoComplete="off" placeholder="random shared secret string" className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover focus-visible:shadow-glow">
              + Add subscriber
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Configured</h2>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-xs text-text-faint">
            No webhooks configured yet. Add one above.
          </div>
        ) : (
          <RowList footer={`${rows.length} subscriber${rows.length === 1 ? "" : "s"}`}>
            {rows.map((s) => (
              <Row key={s.id} className="!items-start py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{s.label}</span>
                    {s.active ? (
                      <Pill tone="success">active</Pill>
                    ) : (
                      <Pill tone="neutral">paused</Pill>
                    )}
                    {s.secret ? <Pill tone="accent">signed</Pill> : null}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-text-faint">{s.url}</div>
                  {s.events ? (
                    <div className="mt-0.5 text-xs text-text-muted">Events: <span className="font-mono text-text-faint">{s.events}</span></div>
                  ) : (
                    <div className="mt-0.5 text-xs text-text-muted">Receives every event.</div>
                  )}
                  {s.lastDeliveredAt ? (
                    <div className="mt-1 text-xs text-text-faint">
                      Last delivery {formatRelative(s.lastDeliveredAt)} ·
                      {s.lastStatus ? ` HTTP ${s.lastStatus}` : ""}
                      {s.lastError ? ` · ${s.lastError}` : ""}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-text-faint">Never delivered yet.</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={toggleWebhookAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text">
                      {s.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteWebhookAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs text-danger hover:bg-danger-tint">
                      Delete
                    </button>
                  </form>
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </section>

      <section className="rounded-lg border border-accent/20 bg-accent/[0.04] p-4 text-xs text-text-muted">
        <p className="font-medium text-text">Event kinds</p>
        <p className="mt-1">Available: <code className="font-mono text-xs">lead.captured</code>, <code className="font-mono text-xs">quote.requested</code>, <code className="font-mono text-xs">reservation.created</code>, <code className="font-mono text-xs">reservation.confirmed</code>, <code className="font-mono text-xs">seo.fix_applied</code>, <code className="font-mono text-xs">seo.proposal_pending</code>, <code className="font-mono text-xs">seo.ranking_drop</code>, <code className="font-mono text-xs">payment.received</code>.</p>
        <p className="mt-2">
          <Link href="/admin/settings" className="text-accent hover:underline">Open Settings</Link> for the Anthropic key, Telegram bot, and SMTP — all the inbound side. Webhooks here are the OUTBOUND side.
        </p>
      </section>
    </div>
  );
}
