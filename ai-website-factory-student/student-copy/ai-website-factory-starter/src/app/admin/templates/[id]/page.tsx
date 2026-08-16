import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, taskTemplates, users } from "@/db/schema";
import {
  deleteTemplateAction,
  runTemplateNowAction,
  updateTemplateAction,
} from "@/app/actions/templates";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const [tmpl] = await db().select().from(taskTemplates).where(eq(taskTemplates.id, params.id)).limit(1);
  if (!tmpl) notFound();

  const [siteRows, userRows] = await Promise.all([
    db().select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites).orderBy(sites.slug),
    db().select({ id: users.id, email: users.email, role: users.role }).from(users).orderBy(users.email),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/templates" className="text-xs text-text-faint hover:text-text-muted">
          ← Templates
        </Link>
        <h1 className="mt-1 text-2xl sm:text-2xl font-medium tracking-tightish text-text">
          {tmpl.title}
        </h1>
        <p className="mt-1 text-xs text-text-faint">
          {tmpl.lastRunAt ? `Last materialized ${formatRelative(tmpl.lastRunAt)}` : "Never materialized"}
        </p>
      </div>

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {{ saved: "Template saved.", created: "Template created." }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {searchParams.error === "no-site" ? "Assign a site before running this template." : searchParams.error}
        </div>
      ) : null}

      <form
        action={updateTemplateAction.bind(null, tmpl.id)}
        className="space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <Field label="Title">
          <input
            name="title"
            required
            defaultValue={tmpl.title}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            defaultValue={tmpl.description ?? ""}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cadence">
            <input
              name="cadence"
              required
              defaultValue={tmpl.cadence}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="Default priority">
            <select
              name="defaultPriority"
              defaultValue={tmpl.defaultPriority}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </Field>
        </div>
        <Field label="Site">
          <select
            name="siteId"
            defaultValue={tmpl.siteId ?? ""}
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
            defaultValue={tmpl.defaultAssigneeId ?? ""}
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
          <input type="checkbox" name="active" defaultChecked={tmpl.active} className="accent-accent" />
          <span>Active</span>
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <form
          action={runTemplateNowAction.bind(null, tmpl.id)}
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Run now</h2>
          <p className="mt-2 text-xs text-text-muted">
            Materialize a single task from this template right now.
          </p>
          <button
            type="submit"
            className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
          >
            Run now
          </button>
        </form>

        <form
          action={deleteTemplateAction.bind(null, tmpl.id)}
          className="rounded-lg border border-danger/30 bg-danger-tint/40 p-5"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-danger">Danger zone</h2>
          <p className="mt-2 text-xs text-text-muted">
            Delete this template. Already-materialized tasks stay in place.
          </p>
          <button
            type="submit"
            className="mt-3 rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint"
          >
            Delete template
          </button>
        </form>
      </div>
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
