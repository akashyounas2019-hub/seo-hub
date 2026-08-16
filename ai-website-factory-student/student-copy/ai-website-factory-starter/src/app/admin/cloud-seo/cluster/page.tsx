import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function ClusterPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Keyword Clustering"
        subtitle="Semantic keyword grouping with pillar-cluster architecture and content planning."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="cluster"
        title="Keyword Clustering"
        description="Groups keywords into semantic clusters and builds a topical content map."
        placeholder="https://example.com or keywords like 'plumber, emergency plumber, drain cleaning'"
      />
    </div>
  );
}
