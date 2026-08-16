/**
 * /admin/sites/[slug]/credentials — WordPress credential vault.
 *
 * Operator pastes a WordPress Application Password ONCE. The agent uses
 * it every time after — wp-rest-client.ts loads + decrypts on demand for
 * any WP REST endpoint. The actual app password is never read back to the
 * UI after save.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteCredentials, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { Pill } from "@/components/ui/Row";
import { formatRelative } from "@/lib/utils";
import { SiteTabs } from "../SiteTabs";
import { CredentialsForm } from "./CredentialsForm";
import { ManageCredentialButtons } from "./ManageCredentialButtons";

export const dynamic = "force-dynamic";

export default async function CredentialsPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  await requireAdmin();
  const { slug } = await params;
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) notFound();

  const [active] = await db().select().from(siteCredentials).where(and(
    eq(siteCredentials.siteId, site.id),
    eq(siteCredentials.kind, "wp_app_password"),
    isNull(siteCredentials.revokedAt),
  )).orderBy(desc(siteCredentials.createdAt)).limit(1);

  const history = await db()
    .select({ id: siteCredentials.id, username: siteCredentials.username, createdAt: siteCredentials.createdAt, revokedAt: siteCredentials.revokedAt })
    .from(siteCredentials)
    .where(eq(siteCredentials.siteId, site.id))
    .orderBy(desc(siteCredentials.createdAt))
    .limit(10);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/sites" className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text">← Sites</Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">{site.name} · Credentials</h1>
        <p className="mt-1 text-xs text-text-muted">{site.domain}</p>
      </header>
      <SiteTabs slug={slug} />

      {/* Status card */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-text">WordPress Application Password</h2>
            <p className="mt-1 max-w-[60ch] text-xs text-text-muted">
              The agent uses this to authenticate to the WP REST API for every
              fix, content push, or settings change on this site. Stored
              encrypted (AES-256-GCM), never displayed in plaintext after save.
            </p>
          </div>
          {active ? (
            <Pill tone={active.verifyStatus === "ok" ? "success" : "warning"}>
              {active.verifyStatus ?? "unverified"}
            </Pill>
          ) : (
            <Pill tone="neutral">Not configured</Pill>
          )}
        </div>

        {active ? (
          <div className="mt-4 space-y-3">
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-text-faint">Username</dt>
                <dd className="text-text"><code className="font-mono text-xs">{active.username}</code></dd>
              </div>
              <div>
                <dt className="text-text-faint">Verified</dt>
                <dd className="text-text">{active.verifiedAt ? formatRelative(active.verifiedAt) : "never"}</dd>
              </div>
              <div>
                <dt className="text-text-faint">Added</dt>
                <dd className="text-text">{formatRelative(active.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-text-faint">Last status</dt>
                <dd className="text-text">{active.verifyStatus ?? "—"}</dd>
              </div>
            </dl>
            {active.verifyError && (
              <div className="rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-xs text-warning">
                {active.verifyError}
              </div>
            )}
            <ManageCredentialButtons siteId={site.id} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-text-faint">No credential stored yet for this site.</p>
        )}
      </section>

      {/* Add / replace form */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-medium text-text">
          {active ? "Replace credential" : "Add credential"}
        </h2>
        <ol className="mt-3 list-decimal pl-5 text-xs text-text-muted space-y-1">
          <li>Open <a className="text-accent hover:underline" href={`https://${site.domain}/wp-admin/profile.php#application-passwords-section`} target="_blank" rel="noopener noreferrer">{site.domain}/wp-admin/profile.php</a> → scroll to <strong>Application Passwords</strong></li>
          <li>Name it <code className="font-mono text-xs">GYL Platform</code> and click <strong>Add New Application Password</strong></li>
          <li>Copy the 24-character password WordPress shows you (it&apos;s only shown once)</li>
          <li>Paste it below — submit will verify against <code className="font-mono text-xs">GET /wp/v2/users/me</code> before storing</li>
        </ol>
        <div className="mt-4">
          <CredentialsForm siteId={site.id} domain={site.domain} />
        </div>
      </section>

      {/* History */}
      {history.length > 1 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-medium text-text">History</h2>
          <ul className="mt-3 space-y-1 text-xs">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <Pill tone={h.revokedAt ? "neutral" : "success"}>{h.revokedAt ? "revoked" : "active"}</Pill>
                <code className="font-mono text-xs text-text-muted">{h.username}</code>
                <span className="text-text-faint">added {formatRelative(h.createdAt)}</span>
                {h.revokedAt && <span className="text-text-faint">· revoked {formatRelative(h.revokedAt)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
