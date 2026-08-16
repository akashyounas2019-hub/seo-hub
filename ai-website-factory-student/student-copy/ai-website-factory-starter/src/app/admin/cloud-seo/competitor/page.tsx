import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function CompetitorPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Competitor Analysis"
        subtitle="Content gaps, keyword opportunities, technical edge, backlink indicators, and competitive strategy."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="competitor"
        title="Competitor Analysis"
        description="Analyzes a competitor URL for SEO intelligence and actionable strategy."
        placeholder="https://competitor-site.com"
      />
    </div>
  );
}
