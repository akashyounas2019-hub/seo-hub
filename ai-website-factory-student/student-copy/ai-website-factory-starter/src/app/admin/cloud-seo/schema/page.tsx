import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function SchemaPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Schema & Structured Data"
        subtitle="Detect, validate, and generate JSON-LD structured data for rich results eligibility."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="schema"
        title="Schema Analysis"
        description="Finds existing markup, validates it, and generates ready-to-use JSON-LD for missing types."
      />
    </div>
  );
}
