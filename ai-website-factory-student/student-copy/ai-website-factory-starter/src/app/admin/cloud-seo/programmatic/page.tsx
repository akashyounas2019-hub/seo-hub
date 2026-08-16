import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function ProgrammaticPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Programmatic SEO"
        subtitle="Template-driven page detection, quality assessment, and scaling opportunities."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="programmatic"
        title="Programmatic SEO"
        description="Detects programmatic pages and recommends quality safeguards for scaling."
      />
    </div>
  );
}
