/**
 * /admin/agent/jobs/secret — shows the current worker secret and lets
 * the admin rotate it. Exists as a named route so it doesn't fall into
 * the [id] dynamic segment and throw a UUID parse error.
 */
import { redirect } from "next/navigation";
import { db, ensureSchema } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { rotateWorkerSecret, getWorkerSecret } from "@/lib/claude-worker-auth";

export const dynamic = "force-dynamic";

async function rotateAction() {
  "use server";
  await ensureSchema();
  await requireAdmin();
  const fresh = await rotateWorkerSecret();
  redirect(`/admin/agent/jobs/secret?rotated=1&s=${fresh}`);
}

export default async function WorkerSecretPage({
  searchParams = {},
}: {
  searchParams?: { rotated?: string; s?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const currentSecret = await getWorkerSecret();
  const justRotated = searchParams.rotated === "1";
  const newSecret = searchParams.s;

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <h1 className="text-2xl font-medium tracking-tightish text-text">Worker Secret</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          The shared Bearer token the Mac worker uses to authenticate against{" "}
          <code className="font-mono">/api/claude-jobs/claim</code> and related endpoints.
        </p>
      </header>

      {justRotated && newSecret ? (
        <div className="rounded-xl border border-success/30 bg-success-tint/30 p-4">
          <p className="text-sm font-medium text-text">
            New secret generated — copy it now, you won&apos;t see it again.
          </p>
          <code className="mt-3 block break-all rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text">
            {newSecret}
          </code>
          <p className="mt-3 text-xs text-text-muted">
            Paste this into your <code className="font-mono">.env.worker</code> file as{" "}
            <code className="font-mono">GYL_WORKER_SECRET</code>, then restart the worker with{" "}
            <code className="font-mono">npm run worker</code>.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-text">Current secret</p>
          <p className="mt-1 text-xs text-text-muted">
            {currentSecret
              ? `${currentSecret.slice(0, 8)}${"•".repeat(24)}${currentSecret.slice(-8)}`
              : "No secret set yet — generate one below."}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-4 text-xs text-text-muted space-y-1">
          <p className="font-medium text-text">How to configure the worker</p>
          <p>1. Generate a secret below (or use the existing one if already set).</p>
          <p>2. Open <code className="font-mono">.env.worker</code> in the project root.</p>
          <p>3. Set <code className="font-mono">GYL_WORKER_SECRET=&lt;your secret&gt;</code></p>
          <p>4. Also ensure <code className="font-mono">.env</code> has the same value for <code className="font-mono">GYL_WORKER_SECRET</code>.</p>
          <p>5. Run <code className="font-mono">npm run worker</code> in a separate terminal.</p>
        </div>

        <form action={rotateAction}>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {currentSecret ? "Rotate secret (invalidates current)" : "Generate secret"}
          </button>
        </form>
      </div>
    </div>
  );
}
