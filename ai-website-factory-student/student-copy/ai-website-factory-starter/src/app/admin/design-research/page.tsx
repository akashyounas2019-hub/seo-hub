/**
 * /admin/design-research — "Research for new design" landing.
 *
 * Top: a client-island form to kick off a research run (market + niches).
 * Below: the run list with status pill + site count + age, each linking to
 * the gallery. When any run is mid-flight (researching/capturing) we mount
 * <AutoRefresh> so the list flips to "ready" without a manual reload.
 *
 * Server component (requireAdmin). The run→site count is one grouped query.
 */
import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { designReferenceSites } from "@/db/schema";
import { listResearchRuns } from "@/app/actions/design-research";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { DesigningScoutTabs } from "@/components/ui/DesigningScoutTabs";
import { formatRelative } from "@/lib/utils";
import { requireAdmin } from "@/lib/server-auth";
import { StartResearchForm } from "./StartResearchForm";

export const dynamic = "force-dynamic";

type RunStatus = "queued" | "researching" | "capturing" | "ready" | "failed";

function statusTone(status: string): "neutral" | "info" | "accent" | "success" | "danger" | "warning" {
  switch (status as RunStatus) {
    case "ready":
      return "success";
    case "failed":
      return "danger";
    case "researching":
    case "capturing":
      return "info";
    case "queued":
      return "warning";
    default:
      return "neutral";
  }
}

const NICHE_LABELS: Record<string, string> = {
  cleaning: "Cleaning Services",
  restaurant: "Restaurant",
  local_service: "Local service",
  healthcare: "Healthcare / dental",
  fitness: "Fitness / wellness",
  legal: "Legal / professional",
  home_services: "Home services",
  food_hospitality: "Food / hospitality",
  beauty: "Beauty / salon",
  other: "Other",
};

function nicheLabel(key: string): string {
  return NICHE_LABELS[key] ?? key.replace(/_/g, " ");
}

export default async function DesignResearchPage() {
  await ensureSchema();
  await requireAdmin();

  const runs = await listResearchRuns(50);

  // One grouped query for per-run site counts (avoids N+1).
  const counts = runs.length
    ? await db()
        .select({
          runId: designReferenceSites.runId,
          n: sql<number>`count(*)::int`,
        })
        .from(designReferenceSites)
        .groupBy(designReferenceSites.runId)
    : [];
  const countByRun = new Map(counts.map((c) => [c.runId, c.n]));

  const inFlight = runs.some(
    (r) => r.status === "researching" || r.status === "capturing" || r.status === "queued",
  );

  return (
    <div className="mx-auto max-w-[1080px] space-y-7">
      {/* Auto-refresh while a run is still working on the Mac worker. */}
      {inFlight ? <AutoRefresh intervalMs={8000} /> : null}

      <PageHeader
        title="Design Researcher"
        subtitle="Find high-performing sites in any market, capture every section, and mix-and-match the best layouts into a fresh build."
      />

      <DesigningScoutTabs />

      <StartResearchForm />

      <RowList title="Research runs" count={runs.length}>
        {runs.length === 0 ? (
          <EmptyState
            glyph="search"
            title="No research runs yet"
            description="Start one above — the agent will scout ~10 reference sites and screenshot every section for you to pick from."
          />
        ) : (
          runs.map((run) => {
            const siteCount = countByRun.get(run.id) ?? 0;
            const niches = Array.isArray(run.niches) ? run.niches : [];
            const working = run.status === "researching" || run.status === "capturing" || run.status === "queued";
            return (
              <Row key={run.id} href={`/admin/design-research/${run.id}`}>
                <div className="flex w-full items-center gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{run.market}</span>
                      <Pill tone={statusTone(run.status)}>{run.status}</Pill>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-text-faint">
                      {niches.length ? niches.map(nicheLabel).join(" · ") : "no niches"}
                      {working ? (
                        <span className="text-info"> · agent is researching on the Mac worker…</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 basis-28 text-right">
                    <div className="tnum text-xs text-text-muted">
                      {siteCount} site{siteCount === 1 ? "" : "s"}
                    </div>
                    <div className="mt-0.5 text-xs text-text-faint">{formatRelative(run.createdAt)}</div>
                  </div>
                </div>
              </Row>
            );
          })
        )}
      </RowList>
    </div>
  );
}
