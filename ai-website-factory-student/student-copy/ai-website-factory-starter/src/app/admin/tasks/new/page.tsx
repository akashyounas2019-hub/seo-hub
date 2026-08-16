import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/db/client";
import {
  createTaskAction,
  getAssignableUsersForSite,
  getCreatableSites,
} from "@/app/actions/tasks";
import { requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: { site?: string; error?: string };
}) {
  await ensureSchema();
  const user = await requireUser();
  if (user.role === "student") redirect("/admin/tasks?error=forbidden");

  const sitesList = await getCreatableSites();
  if (sitesList.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium tracking-tightish text-text">New task</h1>
        <p className="text-sm text-text-muted">You have no sites you can create tasks for.</p>
      </div>
    );
  }

  const defaultSiteId =
    sitesList.find((s) => s.slug === searchParams.site)?.id ?? sitesList[0].id;
  const assignees = await getAssignableUsersForSite(defaultSiteId);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/admin/tasks" className="text-xs text-text-muted hover:text-text">
          ← Tasks
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">New task</h1>
      </div>

      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Could not create the task — check the input.
        </div>
      ) : null}

      <form
        action={createTaskAction}
        className="space-y-4 rounded-xl border border-border bg-surface p-6"
      >
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
            Site
          </span>
          <select
            name="siteId"
            defaultValue={defaultSiteId}
            required
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {sitesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slug} — {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
            Title
          </span>
          <input
            name="title"
            required
            placeholder="Update GBP services list for July"
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
            placeholder="What needs doing, acceptance criteria, links to relevant pages."
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
              defaultValue="normal"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              Due (optional)
            </span>
            <input
              type="datetime-local"
              name="dueAt"
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
            defaultValue=""
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="">— unassigned —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email} ({a.role})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-text-faint">
            Shows admins + people assigned to the selected site. Switching site requires a page
            refresh to update this list (v0.2 enhancement).
          </span>
        </label>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/tasks"
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}
