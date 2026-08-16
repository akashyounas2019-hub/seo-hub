import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function GeoPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="AI & GEO Visibility"
        subtitle="Generative Engine Optimization — AI crawler access, citability, brand mentions, and AI Overview optimization."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="geo"
        title="GEO Analysis"
        description="Assesses AI search readiness with a GEO score and optimization recommendations."
      />
    </div>
  );
}
