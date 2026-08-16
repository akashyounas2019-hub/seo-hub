import Link from "next/link";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sessions, userPrefs } from "@/db/schema";
import {
  changeMyPasswordAction,
  revokeOtherSessionsAction,
  updateMyPrefsAction,
  updateMyProfileAction,
} from "@/app/actions/me";
import { Pill } from "@/components/ui/Row";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/auth";
import { requireUser } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Common timezones shown first in the picker — the platform runs in Dubai,
// so Asia/Dubai is the sensible default. Anything else is typed as a
// free-form IANA string.
const COMMON_TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Europe/London",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
];

export default async function MeSettingsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  await ensureSchema();
  const me = await requireUser();
  const d = db();

  const [prefs] = await d.select().from(userPrefs).where(eq(userPrefs.userId, me.id)).limit(1);

  const mySessions = await d
    .select({
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, me.id))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);

  const currentToken = cookies().get(SESSION_COOKIE)?.value ?? null;
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;

  const flash = flashMsg(searchParams);

  return (
    <div className="space-y-7">
      <header>
        <Link
          href="/admin/me"
          className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text-muted"
        >
          ← My day
        </Link>
        <h1 className="">
          Settings
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-text-muted">
          Manage your profile, password, active sessions, and notifications.
        </p>
      </header>

      {flash ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            flash.kind === "ok"
              ? "border-success/30 bg-success-tint text-success"
              : "border-danger/30 bg-danger-tint text-danger"
          }`}
        >
          {flash.msg}
        </div>
      ) : null}

      {/* ===== Profile ===== */}
      <Section title="Profile" hint="Name + timezone show up in the chat assistant, daily digests, and audit log.">
        <form action={updateMyProfileAction} className="space-y-4">
          <Field label="Name">
            <input
              name="name"
              defaultValue={me.name ?? ""}
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="Email" hint="Email is your sign-in identity — ask an admin to change it.">
            <input
              type="email"
              value={me.email}
              readOnly
              className="w-full cursor-not-allowed rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-muted"
            />
          </Field>
          <Field label="Timezone">
            <select
              name="timezone"
              defaultValue={prefs?.timezone ?? ""}
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="">— not set —</option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Submit>Save profile</Submit>
        </form>
      </Section>

      {/* ===== Password ===== */}
      <Section title="Password" hint="Changing your password revokes every other session — your current one stays signed in.">
        <form action={changeMyPasswordAction} className="space-y-4" autoComplete="off">
          <Field label="Current password">
            <input
              type="password"
              name="current"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="New password (8+ chars)">
            <input
              type="password"
              name="next"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Submit>Change password</Submit>
        </form>
      </Section>

      {/* ===== Sessions ===== */}
      <Section
        title="Active sessions"
        hint="Each row is a browser or device signed in as you. Token hashes are never displayed."
      >
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-[0.06em] text-text-faint">
              <tr>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">User agent</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {mySessions.map((s) => {
                const isCurrent = currentHash === s.tokenHash;
                return (
                  <tr key={s.tokenHash} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-text-muted">{formatRelative(s.createdAt)}</td>
                    <td className="px-3 py-2 text-text-muted">{formatRelative(s.lastSeenAt)}</td>
                    <td className="px-3 py-2 truncate font-mono text-xs text-text-faint">
                      {s.userAgent?.slice(0, 60) ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-faint">{s.ip ?? "—"}</td>
                    <td className="px-3 py-2 text-text-faint">{formatRelative(s.expiresAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {isCurrent ? <Pill tone="success">current</Pill> : <Pill tone="neutral">other</Pill>}
                    </td>
                  </tr>
                );
              })}
              {mySessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-text-faint">
                    No active sessions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {mySessions.length > 1 ? (
          <form action={revokeOtherSessionsAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
            >
              Log out all other sessions
            </button>
          </form>
        ) : null}
      </Section>

      {/* ===== Notification preferences ===== */}
      <Section
        title="Notification preferences"
        hint="Email channels apply only when SMTP is configured on the org settings page. In-app notifications always fire."
      >
        <form action={updateMyPrefsAction} className="space-y-4">
          <Toggle
            name="emailOnTaskAssigned"
            label="Task assigned to me"
            hint="Email me when an admin or manager assigns a task to me."
            defaultChecked={prefs?.emailOnTaskAssigned ?? true}
          />
          <Toggle
            name="emailOnTaskComment"
            label="New comment on my task"
            hint="Email me when someone else comments on a task I own."
            defaultChecked={prefs?.emailOnTaskComment ?? true}
          />
          <Toggle
            name="emailOnLeadAssigned"
            label="Lead assigned to me"
            hint="Email me when a lead lands in a site I work on."
            defaultChecked={prefs?.emailOnLeadAssigned ?? true}
          />
          <Toggle
            name="emailOnDailyDigest"
            label="Daily digest"
            hint="Get the morning summary in your inbox in addition to the notifications bell."
            defaultChecked={prefs?.emailOnDailyDigest ?? true}
          />
          <Toggle
            name="emailOnAiFlag"
            label="AI flag on my work"
            hint="Email me when the audit agent flags one of my tasks."
            defaultChecked={prefs?.emailOnAiFlag ?? true}
          />
          <Field
            label="Digest webhook URL (optional)"
            hint="Will POST your daily digest as JSON. Must start with https://"
          >
            <input
              type="url"
              name="digestWebhookUrl"
              defaultValue={prefs?.digestWebhookUrl ?? ""}
              placeholder="https://hooks.example.com/..."
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Submit>Save preferences</Submit>
        </form>
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-xs text-text-faint">{hint}</p> : null}
      </div>
      {children}
    </section>
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

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-text">{label}</span>
        {hint ? <span className="block text-xs text-text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
    >
      {children}
    </button>
  );
}

function flashMsg(sp: { ok?: string; error?: string }): { kind: "ok" | "error"; msg: string } | null {
  if (sp.ok === "profile") return { kind: "ok", msg: "Profile saved." };
  if (sp.ok === "password") return { kind: "ok", msg: "Password changed. Other sessions revoked." };
  if (sp.ok === "sessions") return { kind: "ok", msg: "Other sessions revoked." };
  if (sp.ok === "prefs") return { kind: "ok", msg: "Preferences saved." };
  if (sp.error === "pw-wrong") return { kind: "error", msg: "Current password is incorrect." };
  if (sp.error === "pw-short") return { kind: "error", msg: "New password must be at least 8 characters." };
  if (sp.error === "pw-mismatch") return { kind: "error", msg: "New password and confirmation don't match." };
  if (sp.error === "webhook-https") return { kind: "error", msg: "Webhook URL must use https://" };
  return null;
}
