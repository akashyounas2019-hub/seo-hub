import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { GmbScoutTabs } from "@/components/ui/GmbScoutTabs";

export const dynamic = "force-dynamic";

export default async function PostGeneratorPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        title="Post Generator"
        subtitle="Create and schedule Google Business Profile posts for your sites."
      />
      <GmbScoutTabs />
      <EmptyState
        glyph="spark"
        title="Coming Soon"
        description="The GMB Post Generator is under development. You'll be able to create, preview, and schedule Google Business Profile posts directly from this dashboard."
      />
    </div>
  );
}
