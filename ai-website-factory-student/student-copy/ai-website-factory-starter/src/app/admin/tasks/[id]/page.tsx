import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { aliasedTable, asc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, taskComments, tasks, users } from "@/db/schema";
import {
  addTaskCommentAction,
  deleteTaskAction,
  getAssignableUsersForSite,
  updateTaskAction,
  updateTaskStatusAction,
} from "@/app/actions/tasks";
import { getVisibility } from "@/lib/permissions";
import { requireUser } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["todo", "in_progress", "in_review", "blocked", "done", "cancelled"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  const user = await requireUser();
  const visibility = await getVisibility(user);

  const assignee = aliasedTable(users, "assignee");
  const creator = aliasedTable(users, "creator");

  const [row] = await db()
    .select({
      task: tasks,
      siteSlug: sites.slug,
      siteName: sites.name,
      siteCity: sites.city,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      creatorEmail: creator.email,
      creatorName: creator.name,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(creator, eq(creator.id, tasks.creatorId))
    .where(eq(tasks.id, params.id))
    .limit(1);

  if (!row) notFound();
  if (visibility.kind === "scoped" && !visibility.siteIds.includes(row.task.siteId)) {
    redirect("/admin/tasks?error=forbidden");
  }

  const task = row.task;
  const assignableList = await getAssignableUsersForSite(task.siteId);

  const commentAuthor = aliasedTable(users, "author");
  const comments = await db()
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      authorEmail: commentAuthor.email,
      authorName: commentAuthor.name,
    })
    .from(taskComments)
    .leftJoin(commentAuthor, eq(commentAuthor.id, taskComments.authorId))
    .where(eq(taskComments.taskId, task.id))
    .orderBy(asc(taskComments.createdAt));

  const canEdit = user.role !== "student";
  const canDelete = user.role === "admin";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/tasks" className="text-xs text-text-muted hover:text-text">
          ← Tasks
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">{task.title}</h1>
        <p className="mt-1 text-xs text-text-muted">
          On{" "}
          <Link href={`/admin/sites/${row.siteSlug}`} className="font-mono text-accent hover:underline">
            {row.siteSlug}
          </Link>{" "}
          · created {formatRelative(task.createdAt)}
          {row.creatorEmail ? ` by ${row.creatorName ?? row.creatorEmail}` : ""}
        </p>
      </div>

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {searchParams.ok === "status" ? "Status updated." : "Saved."}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {searchParams.error}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <section className="space-y-6 md:col-span-2">
          {task.description ? (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Description
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {task.description}
              </p>
            </div>
          ) : null}

          {canEdit ? (
            <form
              action={updateTaskAction.bind(null, task.id)}
              className="space-y-4 rounded-xl border border-border bg-surface p-5"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Edit</h2>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                  Title
                </span>
                <input
                  name="title"
                  defaultValue={task.title}
                  required
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                  Description
                </span>
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={task.description ?? ""}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                    Priority
                  </span>
                  <select
                    name="priority"
                    defaultValue={task.priority}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                    Due
                  </span>
                  <input
                    type="datetime-local"
                    name="dueAt"
                    defaultValue={
                      task.dueAt
                        ? new Date(task.dueAt.getTime() - task.dueAt.getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                  Assignee
                </span>
                <select
                  name="assigneeId"
                  defaultValue={task.assigneeId ?? ""}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">— unassigned —</option>
                  {assignableList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
                >
                  Save
                </button>
              </div>
            </form>
          ) : null}

          <div id="comments" className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Comments ({comments.length})
            </h2>
            <ul className="mt-3 space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="text-xs text-text-muted">
                    <span className="font-mono">{c.authorEmail ?? "deleted user"}</span>
                    {" · "}
                    {formatRelative(c.createdAt)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
            <form action={addTaskCommentAction.bind(null, task.id)} className="mt-4 space-y-2">
              <textarea
                name="body"
                rows={3}
                required
                placeholder="Add a comment…"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
                >
                  Post
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="space-y-6">
          <form
            action={updateTaskStatusAction.bind(null, task.id)}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Status</h2>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {STATUSES.map((st) => (
                <label
                  key={st}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    task.status === st
                      ? "border-accent bg-accent/[0.06]"
                      : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={st}
                    defaultChecked={task.status === st}
                    className="accent-accent"
                  />
                  <span className="font-mono text-xs uppercase tracking-wide">
                    {st.replace("_", " ")}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="mt-3 w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
            >
              Update status
            </button>
          </form>

          <div className="rounded-xl border border-border bg-surface p-5 text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Meta</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Assignee" value={row.assigneeEmail ?? "unassigned"} />
              <Row label="Priority" value={task.priority} />
              <Row label="Due" value={task.dueAt ? task.dueAt.toISOString().slice(0, 16).replace("T", " ") : "—"} />
              <Row
                label="Completed"
                value={task.completedAt ? formatRelative(task.completedAt) : "—"}
              />
              <Row label="Updated" value={formatRelative(task.updatedAt)} />
            </dl>
          </div>

          {canDelete ? (
            <form
              action={deleteTaskAction.bind(null, task.id)}
              className="rounded-xl border border-danger/30 bg-danger-tint p-5"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">
                Danger zone
              </h2>
              <p className="mt-2 text-xs text-danger/80">
                Permanently delete this task and its comments.
              </p>
              <button
                type="submit"
                className="mt-3 rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint"
              >
                Delete task
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-text">{value}</dd>
    </div>
  );
}
