import Link from "next/link";
import { ensureSchema } from "@/db/client";
import { createUserAction, inviteUserAction } from "@/app/actions/users";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Two-mode create-user flow:
 *   1. (default) Send invite link — admin emails the URL to the new user,
 *      who sets their own password. No password ever crosses admin hands.
 *   2. Set initial password manually — legacy path, kept for offline scenarios.
 *
 * Mode is selected via the `mode` query param (`invite` | `manual`) so the
 * server renders the right form without JS.
 */
export default async function NewUserPage({
  searchParams,
}: {
  searchParams: { error?: string; mode?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const mode = searchParams.mode === "manual" ? "manual" : "invite";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/admin/users" className="text-xs text-text-faint hover:text-text-muted">
          ← Users
        </Link>
        <h1 className="text-2xl font-medium tracking-tightish text-text">
          New user
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          Add an admin, manager, or student. Site assignments happen on the user&apos;s detail page.
        </p>
      </div>

      {/* Mode picker — server-rendered tabs via querystring */}
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-1">
        <ModeTab href="/admin/users/new?mode=invite" active={mode === "invite"} title="Send invite link" hint="Recommended" />
        <ModeTab href="/admin/users/new?mode=manual" active={mode === "manual"} title="Set password manually" hint="Offline only" />
      </div>

      {searchParams.error === "invalid" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          Check the input — email is required{mode === "manual" ? ", password must be 8+ chars" : ""}, role must be admin/manager/student.
        </div>
      ) : null}
      {searchParams.error === "exists" ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          A user with that email already exists.
        </div>
      ) : null}

      {mode === "invite" ? (
        <form
          action={inviteUserAction}
          className="space-y-4 rounded-lg border border-border bg-surface p-6"
        >
          <Field label="Email" name="email" type="email" required autoComplete="off" />
          <Field label="Name (optional)" name="name" type="text" autoComplete="off" />
          <RoleSelect />
          <p className="rounded-md border border-info/30 bg-info-tint px-3 py-2 text-xs text-info">
            We&apos;ll generate a single-use link valid for 48 hours. Copy it from the next page and
            send it to the new user — they pick their own password.
          </p>
          <Actions submit="Generate invite link" />
        </form>
      ) : (
        <form
          action={createUserAction}
          className="space-y-4 rounded-lg border border-border bg-surface p-6"
        >
          <Field label="Email" name="email" type="email" required autoComplete="off" />
          <Field label="Name (optional)" name="name" type="text" autoComplete="off" />
          <Field
            label="Initial password (8+ chars)"
            name="password"
            type="text"
            required
            autoComplete="off"
            hint="The user can change this later. Store it securely until then."
          />
          <RoleSelect />
          <Actions submit="Create user" />
        </form>
      )}
    </div>
  );
}

function ModeTab({
  href,
  active,
  title,
  hint,
}: {
  href: string;
  active: boolean;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-start rounded-md px-3 py-2 text-left transition-colors ${
        active
          ? "bg-surface-2 text-text shadow-xs"
          : "text-text-muted hover:bg-surface-2/60 hover:text-text"
      }`}
    >
      <span className="text-xs font-medium">{title}</span>
      <span className="text-xs uppercase tracking-wider text-text-faint">{hint}</span>
    </Link>
  );
}

function RoleSelect() {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
        Role
      </span>
      <select
        name="role"
        defaultValue="student"
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <option value="student">student — does the work</option>
        <option value="manager">manager — assigns tasks within their sites</option>
        <option value="admin">admin — full access</option>
      </select>
    </label>
  );
}

function Actions({ submit }: { submit: string }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <Link
        href="/admin/users"
        className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text"
      >
        Cancel
      </Link>
      <button
        type="submit"
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
      >
        {submit}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  ...input
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
        {label}
      </span>
      <input
        {...input}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      {hint ? <span className="mt-1 block text-xs text-text-faint">{hint}</span> : null}
    </label>
  );
}
