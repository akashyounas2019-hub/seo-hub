/**
 * Admin-only diagnostic view for the Google (GSC + GA4) integration.
 *
 * Shows exactly what the dashboard sees:
 *   - Whether org credentials exist
 *   - Every integrations_accounts row (site slug + token presence + last sync)
 *   - Recent audit-log entries for google_connect / gsc_sync / ga4_sync
 *
 * Used to diagnose "credentials configured but no site connected" without
 * touching the DB directly. Remove or lock down when the bug is fixed.
 */
import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  adminActions,
  integrationsAccounts,
  orgSettings,
  sites,
  trafficSnapshots,
} from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IntegrationsDebugPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [orgRow] = await d
    .select({
      hasClientId: sql<boolean>`(${orgSettings.googleOauthClientId} is not null)`,
      hasSecret: sql<boolean>`(${orgSettings.googleOauthSecretCiphertext} is not null)`,
    })
    .from(orgSettings)
    .where(eq(orgSettings.id, "singleton"))
    .limit(1);

  // Full raw list — no inner join, so we see rows even if the sites row is
  // missing (which would explain "no connection" showing up spuriously).
  const rawAccounts = await d
    .select({
      id: integrationsAccounts.id,
      siteId: integrationsAccounts.siteId,
      provider: integrationsAccounts.provider,
      hasAccessToken: sql<boolean>`(${integrationsAccounts.accessTokenCiphertext} is not null)`,
      hasRefreshToken: sql<boolean>`(${integrationsAccounts.refreshTokenCiphertext} is not null)`,
      scopes: integrationsAccounts.scopes,
      expiresAt: integrationsAccounts.expiresAt,
      lastSyncAt: integrationsAccounts.lastSyncAt,
      lastSyncStatus: integrationsAccounts.lastSyncStatus,
      lastSyncError: integrationsAccounts.lastSyncError,
      metadata: integrationsAccounts.metadata,
      createdAt: integrationsAccounts.createdAt,
      updatedAt: integrationsAccounts.updatedAt,
    })
    .from(integrationsAccounts)
    .where(eq(integrationsAccounts.provider, "google"))
    .orderBy(desc(integrationsAccounts.createdAt));

  // Look up sites for those rows so we can spot orphan integrations
  // (accounts pointing at a site that no longer exists).
  const siteIds = rawAccounts.map((r) => r.siteId);
  const siteRows = siteIds.length
    ? await d
        .select({ id: sites.id, slug: sites.slug, name: sites.name, domain: sites.domain })
        .from(sites)
        .where(inArray(sites.id, siteIds))
    : [];
  const siteMap = new Map(siteRows.map((s) => [s.id, s]));

  const traffic28d = await d
    .select({
      siteId: trafficSnapshots.siteId,
      source: trafficSnapshots.source,
      rows: sql<number>`count(*)::int`,
    })
    .from(trafficSnapshots)
    .where(sql`${trafficSnapshots.snapshotDate} >= (current_date - interval '28 days')::text`)
    .groupBy(trafficSnapshots.siteId, trafficSnapshots.source);
  const trafficByKey = new Map(
    traffic28d.map((r) => [`${r.siteId}::${r.source}`, r.rows] as const),
  );

  const recentAudit = await d
    .select()
    .from(adminActions)
    .where(
      sql`${adminActions.kind} in ('integration.google_connect','integration.gsc_sync','integration.ga4_sync')`,
    )
    .orderBy(desc(adminActions.createdAt))
    .limit(20);

  // Every site in the network — we surface a one-click Connect Google link
  // per site so the operator can start the OAuth flow directly from this page
  // instead of hunting for the button on the site detail page.
  const allSites = await d
    .select({ slug: sites.slug, name: sites.name, domain: sites.domain })
    .from(sites)
    .orderBy(sites.slug);

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <header>
        <Link href="/admin/settings?section=integrations" className="text-xs text-text-faint hover:text-text">
          ← Settings
        </Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">
          Google integrations · debug
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Raw view of the four pieces the dashboard checks. Use this to figure
          out which step is actually broken.
        </p>
      </header>

      {/* One-click Connect buttons so the OAuth flow can be started without
          leaving this page. */}
      {rawAccounts.length === 0 && allSites.length > 0 ? (
        <section className="rounded-xl border border-accent/40 bg-accent/10 p-5">
          <h2 className="text-sm font-semibold text-text">
            Start the OAuth handshake now
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            No <code className="font-mono">integrations_accounts</code> row yet. Click Connect below —
            you&apos;ll be sent to Google&apos;s consent screen. After you click Allow, Google will redirect
            back to this app and the callback will write the row.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allSites.slice(0, 8).map((s) => (
              <a
                key={s.slug}
                href={`/api/integrations/google/start?site=${encodeURIComponent(s.slug)}`}
                className="rounded-md border border-accent/40 bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30"
              >
                Connect Google → {s.name}
              </a>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-text-faint">
            After clicking, watch the URL bar. If it lands back here with{" "}
            <code className="font-mono">?error=google-oauth-...</code>, the callback rejected the response —
            paste the error text and I&apos;ll trace it.
          </p>
        </section>
      ) : null}

      {/* 1. Org credentials */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">1. Org OAuth credentials</h2>
        <p className="mt-1 text-xs text-text-muted">
          The dashboard reports &ldquo;credentials configured&rdquo; when both are set.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Kv k="google_oauth_client_id" v={orgRow?.hasClientId ? "SET" : "MISSING"} good={!!orgRow?.hasClientId} />
          <Kv k="google_oauth_secret" v={orgRow?.hasSecret ? "SET" : "MISSING"} good={!!orgRow?.hasSecret} />
        </dl>
      </section>

      {/* 2. Per-site connections */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">2. Per-site connections (integrations_accounts)</h2>
        <p className="mt-1 text-xs text-text-muted">
          One row is written by <code className="font-mono">/api/integrations/google/callback</code> after a
          successful OAuth handshake. The dashboard counts these — if a row has{" "}
          <code className="font-mono">access_token = null</code>, the OAuth completed with a scope error and the
          row is effectively unusable.
        </p>
        {rawAccounts.length === 0 ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning-tint/40 p-3 text-xs text-warning">
            No rows found. Nothing has completed the OAuth handshake for provider=google. Open a site page →
            click <strong>Connect Google</strong> and complete the consent screen.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-text-faint">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">access</th>
                  <th className="px-3 py-2">refresh</th>
                  <th className="px-3 py-2">scopes</th>
                  <th className="px-3 py-2">ga4 property</th>
                  <th className="px-3 py-2">last sync</th>
                  <th className="px-3 py-2">28d GSC rows</th>
                  <th className="px-3 py-2">28d GA4 rows</th>
                </tr>
              </thead>
              <tbody>
                {rawAccounts.map((r) => {
                  const site = siteMap.get(r.siteId);
                  const orphan = !site;
                  const meta = r.metadata as { ga4_property_id?: string } | null;
                  const gscRows = trafficByKey.get(`${r.siteId}::gsc`) ?? 0;
                  const ga4Rows = trafficByKey.get(`${r.siteId}::ga4`) ?? 0;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {site ? (
                          <Link href={`/admin/sites/${site.slug}`} className="text-accent hover:underline">
                            {site.slug}
                          </Link>
                        ) : (
                          <span className="text-danger">
                            ORPHAN (site_id={r.siteId.slice(0, 8)}…)
                          </span>
                        )}
                        {orphan ? (
                          <p className="text-[10px] text-danger">
                            No sites row — dashboard inner-joins to sites so this row is invisible.
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <BoolPill v={r.hasAccessToken} />
                      </td>
                      <td className="px-3 py-2">
                        <BoolPill v={r.hasRefreshToken} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">{r.scopes ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {meta?.ga4_property_id ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.lastSyncAt ? (
                          <span className={r.lastSyncStatus === "error" ? "text-danger" : "text-text-muted"}>
                            {formatRelative(r.lastSyncAt)} · {r.lastSyncStatus ?? "?"}
                          </span>
                        ) : (
                          <span className="text-text-faint">never</span>
                        )}
                        {r.lastSyncError ? (
                          <p className="mt-0.5 max-w-[200px] truncate text-[10px] text-danger" title={r.lastSyncError}>
                            {r.lastSyncError}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{gscRows}</td>
                      <td className="px-3 py-2 tabular-nums">{ga4Rows}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Recent audit log */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">3. Recent audit-log activity</h2>
        <p className="mt-1 text-xs text-text-muted">
          The connect callback records <code className="font-mono">integration.google_connect</code> only
          after it actually writes an integrations_accounts row. If you clicked Connect but there is no entry
          here, the callback errored out before the write.
        </p>
        {recentAudit.length === 0 ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning-tint/40 p-3 text-xs text-warning">
            No connect / sync entries in the audit log. Either you never completed the consent screen, or
            the callback errored out silently (check the browser URL for
            <code className="font-mono">?error=google-oauth-...</code> after clicking Connect).
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-xs">
            {recentAudit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 py-2">
                <span className="w-24 shrink-0 font-mono text-[10px] text-text-faint">
                  {formatRelative(a.createdAt)}
                </span>
                <span className="w-40 shrink-0 font-mono text-[10px] text-accent">{a.kind}</span>
                <span className="flex-1 truncate text-text-muted">{a.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kv({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <>
      <dt className="font-mono text-[11px] text-text-faint">{k}</dt>
      <dd className={good ? "font-mono text-success" : "font-mono text-danger"}>{v}</dd>
    </>
  );
}

function BoolPill({ v }: { v: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${
        v
          ? "bg-success-tint text-success ring-success/30"
          : "bg-danger-tint text-danger ring-danger/30"
      }`}
    >
      {v ? "set" : "null"}
    </span>
  );
}
