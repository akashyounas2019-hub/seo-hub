/**
 * Phase 2 — Content Brief Wizard route.
 *
 * Server component: requireAdmin + load the connected sites, then hand off to
 * the client wizard island. The wizard drives the Phase-1 brief engine via the
 * server actions (propose / approve / generate) — no brief logic lives here.
 */
import { asc } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContentScoutTabs } from "@/components/ui/ContentScoutTabs";
import { ContentBriefWizard } from "@/components/ui/ContentBriefWizard";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function ContentBriefWizardPage() {
  await ensureSchema();
  await requireAdmin();

  // All connected sites (a row exists in `sites` once a site is connected).
  // The brief engine grounds each brief in the chosen site's real facts.
  const all = await db()
    .select({ id: sites.id, name: sites.name, city: sites.city })
    .from(sites)
    .orderBy(asc(sites.name));

  return (
    <div className="w-full space-y-6">
      <PageHeader
        backHref="/admin/content"
        backLabel="Content pipeline"
        title="New content (brief)"
        subtitle="Propose a grounded, AI-Overview-ready brief, review + edit it, then hand it to the writer. The draft still passes the quality gate before publish."
      />

      <ContentScoutTabs />

      {all.length === 0 ? (
        <EmptyState
          glyph="sites"
          title="No sites yet"
          description="Connect a site first — the brief engine grounds every brief in that site's real facts (GBP, business facts, keyword data)."
          action={{ label: "Connect a site", href: "/admin/sites" }}
        />
      ) : (
        <ContentBriefWizard sites={all} />
      )}
    </div>
  );
}
