import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { TechWatchdogClient } from "./TechWatchdogClient";

export const dynamic = "force-dynamic";

export default async function TechWatchdogPage() {
  await ensureSchema();
  await requireAdmin();

  // Load connected sites so user can pick from a dropdown
  const siteRows = await db()
    .select({ slug: sites.slug, name: sites.name, domain: sites.domain })
    .from(sites)
    .orderBy(sites.name);

  const siteOptions = siteRows.map((s) => ({
    slug: s.slug,
    name: s.name,
    domain: s.domain,
  }));

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Tech Watchdog"
        subtitle="Real-time PageSpeed monitoring — mobile and desktop scores, Core Web Vitals (LCP, CLS, TBT), opportunities, and issue tracking."
      />

      <TechnicalScoutTabs />

      <TechWatchdogClient siteOptions={siteOptions} />
    </div>
  );
}
