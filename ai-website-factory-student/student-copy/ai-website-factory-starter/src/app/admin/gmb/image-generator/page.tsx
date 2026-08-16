import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DesigningScoutTabs } from "@/components/ui/DesigningScoutTabs";

export const dynamic = "force-dynamic";

export default async function ImageGeneratorPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="GMB Image Generator"
        subtitle="Generate optimized images for your Google Business Profile and local SEO."
      />
      <DesigningScoutTabs />
      <EmptyState
        glyph="spark"
        title="Coming Soon"
        description="The GMB Image Generator is under development. You'll be able to generate branded images for your Google Business Profile posts and listings."
      />
    </div>
  );
}
