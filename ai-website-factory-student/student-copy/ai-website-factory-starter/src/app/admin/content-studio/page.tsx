import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContentScoutTabs } from "@/components/ui/ContentScoutTabs";
import { ContentForm } from "./ContentForm";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "done":
      return { bg: "var(--success-tint)", color: "var(--success)", label: "Done" };
    case "failed":
    case "cancelled":
      return { bg: "var(--danger-tint)", color: "var(--danger)", label: status === "failed" ? "Failed" : "Cancelled" };
    case "running":
    case "claimed":
      return { bg: "var(--info-tint)", color: "var(--info)", label: "Running" };
    default:
      return { bg: "var(--warning-tint)", color: "var(--warning)", label: "Pending" };
  }
}

export default async function ContentStudioPage() {
  await ensureSchema();
  await requireAdmin();

  // Load sites for the dropdown
  const allSites = await db()
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .orderBy(sites.name);

  // Load past content jobs
  const jobs = await db()
    .select()
    .from(claudeJobs)
    .where(eq(claudeJobs.kind, "content:write"))
    .orderBy(desc(claudeJobs.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Content Studio"
        subtitle="Full AI content pipeline — from keyword to published page. Auto-write SEO-optimized service pages with NLP entity targeting."
      />

      <ContentScoutTabs />

      {/* ── Content Generation Form ── */}
      <ContentForm sites={allSites} />

      {/* ── Past Content Jobs ── */}
      {jobs.length > 0 && (
        <section className="rounded-xl border border-border bg-surface px-5 py-4">
          <h2 className="mb-4 text-sm font-medium text-text">Content Jobs</h2>
          <div className="space-y-3">
            {jobs.map((job) => {
              const badge = statusBadge(job.status);
              const input = job.input as Record<string, unknown> | null;
              const output = job.output as Record<string, unknown> | null;
              const keyword = (input?.keyword as string) ?? "—";
              const wordCount = output?.wordCount as number | undefined;

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-text">{keyword}</h3>
                      <p className="mt-0.5 text-xs text-text-faint">
                        {job.title}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-text-faint">
                    {/* Word count for done jobs */}
                    {job.status === "done" && wordCount != null && (
                      <span>{wordCount.toLocaleString()} words</span>
                    )}
                    <span>
                      {job.createdAt
                        ? new Date(job.createdAt).toLocaleDateString()
                        : "—"}
                    </span>

                    {/* Spinner for pending/running */}
                    {(job.status === "pending" || job.status === "running" || job.status === "claimed") && (
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        style={{ color: "var(--info)" }}
                      />
                    )}
                  </div>

                  {/* Error for failed jobs */}
                  {job.status === "failed" && job.error && (
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--danger)" }}
                    >
                      {job.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            No content jobs yet. Enter a keyword and select a site above to queue your first content generation.
          </p>
        </div>
      )}
    </div>
  );
}
