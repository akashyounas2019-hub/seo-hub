import Link from "next/link";
import { db, ensureSchema } from "@/db/client";
import { sites, users } from "@/db/schema";
import { createTemplateAction } from "@/app/actions/templates";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [siteRows, userRows] = await Promise.all([
    db().select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites).orderBy(sites.slug),
    db().select({ id: users.id, email: users.email, role: users.role }).from(users).orderBy(users.email),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/admin/templates" className="text-xs text-text-faint hover:text-text-muted">
          ← Templates
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">
          New template
        </h1>
      </div>

      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Could not save — check the title and priority.
        </div>
      ) : null}

      <form
        action={createTemplateAction}
        className="space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <Field label="Title">
          <input
            name="title"
            required
            placeholder="Weekly GBP refresh"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cadence" hint="weekly · monthly · every 2 weeks · every 10 days">
            <input
              name="cadence"
              required
              defaultValue="weekly"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="Default priority">
            <select
              name="defaultPriority"
              defaultValue="normal"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </Field>
        </div>
        <Field label="Site" hint="Required to materialize tasks automatically.">
          <select
            name="siteId"
            defaultValue=""
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">— any (template only) —</option>
            {siteRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slug} — {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default assignee">
          <select
            name="defaultAssigneeId"
            defaultValue=""
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">— unassigned —</option>
            {userRows.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} ({u.role})
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" name="active" defaultChecked className="accent-accent" />
          <span>Active (materializer will pick this up)</span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/admin/templates"
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Create template
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.06em] text-text-faint">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}
