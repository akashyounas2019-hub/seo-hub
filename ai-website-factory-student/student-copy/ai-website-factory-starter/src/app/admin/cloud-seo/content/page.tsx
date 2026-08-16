import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function ContentAnalysisPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="Content & E-E-A-T Analysis"
        subtitle="Content quality assessment using Google's Who/How/Why test and the full E-E-A-T framework."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="content"
        title="Content Analysis"
        description="Scores Experience, Expertise, Authoritativeness, and Trustworthiness with improvement recommendations."
      />
    </div>
  );
}
