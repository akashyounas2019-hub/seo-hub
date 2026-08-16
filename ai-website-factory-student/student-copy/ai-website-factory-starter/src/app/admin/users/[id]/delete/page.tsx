import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteUserAction, previewUserDeleteImpact } from "@/app/actions/users";
import { Pill } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function DeleteUserPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  await ensureSchema();
  const me = await requireAdmin();

  if (params.id === me.id) redirect("/admin/users?error=self-delete");

  let impact: Awaited<ReturnType<typeof previewUserDeleteImpact>>;
  try {
    impact = await previewUserDeleteImpact(params.id);
  } catch {
    notFound();
  }

  const errorMsg =
    searchParams.error === "mismatch"
      ? "The email you typed doesn't match. Try again."
      : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href={`/admin/users/${params.id}`}
        className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text-muted"
      >
        ← Back to user
      </Link>

      <header>
        <h1 className="text-2xl font-medium tracking-tightish text-danger">
          Delete user?
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          This is permanent. Sessions are revoked immediately. Audit-log entries this user created
          stay (denormalized) but the user row goes away.
        </p>
      </header>

      <section className="rounded-lg border border-danger/30 bg-danger-tint/40 p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-medium text-text">{impact.email}</h2>
          <Pill tone={impact.role === "admin" ? "danger" : impact.role === "manager" ? "warning" : "info"}>
            {impact.role}
          </Pill>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          We&apos;ll unassign their open tasks (they stay in the system, just unowned) and remove
          every site membership they hold.
        </p>
      </section>

      <StatStrip columns={3}>
        <Stat
          label="Open tasks → unassigned"
          value={impact.openTasks}
          tone={impact.openTasks > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Site memberships removed"
          value={impact.siteCount}
          tone={impact.siteCount > 0 ? "info" : "neutral"}
        />
        <Stat
          label="Last admin?"
          value={impact.isLastAdmin ? "Yes — blocked" : "No"}
          tone={impact.isLastAdmin ? "danger" : "success"}
        />
      </StatStrip>

      {impact.isLastAdmin ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint p-4 text-xs text-danger">
          This is the only remaining admin account. Promote another user to <code>admin</code> first
          — otherwise nobody can manage the platform after the delete.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {errorMsg}
        </div>
      ) : null}

      <form
        action={deleteUserAction.bind(null, params.id)}
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
      >
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Type <span className="font-mono text-text">{impact.email}</span> to confirm
          </span>
          <input
            type="text"
            name="confirmEmail"
            required
            autoComplete="off"
            disabled={impact.isLastAdmin}
            placeholder={impact.email}
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 disabled:opacity-50"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/users/${params.id}`}
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={impact.isLastAdmin}
            className="rounded-md border border-danger/40 bg-danger px-3 py-1.5 text-xs font-medium text-brand-ivory shadow-sm hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete user permanently
          </button>
        </div>
      </form>
    </div>
  );
}
