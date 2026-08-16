import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function SxoPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Search Experience (SXO)"
        subtitle="SEO + UX intersection — search-to-page alignment, user journey, engagement signals, and persona scoring."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="sxo"
        title="SXO Analysis"
        description="Scores the page at the intersection of SEO and UX for different user personas."
      />
    </div>
  );
}
