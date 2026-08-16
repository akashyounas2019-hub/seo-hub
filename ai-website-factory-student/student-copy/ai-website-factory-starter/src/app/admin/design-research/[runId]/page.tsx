/**
 * /admin/design-research/[runId] — the gallery (core UX).
 *
 * Two server-rendered views, switched by `?site=<id>`:
 *
 *   • No ?site → the ~10 reference-site cards (thumbnail + name/market/niche +
 *     "why high-performing" + design DNA + SEMrush rank/traffic). Paginated
 *     when > 12. Each card links to its section view.
 *
 *   • ?site=<id> → that site's section gallery: one card per detected section
 *     (screenshot + type label + dom summary) each with a "Use this section"
 *     picker that queues a rebuild into a build project.
 *
 * A "Selected sections" tray (listSelectionsForRun) is always shown — the
 * mix-and-match basket with per-selection build status + a link to the build
 * project. Auto-refreshes while the run or any selection is still working.
 *
 * Screenshots load via /api/design-research/screenshot/<relpath> (admin-auth'd
 * streaming route) — paths come straight from publicUrlForPath().
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSchema } from "@/db/client";
import {
  getResearchRun,
  listSelectionsForRun,
  listTargetProjects,
} from "@/app/actions/design-research";
import { publicUrlForPath } from "@/lib/design-capture";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { AgentWorking } from "@/components/ui/AgentWorking";
import { CardHairline } from "@/components/ui/ObsidianAtoms";
import { Pagination, pageParams, paginate, type SearchParams } from "@/components/ui/Pagination";
import { formatRelative } from "@/lib/utils";
import { requireAdmin } from "@/lib/server-auth";
import { UseSectionButton, type TargetProjectOption } from "./UseSectionButton";
import { SectionClip } from "./SectionClip";
import { RunActions } from "./RunActions";

export const dynamic = "force-dynamic";

const SITES_PER_PAGE = 12;

const NICHE_LABELS: Record<string, string> = {
  cleaning: "Cleaning Services", restaurant: "Restaurant",
  local_service: "Local service", healthcare: "Healthcare / dental", fitness: "Fitness / wellness",
  legal: "Legal / professional", home_services: "Home services", food_hospitality: "Food / hospitality",
  beauty: "Beauty / salon", other: "Other",
};
function nicheLabel(key?: string | null): string {
  if (!key) return "";
  return NICHE_LABELS[key] ?? key.replace(/_/g, " ");
}

function runStatusTone(s: string): "neutral" | "info" | "accent" | "success" | "danger" | "warning" {
  if (s === "ready") return "success";
  if (s === "failed") return "danger";
  if (s === "researching" || s === "capturing") return "info";
  if (s === "queued") return "warning";
  return "neutral";
}

function selectionTone(s: string): "neutral" | "info" | "accent" | "success" {
  if (s === "built") return "success";
  if (s === "building") return "info";
  return "accent"; // selected
}

/** Pull palette/font/layout out of the loosely-typed design_dna JSON. */
function readDna(dna: Record<string, unknown> | null | undefined): {
  palette: string[];
  fonts: string[];
  layout: string;
} {
  const d = dna ?? {};
  const palette = Array.isArray(d.palette)
    ? (d.palette as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6)
    : [];
  const fonts = Array.isArray(d.fonts)
    ? (d.fonts as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3)
    : [];
  const layout = typeof d.layoutStyle === "string" ? d.layoutStyle : "";
  return { palette, fonts, layout };
}

export default async function DesignResearchRunPage({
  params,
  searchParams,
}: {
  params: { runId: string };
  searchParams: SearchParams;
}) {
  await ensureSchema();
  await requireAdmin();

  const data = await getResearchRun(params.runId);
  if (!data) notFound();
  const { run, sites } = data;

  const [selections, targetProjects] = await Promise.all([
    listSelectionsForRun(params.runId),
    listTargetProjects(),
  ]);

  const projectOptions: TargetProjectOption[] = targetProjects.map((p) => ({
    id: p.id,
    businessName: p.businessName,
    city: p.city,
  }));

  // Lookups for the Selected tray (section type / site name / project name).
  const sectionById = new Map<string, { type: string; siteName: string }>();
  for (const s of sites) {
    for (const sec of s.sections) {
      sectionById.set(sec.id, { type: sec.sectionType, siteName: s.name });
    }
  }
  const projectNameById = new Map(targetProjects.map((p) => [p.id, p.businessName]));

  const selectedSiteId = Array.isArray(searchParams.site) ? searchParams.site[0] : searchParams.site;
  const activeSite = selectedSiteId ? sites.find((s) => s.id === selectedSiteId) : null;

  const anyWorking =
    run.status === "researching" ||
    run.status === "capturing" ||
    run.status === "queued" ||
    selections.some((s) => s.status === "building");

  const nicheList = Array.isArray(run.niches) ? run.niches : [];

  return (
    <div className="mx-auto max-w-[1180px] space-y-7">
      {anyWorking ? <AutoRefresh intervalMs={8000} /> : null}

      <PageHeader
        backHref="/admin/design-research"
        backLabel="All runs"
        title={run.market}
        subtitle={
          [
            nicheList.map(nicheLabel).join(" · "),
            run.summary ?? "",
          ]
            .filter(Boolean)
            .join(" — ") || undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <RunActions runId={params.runId} />
            <Pill tone={runStatusTone(run.status)}>{run.status}</Pill>
          </div>
        }
      />

      {/* Selected sections tray — the mix-and-match basket. */}
      <SelectedTray
        selections={selections}
        sectionById={sectionById}
        projectNameById={projectNameById}
      />

      {activeSite ? (
        <SectionGallery
          site={activeSite}
          runId={params.runId}
          projectOptions={projectOptions}
        />
      ) : (
        <SiteGrid
          sites={sites}
          run={run}
          runId={params.runId}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Page-1: site cards ───────────────────────── */

function SiteGrid({
  sites,
  run,
  runId,
  searchParams,
}: {
  sites: Awaited<ReturnType<typeof getResearchRun>> extends infer T
    ? T extends { sites: infer S }
      ? S
      : never
    : never;
  run: { status: string; createdAt?: Date | string | null };
  runId: string;
  searchParams: SearchParams;
}) {
  if (sites.length === 0) {
    const working = run.status === "researching" || run.status === "capturing" || run.status === "queued";
    if (working) {
      const currentStage = run.status === "capturing" ? "capture" : "find";
      return (
        <AgentWorking
          title="The agent is researching the market"
          stages={[
            { key: "find", label: "Find high-performing sites" },
            { key: "capture", label: "Screenshot every section" },
            { key: "rank", label: "Rank & assemble gallery" },
          ]}
          currentStage={currentStage}
          messages={[
            "Searching the web for the best-converting sites in this market…",
            "Reading layouts, palettes, and conversion patterns…",
            "Capturing full-page screenshots with Playwright…",
            "Ranking by design quality and SEMrush traffic…",
          ]}
          note="Research agent is working — this may take a few minutes"
          startedAt={run.createdAt ?? undefined}
          skeleton="cards"
          skeletonCount={6}
        />
      );
    }
    return (
      <EmptyState
        glyph="search"
        title="No reference sites yet"
        description="No high-performing sites were captured for this run."
      />
    );
  }

  const { page } = pageParams(searchParams, SITES_PER_PAGE);
  const pageSites = paginate(sites, page, SITES_PER_PAGE);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageSites.map((site) => {
          const dna = readDna(site.designDna);
          const thumb = site.fullScreenshotPath ? publicUrlForPath(site.fullScreenshotPath) : null;
          const captureFailed = site.status === "capture_failed";
          return (
            <Link
              key={site.id}
              href={`/admin/design-research/${runId}?site=${site.id}`}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:border-border-strong"
            >
              <CardHairline />
              {/* Full-page thumbnail */}
              <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={`${site.name} full page`}
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-text-faint/50">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span className="text-xs font-medium text-text-faint">
                      {captureFailed ? "Screenshot capture failed" : "Screenshot pending"}
                    </span>
                    <span className="text-[10px] text-text-faint/70">
                      {captureFailed
                        ? "The site may have blocked automated access"
                        : "Playwright is capturing this page…"}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{site.name}</span>
                    {site.niche ? <Pill tone="neutral">{nicheLabel(site.niche)}</Pill> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-faint">
                    {[site.market, site.url].filter(Boolean).join(" · ")}
                  </div>
                </div>

                {site.whyHighPerforming ? (
                  <p className="line-clamp-3 text-xs leading-relaxed text-text-muted">
                    {site.whyHighPerforming}
                  </p>
                ) : null}

                {/* Design DNA */}
                {(dna.palette.length > 0 || dna.fonts.length > 0 || dna.layout) ? (
                  <div className="mt-auto space-y-1.5 pt-1">
                    {dna.palette.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        {dna.palette.map((c, i) => (
                          <span
                            key={`${c}-${i}`}
                            title={c}
                            className="h-4 w-4 rounded-sm border border-border"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    ) : null}
                    {(dna.fonts.length > 0 || dna.layout) ? (
                      <div className="truncate text-xs text-text-faint">
                        {[dna.fonts.join(", "), dna.layout].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* SEMrush metrics */}
                {(site.semrushTraffic != null || site.semrushRank != null) ? (
                  <div className="flex items-center gap-2 border-t border-border pt-2.5 text-xs text-text-muted">
                    {site.semrushTraffic != null ? (
                      <span className="tnum">
                        <span className="text-text-faint">Traffic </span>
                        {Intl.NumberFormat("en", { notation: "compact" }).format(site.semrushTraffic)}
                      </span>
                    ) : null}
                    {site.semrushRank != null ? (
                      <span className="tnum">
                        <span className="text-text-faint">Rank </span>
                        #{Intl.NumberFormat("en").format(site.semrushRank)}
                      </span>
                    ) : null}
                    <span className="ml-auto text-text-faint">{site.sections.length} sections →</span>
                  </div>
                ) : (
                  <div className="border-t border-border pt-2.5 text-right text-xs text-text-faint">
                    {site.sections.length} sections →
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <Pagination
        basePath={`/admin/design-research/${runId}`}
        page={page}
        totalItems={sites.length}
        perPage={SITES_PER_PAGE}
        searchParams={searchParams}
      />
    </section>
  );
}

/* ───────────────────── Site → section gallery ───────────────────── */

function SectionGallery({
  site,
  runId,
  projectOptions,
}: {
  site: NonNullable<Awaited<ReturnType<typeof getResearchRun>>>["sites"][number];
  runId: string;
  projectOptions: TargetProjectOption[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/design-research/${runId}`}
            className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text"
          >
            <span aria-hidden>←</span> All sites
          </Link>
          <h2 className="mt-1 text-md font-medium text-text">{site.name}</h2>
          <div className="text-xs text-text-faint">
            {[site.market, site.url].filter(Boolean).join(" · ")}
          </div>
        </div>
        <Stat label="Sections" value={site.sections.length} />
      </div>

      {site.sections.length === 0 ? (
        <EmptyState
          glyph="search"
          title="No sections captured"
          description="The capture step did not detect any top-level layout blocks on this page."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {site.sections
            // Only show VALIDATED sections — vision flags blank / cut-off / cookie-banner blocks
            // as is_valid=false so we never present a broken section as a usable reference.
            .filter((sec) => sec.isValid !== false)
            .map((sec) => {
            const shot = sec.screenshotPath ? publicUrlForPath(sec.screenshotPath) : null;
            const isVisionBand = (sec.source === "vision" || sec.source === "vision-mac") && sec.yStartPct != null && sec.yEndPct != null;
            return (
              <div
                key={sec.id}
                className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
              >
                <CardHairline />
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="tnum text-xs font-semibold text-text-faint">
                      {String(sec.order + 1).padStart(2, "0")}
                    </span>
                    <Pill tone="accent">{sec.sectionType}</Pill>
                    {sec.label && sec.label !== sec.sectionType ? (
                      <span className="truncate text-xs text-text-muted">{sec.label}</span>
                    ) : null}
                  </div>
                  <UseSectionButton
                    sectionId={sec.id}
                    sectionType={sec.sectionType}
                    projects={projectOptions}
                  />
                </div>

                <div className="bg-surface-2">
                  {shot && isVisionBand ? (
                    <SectionClip
                      src={shot}
                      alt={`${sec.sectionType} section`}
                      yStartPct={sec.yStartPct as number}
                      yEndPct={sec.yEndPct as number}
                    />
                  ) : shot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shot}
                      alt={`${sec.sectionType} section`}
                      loading="lazy"
                      className="max-h-[420px] w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-32 w-full flex-col items-center justify-center gap-1.5">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-text-faint/50">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      <span className="text-[10px] text-text-faint">Screenshot not available</span>
                    </div>
                  )}
                </div>

                {sec.domSummary ? (
                  <p className="line-clamp-2 px-4 py-3 text-xs leading-relaxed text-text-faint">
                    {sec.domSummary}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────────── Selected sections tray ───────────────────── */

function SelectedTray({
  selections,
  sectionById,
  projectNameById,
}: {
  selections: Awaited<ReturnType<typeof listSelectionsForRun>>;
  sectionById: Map<string, { type: string; siteName: string }>;
  projectNameById: Map<string, string>;
}) {
  if (selections.length === 0) {
    return (
      <RowList title="Selected sections">
        <div className="px-4 py-6 text-center text-xs text-text-faint">
          Your mix-and-match basket is empty. Open a site below and click
          &ldquo;Use this section&rdquo; to start building a new design from the best parts.
        </div>
      </RowList>
    );
  }

  return (
    <RowList title="Selected sections" count={selections.length}>
      {selections.map((sel) => {
        const meta = sectionById.get(sel.sectionId);
        const projectName = sel.targetProjectId ? projectNameById.get(sel.targetProjectId) : null;
        return (
          <Row key={sel.id}>
            <div className="flex w-full items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-text">
                    {meta ? meta.type : "section"}
                  </span>
                  <Pill tone={selectionTone(sel.status)}>{sel.status}</Pill>
                </div>
                <div className="mt-0.5 truncate text-xs text-text-faint">
                  {meta ? `from ${meta.siteName}` : ""}
                  {projectName ? ` → ${projectName}` : " → new project"}
                  {" · "}
                  {formatRelative(sel.createdAt)}
                </div>
              </div>
              {sel.targetProjectId ? (
                <Link
                  href={`/admin/build/${sel.targetProjectId}`}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  Build project →
                </Link>
              ) : null}
            </div>
          </Row>
        );
      })}
    </RowList>
  );
}
