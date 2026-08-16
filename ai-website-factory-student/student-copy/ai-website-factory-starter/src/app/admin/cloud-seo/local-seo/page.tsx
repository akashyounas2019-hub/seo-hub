import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function LocalSeoPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Local SEO Analysis"
        subtitle="GBP optimization, NAP consistency, citations, reviews, local schema, and industry-specific recommendations."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="local-seo"
        title="Local SEO Analysis"
        description="Detects business type and audits all local search signals with a Local SEO Score."
      />
    </div>
  );
}
