import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { GmbScoutTabs } from "@/components/ui/GmbScoutTabs";

export const dynamic = "force-dynamic";

type CitationStatus = "Live" | "Missing" | "Incomplete";

interface Citation {
  directory: string;
  da: number;
  region: "UAE" | "Global";
  you: CitationStatus;
  competitor1: CitationStatus;
  competitor2: CitationStatus;
}

const CITATIONS: Citation[] = [
  // UAE directories
  { directory: "Google Maps", da: 99, region: "UAE", you: "Live", competitor1: "Live", competitor2: "Live" },
  { directory: "Bayut", da: 72, region: "UAE", you: "Missing", competitor1: "Live", competitor2: "Missing" },
  { directory: "Property Finder", da: 68, region: "UAE", you: "Missing", competitor1: "Live", competitor2: "Live" },
  { directory: "Yellow Pages UAE", da: 55, region: "UAE", you: "Live", competitor1: "Live", competitor2: "Live" },
  { directory: "Dubizzle", da: 65, region: "UAE", you: "Incomplete", competitor1: "Live", competitor2: "Missing" },
  { directory: "ServiceMarket", da: 52, region: "UAE", you: "Missing", competitor1: "Missing", competitor2: "Missing" },
  { directory: "Justdial UAE", da: 48, region: "UAE", you: "Live", competitor1: "Missing", competitor2: "Live" },
  { directory: "Connect.ae", da: 42, region: "UAE", you: "Live", competitor1: "Live", competitor2: "Missing" },
  { directory: "UAE Business Directory", da: 38, region: "UAE", you: "Missing", competitor1: "Missing", competitor2: "Missing" },
  // Global directories
  { directory: "Apple Maps", da: 97, region: "Global", you: "Live", competitor1: "Live", competitor2: "Live" },
  { directory: "Facebook", da: 96, region: "Global", you: "Live", competitor1: "Live", competitor2: "Live" },
  { directory: "Yelp", da: 94, region: "Global", you: "Missing", competitor1: "Live", competitor2: "Live" },
  { directory: "Bing Places", da: 93, region: "Global", you: "Live", competitor1: "Live", competitor2: "Live" },
  { directory: "Foursquare", da: 89, region: "Global", you: "Incomplete", competitor1: "Live", competitor2: "Missing" },
  { directory: "TripAdvisor", da: 93, region: "Global", you: "Missing", competitor1: "Live", competitor2: "Live" },
  { directory: "Trustpilot", da: 93, region: "Global", you: "Live", competitor1: "Live", competitor2: "Incomplete" },
  { directory: "Hotfrog", da: 52, region: "Global", you: "Missing", competitor1: "Missing", competitor2: "Missing" },
  { directory: "Cylex", da: 46, region: "Global", you: "Live", competitor1: "Missing", competitor2: "Missing" },
];

const liveCount = CITATIONS.filter((c) => c.you === "Live").length;
const missingCount = CITATIONS.filter((c) => c.you === "Missing").length;
const incompleteCount = CITATIONS.filter((c) => c.you === "Incomplete").length;

function statusBadge(status: CitationStatus) {
  switch (status) {
    case "Live":
      return { bg: "var(--success-tint)", color: "var(--success)" };
    case "Missing":
      return { bg: "var(--danger-tint)", color: "var(--danger)" };
    case "Incomplete":
      return { bg: "var(--warning-tint)", color: "var(--warning)" };
  }
}

export default async function CitationsPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Citation Gaps"
        subtitle="Find missing business directory listings — compare your NAP consistency across 18+ UAE and global citation sources."
      />

      <GmbScoutTabs />

      {/* ── Summary Stats ── */}
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Live</div>
          <div className="mt-1 text-2xl font-medium tabular-nums" style={{ color: "var(--success)" }}>
            {liveCount}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Missing</div>
          <div className="mt-1 text-2xl font-medium tabular-nums" style={{ color: "var(--danger)" }}>
            {missingCount}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-text-faint">Incomplete</div>
          <div className="mt-1 text-2xl font-medium tabular-nums" style={{ color: "var(--warning)" }}>
            {incompleteCount}
          </div>
        </div>
      </section>

      {/* ── NAP Consistency ── */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="mb-4 text-sm font-medium text-text">NAP Consistency Check</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3" style={{ background: "var(--surface-2)" }}>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-text-faint">Business Name</span>
              <p className="mt-0.5 text-sm text-text">Safaeewala Cleaning Services LLC</p>
            </div>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--success-tint)", color: "var(--success)" }}
            >
              Consistent
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3" style={{ background: "var(--surface-2)" }}>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-text-faint">Address</span>
              <p className="mt-0.5 text-sm text-text">Office 1204, Al Shafar Tower 1, Barsha Heights, Dubai</p>
            </div>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--warning-tint)", color: "var(--warning)" }}
            >
              2 Mismatches
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3" style={{ background: "var(--surface-2)" }}>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-text-faint">Phone</span>
              <p className="mt-0.5 text-sm text-text">+971 4 557 8900</p>
            </div>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--success-tint)", color: "var(--success)" }}
            >
              Consistent
            </span>
          </div>
        </div>
      </section>

      {/* ── Citations Table ── */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium text-text">Citation Directory Audit</h2>
          <p className="mt-1 text-xs text-text-faint">18 directories compared across your business and 2 competitors</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border text-xs text-text-faint">
                <th className="px-5 py-2 font-medium">Directory</th>
                <th className="px-3 py-2 font-medium text-center">DA</th>
                <th className="px-3 py-2 font-medium text-center">Region</th>
                <th className="px-3 py-2 font-medium text-center">Your Status</th>
                <th className="px-3 py-2 font-medium text-center">JustLife.com</th>
                <th className="px-3 py-2 font-medium text-center">Helpling.ae</th>
              </tr>
            </thead>
            <tbody>
              {CITATIONS.map((c) => {
                const youStyle = statusBadge(c.you);
                const c1Style = statusBadge(c.competitor1);
                const c2Style = statusBadge(c.competitor2);
                return (
                  <tr key={c.directory} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="text-sm font-medium text-text">{c.directory}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-mono text-xs text-text-muted">{c.da}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-xs text-text-faint">{c.region}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: youStyle.bg, color: youStyle.color }}
                      >
                        {c.you}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: c1Style.bg, color: c1Style.color }}
                      >
                        {c.competitor1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: c2Style.bg, color: c2Style.color }}
                      >
                        {c.competitor2}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
