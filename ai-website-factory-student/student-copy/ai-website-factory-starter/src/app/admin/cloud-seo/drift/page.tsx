import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function DriftPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="SEO Drift Monitor"
        subtitle="Content freshness, technical drift, competitive shifts, content gap evolution, and monitoring recommendations."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="drift"
        title="Drift Analysis"
        description="Detects SEO degradation signals and provides a Drift Risk Score with recovery actions."
      />
    </div>
  );
}
