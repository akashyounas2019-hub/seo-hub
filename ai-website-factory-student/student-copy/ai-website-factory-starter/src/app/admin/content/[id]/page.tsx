/**
 * P4 — Content brief detail / editor.
 *
 * Three columns: Brief · Draft · Review notes. Below: state-machine
 * transition buttons, transition log, and the publish controls.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { contentBriefs, sites, users } from "@/db/schema";
import {
  deleteBriefAction,
  runBriefCriticAction,
  transitionBriefAction,
  updateBriefAction,
} from "@/app/actions/content-pipeline";
import { Pill } from "@/components/ui/Row";
import {
  nextStates,
  statusLabel,
  statusTone,
  type BriefStatus,
} from "@/lib/content-pipeline";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContentBriefDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const [row] = await db()
    .select({
      b: contentBriefs,
      siteSlug: sites.slug,
      siteName: sites.name,
    })
    .from(contentBriefs)
    .innerJoin(sites, eq(sites.id, contentBriefs.siteId))
    .where(eq(contentBriefs.id, params.id))
    .limit(1);
  if (!row) notFound();
  const b = row.b;
  const status = b.status as BriefStatus;
  const allowedNext = nextStates(status);

  const allUsers = await db()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.email));

  // Resolve who-did-what for transitions
  const log = (b.transitions as Array<{ from: string; to: string; at: string; by: string | null; note?: string }>) ?? [];
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/content" className="text-xs text-text-faint hover:text-text">
          ← Pipeline
        </Link>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="">{b.title}</h1>
          <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          <Link href={`/admin/sites/${row.siteSlug}`} className="text-accent hover:underline">{row.siteName}</Link>
          {b.targetKeyword ? <> · <span className="font-mono">⌕ {b.targetKeyword}</span></> : null}
          {" · "}{b.contentType}
          {b.wpPostId ? <> · WP post #{b.wpPostId}</> : null}
        </p>
      </header>

      {searchParams.error === "invalid-transition" ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          That transition isn&apos;t allowed from the current state.
        </div>
      ) : null}
      {searchParams.error === "critic-stale" ? (
        <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
          The critic hasn&apos;t reviewed this brief in the last 24 hours. Run the critic before transitioning.
        </div>
      ) : null}
      {searchParams.error === "critic-low" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Critic confidence is below the ship threshold (50). Address the flagged issues or use Force-advance.
        </div>
      ) : null}

      {/* ----- Critic verdict ----- */}
      <CriticPanel
        confidence={b.criticConfidence}
        issues={(b.criticIssues ?? []) as string[]}
        reviewedAt={b.criticReviewedAt}
        briefId={b.id}
      />

      {/* ----- State transitions ----- */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">Move to →</h2>
        {allowedNext.length === 0 ? (
          <p className="mt-2 text-xs text-text-faint">No further transitions available from this state.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {allowedNext.map((to) => {
              // Determine if this transition needs a fresh critic verdict
              const needsCritic =
                (status === "brief" && to === "drafting") || to === "approved";
              const criticOk =
                b.criticConfidence !== null && b.criticConfidence !== undefined && b.criticConfidence >= 50;
              const stale =
                !b.criticReviewedAt ||
                Date.now() - new Date(b.criticReviewedAt).getTime() > 24 * 60 * 60 * 1000;
              const gateBlocks = needsCritic && (stale || !criticOk);
              return (
                <form key={to} action={transitionBriefAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="to" value={to} />
                  {gateBlocks && !stale ? <input type="hidden" name="force" value="1" /> : null}
                  <button
                    type="submit"
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      gateBlocks
                        ? "border-danger/40 bg-danger-tint text-danger hover:bg-danger/10"
                        : to === "published"
                          ? "border-success bg-success-tint text-success hover:bg-success-tint/80"
                          : to === "archived"
                            ? "border-border text-text-muted hover:border-danger hover:text-danger"
                            : "border-border text-text hover:border-accent hover:text-accent"
                    }`}
                    title={gateBlocks ? "Critic blocks this — clicking will force-advance with audit" : undefined}
                  >
                    {gateBlocks ? "force → " : "→ "}{statusLabel(to)}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </section>

      {/* ----- Three-column editor ----- */}
      <form action={updateBriefAction} className="space-y-4">
        <input type="hidden" name="id" value={b.id} />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Brief */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="">Brief</h3>
            <p className="mt-0.5 text-xs text-text-faint">The plan: audience, intent, outline, internal links.</p>
            <textarea
              name="briefMarkdown"
              defaultValue={b.briefMarkdown}
              rows={20}
              className="mt-2 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          {/* Draft */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="">Draft (Markdown)</h3>
            <p className="mt-0.5 text-xs text-text-faint">The actual content — published to WordPress on transition to "published".</p>
            <textarea
              name="draftMarkdown"
              defaultValue={b.draftMarkdown}
              rows={20}
              placeholder="# H1 Title\n\nIntro paragraph…\n\n## H2 Section\n\n- Bullet"
              className="mt-2 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 font-mono text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          {/* Review notes */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="">Review notes</h3>
            <p className="mt-0.5 text-xs text-text-faint">Editor's comments on the draft — visible alongside.</p>
            <textarea
              name="reviewNotes"
              defaultValue={b.reviewNotes}
              rows={20}
              placeholder="Things to fix before approval…"
              className="mt-2 w-full rounded-md border border-border bg-surface-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        {/* Meta */}
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Title</span>
            <input
              name="title"
              defaultValue={b.title}
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 text-xs outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Target keyword</span>
            <input
              name="targetKeyword"
              defaultValue={b.targetKeyword ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">Assignee</span>
            <select
              name="assigneeId"
              defaultValue={b.assigneeId ?? "none"}
              className="mt-1 w-full rounded-md border border-border bg-surface-soft px-2 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="none">Unassigned</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            Save changes
          </button>
        </div>
      </form>

      {/* Transition log */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="">Activity</h3>
        {log.length === 0 ? (
          <p className="mt-1 text-xs text-text-faint">No transitions yet.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {[...log].reverse().map((t, i) => {
              const u = t.by ? userById.get(t.by) : null;
              return (
                <li key={`${t.at}-${i}`} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-xs">
                  <span>
                    <span className="font-mono text-text-faint">{t.from}</span>
                    <span className="mx-1 text-text-faint">→</span>
                    <span className="font-mono text-text">{t.to}</span>
                    {t.note ? <span className="ml-2 text-text-muted">— {t.note}</span> : null}
                  </span>
                  <span className="text-xs text-text-faint">
                    {u ? (u.name ?? u.email) : "system"} · {formatRelative(new Date(t.at))}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Danger zone */}
      <form action={deleteBriefAction} className="flex items-center justify-end">
        <input type="hidden" name="id" value={b.id} />
        <button type="submit" className="text-xs text-text-faint hover:text-danger">
          Delete brief
        </button>
      </form>
    </div>
  );
}

/**
 * Critic verdict panel — shows the Haiku confidence score (0-100), the
 * specific issues flagged, last-run timestamp, and a "Run critic" button.
 *
 * Three states:
 *   - never run → amber, "Run critic" button
 *   - ran, ≥70 → green, lists any non-blocking issues
 *   - ran, 50-69 → amber, lists issues
 *   - ran, <50 → red, "blocks brief→drafting transition"
 */
function CriticPanel({
  confidence,
  issues,
  reviewedAt,
  briefId,
}: {
  confidence: number | null;
  issues: string[];
  reviewedAt: Date | null;
  briefId: string;
}) {
  const hasRun = confidence !== null && confidence !== undefined;
  const tone: "neutral" | "success" | "warning" | "danger" = !hasRun
    ? "neutral"
    : confidence >= 70
      ? "success"
      : confidence >= 50
        ? "warning"
        : "danger";
  const wrapClass =
    tone === "success"
      ? "border-success/30 bg-success-tint"
      : tone === "warning"
        ? "border-warning/40 bg-warning-tint"
        : tone === "danger"
          ? "border-danger/40 bg-danger-tint"
          : "border-border bg-surface";

  const stale =
    reviewedAt && Date.now() - new Date(reviewedAt).getTime() > 24 * 60 * 60 * 1000;

  return (
    <section className={`rounded-xl border p-4 ${wrapClass}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-[0.08em] font-semibold text-text-muted">
            Critic verdict
          </p>
          {hasRun ? (
            <p className="text-xs text-text">
              {confidence >= 70
                ? "Brief looks shippable to a writer."
                : confidence >= 50
                  ? "Brief has gaps — clean up before drafting."
                  : "Brief is below ship threshold — drafting is blocked."}
              {stale ? " · Stale (>24h since last review)" : ""}
            </p>
          ) : (
            <p className="text-xs text-text-muted">
              Critic hasn&apos;t reviewed this brief yet. Run it before transitioning.
            </p>
          )}
        </div>
        {hasRun ? (
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-text">
              {confidence}
            </p>
            <p className="text-xs uppercase tracking-[0.08em] text-text-faint">/100</p>
          </div>
        ) : null}
      </div>

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-text">
          {issues.slice(0, 8).map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-text-faint">
          {reviewedAt ? `Last reviewed ${formatRelative(reviewedAt)}` : "Not yet reviewed"}
        </p>
        <form action={runBriefCriticAction}>
          <input type="hidden" name="id" value={briefId} />
          <button
            type="submit"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-accent hover:text-accent"
          >
            {hasRun ? "Re-run critic" : "Run critic"}
          </button>
        </form>
      </div>
    </section>
  );
}
