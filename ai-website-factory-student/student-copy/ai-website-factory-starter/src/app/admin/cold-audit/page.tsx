import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { AuditReportingScoutTabs } from "@/components/ui/AuditReportingScoutTabs";
import { ColdAuditForm } from "./ColdAuditForm";

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

function gaugeColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default async function ColdAuditPage() {
  await ensureSchema();
  await requireAdmin();

  const jobs = await db()
    .select()
    .from(claudeJobs)
    .where(eq(claudeJobs.kind, "audit:cold"))
    .orderBy(desc(claudeJobs.createdAt))
    .limit(20);

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Cold Audit"
        subtitle="Run a quick SEO audit on any URL — score technical health, content quality, local SEO, schema, and mobile performance for prospecting and outreach."
      />

      <AuditReportingScoutTabs />

      {/* ── Audit Form ── */}
      <ColdAuditForm />

      {/* ── Past Audit Jobs ── */}
      {jobs.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold text-text">Past Audits</h2>
          <div className="space-y-3">
            {jobs.map((job) => {
              const badge = statusBadge(job.status);
              const input = job.input as Record<string, unknown> | null;
              const output = job.output as Record<string, unknown> | null;
              const url = (input?.url as string) ?? "—";
              const overallScore = output?.overallScore as number | undefined;

              return (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-4 py-3"
                >
                  {/* Status badge */}
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>

                  {/* URL + details */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{url}</p>
                    <p className="text-xs text-text-faint">
                      {job.createdAt
                        ? new Date(job.createdAt).toLocaleString()
                        : "—"}
                    </p>
                  </div>

                  {/* Score (done jobs) */}
                  {job.status === "done" && overallScore != null && (
                    <div className="flex items-center gap-2">
                      <div className="relative flex h-10 w-10 items-center justify-center">
                        <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            fill="none"
                            stroke="var(--surface-2)"
                            strokeWidth="3"
                          />
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            fill="none"
                            stroke={gaugeColor(overallScore)}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${(overallScore / 100) * 2 * Math.PI * 16} ${2 * Math.PI * 16}`}
                          />
                        </svg>
                        <span
                          className="absolute text-xs font-bold"
                          style={{ color: gaugeColor(overallScore) }}
                        >
                          {overallScore}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Spinner for pending/running */}
                  {(job.status === "pending" || job.status === "running" || job.status === "claimed") && (
                    <div
                      className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                      style={{ color: "var(--info)" }}
                    />
                  )}

                  {/* Error for failed jobs */}
                  {job.status === "failed" && job.error && (
                    <p
                      className="max-w-[200px] truncate text-xs"
                      style={{ color: "var(--danger)" }}
                      title={job.error}
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
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-muted">
            No audits yet. Enter a URL above to queue your first cold audit.
          </p>
        </div>
      )}
    </div>
  );
}
