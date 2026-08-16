import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoProposals, sites } from "@/db/schema";
import { reviewProposalAction } from "@/app/actions/seo-review";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SampleReviewPage({ searchParams }: { searchParams: { ok?: string } }) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const queue = await d
    .select({
      id: seoProposals.id,
      kind: seoProposals.kind,
      payload: seoProposals.payload,
      rationale: seoProposals.rationale,
      criticConfidence: seoProposals.criticConfidence,
      criticIssues: seoProposals.criticIssues,
      appliedAt: seoProposals.appliedAt,
      siteSlug: sites.slug,
      siteName: sites.name,
      siteDomain: sites.domain,
    })
    .from(seoProposals)
    .innerJoin(sites, eq(sites.id, seoProposals.siteId))
    .where(
      and(
        eq(seoProposals.sampleForReview, true),
        isNull(seoProposals.reviewVerdict),
        eq(seoProposals.status, "applied"),
      ),
    )
    .orderBy(desc(seoProposals.appliedAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/seo" className="text-xs text-text-faint hover:text-text">
          ← SEO autopilot
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">
          Sample review
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          A random 10% of auto-applied fixes land here for a quick human gut-check. Thumbs down triggers a rollback and raises the auto-apply confidence threshold for that capability.
        </p>
      </header>

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {{ up: "Marked as good — thanks.", down: "Marked as bad — rollback queued.", skip: "Skipped." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}

      {queue.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-base text-text">Queue is clear</p>
          <p className="mt-1 text-xs text-text-muted">
            No sampled proposals waiting for review. The next batch lands once more fixes are auto-applied.
          </p>
        </div>
      ) : (
        <RowList footer={`${queue.length} item${queue.length === 1 ? "" : "s"} in queue`}>
          {queue.map((p) => {
            const payload = (p.payload ?? {}) as Record<string, unknown>;
            const altText = typeof payload.alt === "string" ? (payload.alt as string) : null;
            const before = typeof payload.before === "string" ? (payload.before as string) : null;
            const after = typeof payload.after === "string" ? (payload.after as string) : null;
            return (
              <Row key={p.id} className="!items-start py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Pill tone="info">{p.kind.replace(/_/g, " ")}</Pill>
                    <span className="text-sm font-medium text-text">{p.siteName}</span>
                    <span className="font-mono text-xs text-text-faint">{p.siteDomain}</span>
                    {p.criticConfidence !== null ? (
                      <Pill tone={p.criticConfidence >= 80 ? "success" : p.criticConfidence >= 60 ? "warning" : "danger"}>
                        critic {p.criticConfidence}
                      </Pill>
                    ) : null}
                    <span className="text-xs text-text-faint">
                      · applied {p.appliedAt ? formatRelative(p.appliedAt) : "—"}
                    </span>
                  </div>
                  {altText ? (
                    <div className="mt-1 text-xs">
                      <span className="text-text-faint">Alt: </span>
                      <span className="text-text">&ldquo;{altText}&rdquo;</span>
                    </div>
                  ) : null}
                  {before && after ? (
                    <div className="mt-1 space-y-0.5 text-xs">
                      <div>
                        <span className="text-text-faint">Before: </span>
                        <span className="text-text-muted line-through">&ldquo;{before}&rdquo;</span>
                      </div>
                      <div>
                        <span className="text-text-faint">After: </span>
                        <span className="text-text">&ldquo;{after}&rdquo;</span>
                      </div>
                    </div>
                  ) : null}
                  {p.criticIssues && p.criticIssues.length > 0 ? (
                    <div className="mt-1 text-xs text-warning">
                      Critic noted: {p.criticIssues.join("; ")}
                    </div>
                  ) : null}
                  {p.rationale ? (
                    <div className="mt-1 text-xs text-text-faint">{p.rationale}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={reviewProposalAction}>
                    <input type="hidden" name="proposalId" value={p.id} />
                    <input type="hidden" name="verdict" value="up" />
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center rounded-md border border-success/40 bg-success-tint px-2.5 text-xs font-medium text-success hover:bg-success/20"
                    >
                      Good ✓
                    </button>
                  </form>
                  <form action={reviewProposalAction}>
                    <input type="hidden" name="proposalId" value={p.id} />
                    <input type="hidden" name="verdict" value="down" />
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center rounded-md border border-danger/40 bg-danger-tint px-2.5 text-xs font-medium text-danger hover:bg-danger/20"
                    >
                      Bad ✕
                    </button>
                  </form>
                  <form action={reviewProposalAction}>
                    <input type="hidden" name="proposalId" value={p.id} />
                    <input type="hidden" name="verdict" value="skip" />
                    <button
                      type="submit"
                      className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-faint hover:bg-surface-2 hover:text-text"
                    >
                      Skip
                    </button>
                  </form>
                </div>
              </Row>
            );
          })}
        </RowList>
      )}
    </div>
  );
}
