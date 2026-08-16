import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function ContentBriefPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Content Brief Generator"
        subtitle="Generate comprehensive content briefs with keyword targeting, structure, and E-E-A-T requirements."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="content-brief"
        title="Content Brief"
        description="Creates a production-ready brief a writer can use to produce high-ranking content."
        placeholder="https://example.com or a topic like 'villa deep cleaning Dubai Marina'"
      />
    </div>
  );
}
