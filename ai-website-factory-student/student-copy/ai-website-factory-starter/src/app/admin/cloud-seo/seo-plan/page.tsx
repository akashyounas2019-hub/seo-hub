import { requireAdmin } from "@/lib/server-auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { CloudSeoForm } from "../CloudSeoForm";

export const dynamic = "force-dynamic";

export default async function SeoPlanPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GitHub Cloud SEO"
        title="SEO Strategy Plan"
        subtitle="90-day phased SEO strategy with action items, KPIs, and monthly milestones."
        backHref="/admin/cloud-seo"
        backLabel="All Tools"
      />
      <CloudSeoForm
        analysisType="seo-plan"
        title="SEO Plan"
        description="Creates a 90-day plan tailored to the site's industry, current state, and competitive landscape."
      />
    </div>
  );
}
