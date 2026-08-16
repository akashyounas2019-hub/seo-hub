import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function FullAuditPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Full SEO Audit"
        subtitle="Comprehensive audit across technical, content, on-page, schema, performance, images, and AI readiness."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="full-audit"
        title="Full Audit"
        description="Crawls the site, scores every SEO category, and produces a prioritized action plan."
      />
    </div>
  );
}
