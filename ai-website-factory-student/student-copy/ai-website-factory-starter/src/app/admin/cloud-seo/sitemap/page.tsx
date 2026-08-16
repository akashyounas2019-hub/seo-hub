import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function SitemapPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Sitemap Analysis"
        subtitle="XML sitemap structure, quality gates, coverage gaps, and optimization recommendations."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="sitemap"
        title="Sitemap Analysis"
        description="Locates, validates, and analyzes sitemap structure and URL coverage."
      />
    </div>
  );
}
