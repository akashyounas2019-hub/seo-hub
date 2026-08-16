import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function TechnicalSeoPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Technical SEO Audit"
        subtitle="Crawlability, indexability, security, URL structure, mobile, CWV, structured data, JS rendering, and IndexNow."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="technical"
        title="Technical Audit"
        description="Audits 9 technical SEO categories with pass/warn/fail scoring."
      />
    </div>
  );
}
