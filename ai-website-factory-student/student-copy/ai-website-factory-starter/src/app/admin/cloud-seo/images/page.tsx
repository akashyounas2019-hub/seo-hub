import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function ImageSeoPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Image SEO Audit"
        subtitle="Alt text, file names, compression, formats, lazy loading, and performance impact analysis."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="images"
        title="Image Audit"
        description="Audits all images on a page for SEO best practices with prioritized fix list."
      />
    </div>
  );
}
