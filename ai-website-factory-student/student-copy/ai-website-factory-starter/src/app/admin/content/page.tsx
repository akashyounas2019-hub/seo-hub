/**
 * P4 — Content pipeline kanban.
 *
 * Five lanes: brief, drafting, review, approved, published. Each card is
 * a content brief — click to open detail/edit. "+ New brief" button up top.
 */
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { contentBriefs, sites, users } from "@/db/schema";
import { Pill } from "@/components/ui/Row";
import { ContentScoutTabs } from "@/components/ui/ContentScoutTabs";
import { PrimaryCta, GhostButton, HeroKPIStrip } from "@/components/ui/ObsidianAtoms";
import { Stat } from "@/components/ui/Stat";
import {
  BRIEF_STATUSES,
  statusLabel,
  statusTone,
  type BriefStatus,
} from "@/lib/content-pipeline";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LANES: BriefStatus[] = ["brief", "drafting", "review", "approved", "published"];

export default async function ContentKanbanPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const briefs = await d
    .select({
      b: contentBriefs,
      siteSlug: sites.slug,
      siteName: sites.name,
      assigneeName: users.name,
      assigneeEmail: users.email,
      // Word count of the draft body, computed in SQL so we don't ship the
      // full Markdown to the page just to count it. Empty drafts → 0.
      draftWords: sql<number>`coalesce(array_length(regexp_split_to_array(btrim(${contentBriefs.draftMarkdown}), E'\\\\s+'), 1), 0)::int`,
    })
    .from(contentBriefs)
    .innerJoin(sites, eq(sites.id, contentBriefs.siteId))
    .leftJoin(users, eq(users.id, contentBriefs.assigneeId))
    .orderBy(desc(contentBriefs.updatedAt))
    .limit(200);

  const byLane = new Map<BriefStatus, typeof briefs>();
  for (const lane of LANES) byLane.set(lane, [] as unknown as typeof briefs);
  for (const b of briefs) {
    const s = b.b.status as BriefStatus;
    if (byLane.has(s)) (byLane.get(s)! as typeof briefs).push(b);
  }

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl">Content Pipeline</h1>
            <p className="mt-1.5 text-xs text-text-muted">
              Editorial workflow — brief → drafting → review → approved → published. Drag-free: each card has a "next step" button.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryCta href="/admin/content/brief">New content (brief)</PrimaryCta>
            <GhostButton href="/admin/content/new">+ Blank brief</GhostButton>
          </div>
        </div>
      </header>

      <ContentScoutTabs />

      {/* KPI strip — total in flight, by-lane counts. Surfaces the bottleneck
          (which lane has the most stuck briefs) at a glance. */}
      <HeroKPIStrip columns={5}>
        <Stat label="Total in flight" value={briefs.filter((b) => b.b.status !== "published" && b.b.status !== "archived").length} />
        <Stat
          label="Briefs"
          value={byLane.get("brief")!.length}
          tone="info"
        />
        <Stat
          label="Drafting"
          value={byLane.get("drafting")!.length}
          tone={(byLane.get("drafting")!.length) > 5 ? "warning" : "neutral"}
        />
        <Stat
          label="In review"
          value={byLane.get("review")!.length}
          tone={(byLane.get("review")!.length) > 0 ? "accent" : "neutral"}
        />
        <Stat
          label="Published · 7d"
          value={briefs.filter((b) => b.b.status === "published" && b.b.publishedAt && b.b.publishedAt > new Date(Date.now() - 7 * 86400_000)).length}
          tone="success"
        />
      </HeroKPIStrip>

      {briefs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-5 py-6">
          <p className="text-sm font-medium text-text">No content briefs yet</p>
          <p className="mt-1 max-w-[64ch] text-xs leading-relaxed text-text-muted">
            This is the editorial pipeline. Start a brief (or let the agent draft one), and it walks left-to-right:
            <strong className="text-text"> brief</strong> → <strong className="text-text">drafting</strong> →{" "}
            <strong className="text-text">review</strong> → <strong className="text-text">approved</strong> →{" "}
            <strong className="text-text">published</strong>. Each card shows its site, target keyword, word count,
            and the critic-LLM verdict so you can spot what&rsquo;s stuck. Click{" "}
            <strong className="text-text">+ New brief</strong> above to add the first one.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5">
        {LANES.map((lane) => {
          const cards = byLane.get(lane) as typeof briefs;
          return (
            <section key={lane} className="rounded-lg border border-border bg-surface-soft p-2.5">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                  {statusLabel(lane)}
                </h2>
                <span className="tnum text-xs text-text-faint">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-surface px-2 py-3 text-center text-xs text-text-faint">
                    (empty)
                  </p>
                ) : (
                  cards.map((c) => (
                    <Link
                      key={c.b.id}
                      href={`/admin/content/${c.b.id}`}
                      className="block rounded-md border border-border bg-surface p-2.5 hover:border-accent"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="line-clamp-2 text-xs font-medium text-text">{c.b.title}</span>
                        <Pill tone={statusTone(lane)}>{statusLabel(lane)}</Pill>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-text-faint">
                        <span className="truncate">{c.siteName}</span>
                        <span>{formatRelative(c.b.updatedAt)}</span>
                      </div>
                      {c.b.targetKeyword ? (
                        <p className="mt-1 truncate font-mono text-xs text-text-faint" title={c.b.targetKeyword}>
                          ⌕ {c.b.targetKeyword}
                        </p>
                      ) : null}
                      {/* Signal chips — word count, critic verdict, schedule, assignee.
                          Each only renders when its data exists so cards stay tidy. */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {c.draftWords > 0 ? (
                          <span className="tnum rounded-sm bg-surface-2 px-1 py-px text-xs text-text-muted" title="Draft word count">
                            {c.draftWords >= 1000 ? `${(c.draftWords / 1000).toFixed(1)}k` : c.draftWords}w
                          </span>
                        ) : null}
                        {c.b.criticConfidence !== null ? (
                          <span
                            className={`tnum rounded-sm px-1 py-px text-xs ${
                              c.b.criticConfidence >= 75
                                ? "bg-success-tint text-success"
                                : c.b.criticConfidence >= 50
                                  ? "bg-warning-tint text-warning"
                                  : "bg-danger-tint text-danger"
                            }`}
                            title="Critic-LLM confidence (0–100)"
                          >
                            critic {c.b.criticConfidence}
                          </span>
                        ) : null}
                        {lane === "published" && c.b.publishedAt ? (
                          <span className="rounded-sm bg-success-tint px-1 py-px text-xs text-success" title="Published">
                            ✓ {formatRelative(c.b.publishedAt)}
                          </span>
                        ) : c.b.dueAt ? (
                          <span
                            className={`rounded-sm px-1 py-px text-xs ${
                              c.b.dueAt.getTime() < Date.now()
                                ? "bg-danger-tint text-danger"
                                : "bg-surface-2 text-text-muted"
                            }`}
                            title="Due / scheduled"
                          >
                            due {formatRelative(c.b.dueAt)}
                          </span>
                        ) : null}
                      </div>
                      {c.assigneeName || c.assigneeEmail ? (
                        <p className="mt-1 truncate text-xs text-text-faint">
                          → {c.assigneeName ?? c.assigneeEmail}
                        </p>
                      ) : null}
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-text-faint">
        Archive: <Link href="/admin/content/archived" className="text-text underline">view archived briefs</Link>
      </p>
    </div>
  );
}
