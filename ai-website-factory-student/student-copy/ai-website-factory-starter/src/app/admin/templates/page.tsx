import Link from "next/link";
import { aliasedTable, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, taskTemplates, users } from "@/db/schema";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill, Row, RowList, StatusDot } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const assignee = aliasedTable(users, "assignee");
  const rows = await db()
    .select({
      id: taskTemplates.id,
      title: taskTemplates.title,
      cadence: taskTemplates.cadence,
      defaultPriority: taskTemplates.defaultPriority,
      active: taskTemplates.active,
      lastRunAt: taskTemplates.lastRunAt,
      siteSlug: sites.slug,
      assigneeEmail: assignee.email,
    })
    .from(taskTemplates)
    .leftJoin(sites, eq(sites.id, taskTemplates.siteId))
    .leftJoin(assignee, eq(assignee.id, taskTemplates.defaultAssigneeId))
    .orderBy(desc(taskTemplates.active), taskTemplates.title);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tightish text-text">
            Task templates
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
            Recurring playbook tasks. The materializer cron creates a fresh task when one is due.
          </p>
        </div>
        <Link
          href="/admin/templates/new"
          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
        >
          + New template
        </Link>
      </header>

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {{ created: "Template created.", deleted: "Template deleted.", saved: "Saved." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          glyph="inbox"
          title="No templates yet"
          description="Create a template to standardize recurring work like 'Weekly GBP refresh'."
        />
      ) : (
        <RowList footer={`${rows.length} template${rows.length === 1 ? "" : "s"}`}>
          {rows.map((r) => (
            <Row key={r.id} href={`/admin/templates/${r.id}`}>
              <StatusDot tone={r.active ? "success" : "neutral"} />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{r.title}</span>
              <span className="hidden font-mono text-xs text-text-faint sm:inline">
                {r.cadence}
              </span>
              <span className="hidden text-xs text-text-faint md:inline">
                {r.assigneeEmail ?? "unassigned"}
              </span>
              <Pill tone={r.defaultPriority === "urgent" ? "danger" : r.defaultPriority === "high" ? "warning" : "neutral"}>
                {r.defaultPriority}
              </Pill>
              <span className="hidden font-mono text-xs text-text-faint lg:inline">
                {r.siteSlug ?? "any site"}
              </span>
              <span className="tnum w-20 text-right text-xs text-text-faint">
                {r.lastRunAt ? `run ${formatRelative(r.lastRunAt)}` : "never run"}
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </div>
  );
}
