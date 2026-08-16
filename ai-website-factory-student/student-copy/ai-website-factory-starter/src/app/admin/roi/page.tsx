import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";

export const dynamic = "force-dynamic";

const METRIC_CARDS = [
  { label: "Total Leads", value: 143, icon: "leads" },
  { label: "Form Submissions", value: 34, icon: "forms" },
  { label: "WhatsApp Clicks", value: 67, icon: "whatsapp" },
  { label: "Phone Calls", value: 42, icon: "calls" },
];

const LEAD_SOURCES = [
  { source: "Forms", count: 34, color: "var(--info)" },
  { source: "WhatsApp", count: 67, color: "var(--success)" },
  { source: "Calls", count: 42, color: "var(--accent)" },
  { source: "GMB Calls", count: 28, color: "var(--warning)" },
  { source: "GMB Messages", count: 12, color: "#a78bfa" },
];

const maxCount = Math.max(...LEAD_SOURCES.map((s) => s.count));

export default async function RoiPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="ROI & Leads"
        subtitle="Track leads by source — forms, WhatsApp clicks, calls — with GA4 event integration and estimated job conversion."
      />

      <AuditReportingScoutTabs />

      {/* ── Top Metric Cards ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRIC_CARDS.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-text-faint">
              <span className="text-xs uppercase tracking-wider">{card.label}</span>
            </div>
            <div className="mt-2 text-2xl font-medium tabular-nums text-text">
              {card.value}
            </div>
          </div>
        ))}
      </section>

      {/* ── Lead Source Breakdown ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="mb-4 text-sm font-medium text-text">Lead Source Breakdown</h2>
        <div className="space-y-3">
          {LEAD_SOURCES.map((source) => (
            <div key={source.source} className="flex items-center gap-3">
              <span className="w-28 text-sm text-text-muted">{source.source}</span>
              <div className="flex-1">
                <div
                  className="h-6 rounded"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="flex h-full items-center rounded px-2"
                    style={{
                      width: `${(source.count / maxCount) * 100}%`,
                      background: source.color,
                      minWidth: "2rem",
                    }}
                  >
                    <span className="text-xs font-medium text-white">{source.count}</span>
                  </div>
                </div>
              </div>
              <span className="w-10 text-right font-mono text-xs text-text-faint">
                {Math.round((source.count / 143) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Estimated Jobs ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="mb-4 text-sm font-medium text-text">Estimated Job Conversion</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs uppercase tracking-wider text-text-faint">Total Leads</div>
            <div className="mt-1 text-xl font-medium tabular-nums text-text">143</div>
          </div>
          <div className="rounded-lg border border-border p-4" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs uppercase tracking-wider text-text-faint">Conversion Rate</div>
            <div className="mt-1 text-xl font-medium tabular-nums" style={{ color: "var(--success)" }}>35%</div>
          </div>
          <div className="rounded-lg border border-border p-4" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs uppercase tracking-wider text-text-faint">Est. Jobs This Month</div>
            <div className="mt-1 text-xl font-medium tabular-nums text-text">50</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-text-faint">
            <span>Conversion funnel</span>
            <span>143 leads &rarr; 50 jobs</span>
          </div>
          <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: "35%", background: "var(--success)" }}
            />
          </div>
        </div>
      </section>

      {/* ── GA4 Setup Guide ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="mb-3 text-sm font-medium text-text">GA4 Event Tracking Setup</h2>
        <div className="rounded-lg border border-border p-4" style={{ background: "var(--surface-2)" }}>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                1
              </span>
              <div>
                <p className="text-sm font-medium text-text">Install GA4 tracking code</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Add the Google tag (gtag.js) to your WordPress theme header or use a plugin like Site Kit.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                2
              </span>
              <div>
                <p className="text-sm font-medium text-text">Configure custom events</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Set up events for form_submit, whatsapp_click, and phone_call actions in GTM or inline.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                3
              </span>
              <div>
                <p className="text-sm font-medium text-text">Connect GA4 property</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Link your GA4 property ID in Settings &rarr; Integrations to enable automatic data sync.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                4
              </span>
              <div>
                <p className="text-sm font-medium text-text">Verify event flow</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Check the GA4 DebugView to confirm events are arriving with correct parameters.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
