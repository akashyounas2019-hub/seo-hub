import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function HreflangPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Hreflang & International SEO"
        subtitle="Hreflang tag validation, return tag checks, and multi-language implementation audit."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="hreflang"
        title="Hreflang Audit"
        description="Validates hreflang implementation and provides a complete guide if tags are missing."
      />
    </div>
  );
}
