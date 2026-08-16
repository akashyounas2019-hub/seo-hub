import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function PageAnalysisPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Single Page Analysis"
        subtitle="Deep on-page SEO analysis — titles, meta, headings, content, links, images, and schema."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="page-analysis"
        title="Page Analysis"
        description="Analyzes one page for all on-page SEO factors with actionable recommendations."
      />
    </div>
  );
}
