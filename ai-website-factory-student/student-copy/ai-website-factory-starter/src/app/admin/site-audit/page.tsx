import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";

export const dynamic = "force-dynamic";

export default async function SiteAuditPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="brand-rule">
        <h1>Site Audit</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Full-site technical audit with crawl, scoring, and recommendations.
        </p>
      </header>

      <AuditReportingScoutTabs />

      <EmptyState
        glyph="search"
        title="Coming soon"
        description="Site audit is under development. This will provide comprehensive technical SEO auditing per site with actionable recommendations."
      />
    </div>
  );
}
