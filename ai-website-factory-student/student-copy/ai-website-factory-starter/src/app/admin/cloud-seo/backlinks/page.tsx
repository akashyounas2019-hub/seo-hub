import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function BacklinksPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Backlink Profile Analysis"
        subtitle="Domain authority signals, anchor text distribution, link quality, and link building strategy."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="backlinks"
        title="Backlink Analysis"
        description="Assesses link profile indicators and recommends a link building strategy."
      />
    </div>
  );
}
