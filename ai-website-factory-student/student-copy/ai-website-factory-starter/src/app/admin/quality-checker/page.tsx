import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContentScoutTabs } from "@/components/ui/ContentScoutTabs";
import { QualityCheckForm } from "./QualityCheckForm";

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

function scoreColor(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default async function QualityCheckerPage() {
  await ensureSchema();
  await requireAdmin();

  const jobs = await db()
    .select()
    .from(claudeJobs)
    .where(eq(claudeJobs.kind, "quality:check"))
    .orderBy(desc(claudeJobs.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Quality Checker"
        subtitle="Analyze any URL for content quality — EEAT, semantic depth, GEO readiness, topical coverage, local signals, and readability scoring."
      />

      <ContentScoutTabs />

      {/* ── Quality Check Form ── */}
      <QualityCheckForm />

      {/* ── Past Quality Check Jobs ── */}
      {jobs.length > 0 && (
        <section className="rounded-xl border border-border bg-surface px-5 py-4">
          <h2 className="mb-4 text-sm font-medium text-text">Past Quality Checks</h2>
          <div className="space-y-3">
            {jobs.map((job) => {
              const badge = statusBadge(job.status);
              const input = job.input as Record<string, unknown> | null;
              const output = job.output as Record<string, unknown> | null;
              const url = (input?.url as string) ?? "—";
              const overallScore = output?.overallScore as number | undefined;
              const metrics = output?.metrics as Array<{ label: string; score: number }> | undefined;

              return (
                <div
                  key={job.id}
                  className="rounded-lg border border-border p-4"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div className="flex items-center gap-3">
                    {/* Status badge */}
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>

                    {/* URL */}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {url}
                    </p>

                    {/* Spinner for pending/running */}
                    {(job.status === "pending" || job.status === "running" || job.status === "claimed") && (
                      <div
                        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                        style={{ color: "var(--info)" }}
                      />
                    )}

                    {/* Overall score for done jobs */}
                    {job.status === "done" && overallScore != null && (
                      <span
                        className="text-lg font-medium tabular-nums"
                        style={{ color: scoreColor(overallScore) }}
                      >
                        {overallScore}
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <p className="mt-1 text-xs text-text-faint">
                    {job.createdAt
                      ? new Date(job.createdAt).toLocaleString()
                      : "—"}
                  </p>

                  {/* Metric bars for done jobs */}
                  {job.status === "done" && metrics && metrics.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {metrics.map((m) => (
                        <div key={m.label} className="rounded-md bg-surface p-2">
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-xs text-text-faint">{m.label}</span>
                            <span
                              className="text-xs font-medium tabular-nums"
                              style={{ color: scoreColor(m.score) }}
                            >
                              {m.score}
                            </span>
                          </div>
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${m.score}%`,
                                background: scoreColor(m.score),
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

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
            No quality checks yet. Enter a URL above to queue your first analysis.
          </p>
        </div>
      )}
    </div>
  );
}
