import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { inviteTokens, users } from "@/db/schema";
import { acceptInviteAction } from "@/app/actions/users";

export const dynamic = "force-dynamic";

export default async function OnboardPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  await ensureSchema();

  // Look up the token (sha256-hashed). The raw token only lives in the URL.
  const tokenHash = createHash("sha256").update(params.token).digest("hex");
  const [invite] = await db()
    .select({
      tokenHash: inviteTokens.tokenHash,
      userId: inviteTokens.userId,
      expiresAt: inviteTokens.expiresAt,
      consumedAt: inviteTokens.consumedAt,
    })
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.tokenHash, tokenHash),
        isNull(inviteTokens.consumedAt),
        gt(inviteTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite) {
    return (
      <InviteShell>
        <h1 className="text-2xl font-semibold tracking-tightish text-text">Invite expired</h1>
        <p className="mt-2 text-sm text-text-muted">
          This invite link is no longer valid. It may have been used already, or it expired after 48
          hours. Ask the admin to send a fresh invite from the Users page.
        </p>
      </InviteShell>
    );
  }

  const [user] = await db().select().from(users).where(eq(users.id, invite.userId)).limit(1);
  if (!user) redirect("/login");

  const errorMsg =
    searchParams.error === "pw-short"
      ? "Password must be at least 8 characters."
      : searchParams.error === "pw-mismatch"
        ? "Passwords don't match."
        : searchParams.error === "invalid"
          ? "That invite is no longer valid."
          : null;

  // Server action wrapper binds the URL token to the action.
  async function submit(formData: FormData) {
    "use server";
    await acceptInviteAction(params.token, formData);
  }

  return (
    <InviteShell>
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-tint/60 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
          You&apos;re invited
        </span>
        <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tightish text-text">
          Welcome to SEO RankPilot
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Set a password to finish creating your account. You&apos;ll be signed in right after.
        </p>
      </header>

      {errorMsg ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {errorMsg}
        </div>
      ) : null}

      <form action={submit} className="space-y-4" autoComplete="off">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Your email
          </span>
          <input
            type="email"
            value={user.email}
            readOnly
            className="mt-1.5 w-full cursor-not-allowed rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-muted"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Choose a password (8+ chars)
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-xs transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Confirm password
          </span>
          <input
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-xs transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface shadow-sm transition-colors hover:bg-accent-hover"
        >
          Set password &amp; sign in
        </button>

        <p className="border-t border-border pt-3 text-center text-xs text-text-faint">
          This invite expires {invite.expiresAt.toLocaleString()}.
        </p>
      </form>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6 py-12">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent text-xs font-semibold uppercase tracking-wider text-surface">
            GYL
          </span>
          <span className="text-sm font-medium tracking-tightish text-text">
            SEO RankPilot
          </span>
        </div>
        <div className="space-y-5 rounded-lg border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
