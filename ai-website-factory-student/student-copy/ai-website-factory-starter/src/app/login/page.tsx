import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { checkLoginRate, recordLoginFailure, recordLoginSuccess } from "@/lib/rate-limit";
import { getCurrentUser, sessionCookieOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function forgotPasswordEmail(): string {
  // Try to derive admin@<host> from PUBLIC_BASE_URL; fall back to the default brand email.
  const raw = process.env.PUBLIC_BASE_URL;
  if (raw) {
    try {
      const host = new URL(raw).hostname.replace(/^www\./, "");
      if (host && host !== "localhost") return `admin@${host}`;
    } catch {
      // ignore
    }
  }
  return "admin@example.com";
}

async function loginAction(formData: FormData) {
  "use server";
  await ensureSchema();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const h = headers();
  const userAgent = h.get("user-agent");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  // Rate limit BEFORE running scrypt so an attacker can't burn CPU.
  const rate = checkLoginRate(email, ip);
  if (!rate.ok) {
    redirect(`/login?error=throttled&retry=${rate.retryAfterSec}`);
  }

  const [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  // Always await verifyPassword so timing is constant even when no user row exists.
  // (verifyPassword runs a dummy scrypt for null/missing hashes.)
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) {
    recordLoginFailure(email, ip);
    redirect("/login?error=invalid");
  }

  recordLoginSuccess(email, ip);

  const { token, expiresAt } = await createSession(user.id, { userAgent, ip });
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  cookies().set({ ...sessionCookieOptions(expiresAt), value: token });

  redirect(user.role === "admin" ? "/admin/dashboard-overview" : "/admin/me");
}

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; retry?: string } }) {
  const existing = await getCurrentUser();
  if (existing) redirect(existing.role === "admin" ? "/admin/dashboard-overview" : "/admin/me");

  const errorMsg =
    searchParams.error === "invalid"
      ? "Email or password is incorrect."
      : searchParams.error === "missing"
        ? "Email and password are required."
        : searchParams.error === "throttled"
          ? `Too many attempts. Try again in ${searchParams.retry ?? "a few minutes"}s.`
          : null;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
      {/* Brand panel */}
      <aside className="hidden flex-col justify-between border-r border-border bg-surface px-12 py-10 lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent text-xs font-semibold uppercase tracking-wider text-surface">
            GYL
          </span>
          <span className="text-sm font-medium tracking-tightish text-text">
            SEO RankPilot
          </span>
        </div>

        <div className="space-y-6 max-w-md">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tightish text-text">
            One console for{" "}
            <span className="text-text-faint">leads</span>,{" "}
            <span className="text-text-faint">tasks</span>,{" "}
            <span className="text-text-faint">calls</span>, and the team that runs them.
          </h2>
          <p className="text-sm leading-relaxed text-text-muted">
            Multi-site operator console for your cleaning-services network. Leads, tasks,
            SEO health, and team activity — visible from one place.
          </p>
          <ul className="space-y-2 text-xs text-text-muted">
            <li className="flex items-center gap-2">
              <span className="live-dot" /> Multi-site cleaning business network
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> SEO tracking, content pipeline, and payments
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-info" /> AI assistant + nightly audits + daily digest
            </li>
          </ul>
        </div>

        <div className="text-xs text-text-faint">
          SEO RankPilot · phase 1 + phase 2 in-house
        </div>
      </aside>

      {/* Login panel */}
      <main className="flex items-center justify-center px-6 py-10">
        <form action={loginAction} className="w-full max-w-[360px] space-y-5" autoComplete="on">
          <div className="lg:hidden mb-2 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent text-xs font-semibold uppercase tracking-wider text-surface">
              GYL
            </span>
            <span className="text-sm font-medium tracking-tightish">SEO RankPilot</span>
          </div>

          <header>
            <h1 className="text-2xl font-semibold leading-none tracking-tightish text-text">
              Sign in
            </h1>
            <p className="mt-1.5 text-sm text-text-muted">
              Use your platform account email + password.
            </p>
          </header>

          {errorMsg ? (
            <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
              {errorMsg}
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-xs transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
                Password
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-xs transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>
          </div>

          <button
            type="submit"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            Sign in
            <span className="font-mono text-xs opacity-60 group-hover:opacity-90">⏎</span>
          </button>

          <p className="border-t border-border pt-4 text-center text-xs text-text-faint">
            Forgot your password?{" "}
            <a
              href={`mailto:${forgotPasswordEmail()}?subject=Password%20reset%20request`}
              className="text-accent hover:underline"
            >
              Email the admin
            </a>{" "}
            to reset it.
          </p>
        </form>
      </main>
    </div>
  );
}
