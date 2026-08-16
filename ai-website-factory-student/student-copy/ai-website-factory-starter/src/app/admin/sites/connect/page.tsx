/**
 * /admin/sites/connect — WordPress REST API connect wizard.
 *
 * Plugin-based install was retired (the GYL Suite PHP plugin was never
 * shipped and its `/api/events/ingest` endpoint doesn't exist server-side).
 * Every new site now connects via a WordPress **Application Password**,
 * verified in the same request against `<domain>/wp-json/wp/v2/users/me`.
 *
 * Flow:
 *   step 1 (details + creds) → verify + create site row + credential row
 *   step 2 (configure)       → policy defaults + first scan
 */
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoPolicies, sites } from "@/db/schema";
import { connectSiteStep3Action, connectSiteViaRestAction } from "@/app/actions/site-connect";
import { SiteWizardFields } from "@/components/ui/SiteWizardFields";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    step?: string;
    siteId?: string;
    error?: string;
    detail?: string;
    domain?: string;
    name?: string;
    slug?: string;
    city?: string;
    region?: string;
    wp_username?: string;
  };
}

export default async function ConnectWizardPage({ searchParams }: PageProps) {
  await ensureSchema();
  await requireAdmin();

  if (searchParams.step === "configure" && searchParams.siteId) {
    return <ConfigureStep siteId={searchParams.siteId} />;
  }

  return (
    <RestApiConnect
      error={searchParams.error}
      detail={searchParams.detail}
      preserved={{
        domain: searchParams.domain,
        name: searchParams.name,
        slug: searchParams.slug,
        city: searchParams.city,
        region: searchParams.region,
        wp_username: searchParams.wp_username,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — REST API connect. Verifies WP app password, then creates
// sites + site_credentials rows atomically, then jumps to Configure.
// ─────────────────────────────────────────────────────────────────────

function RestApiConnect({
  error,
  detail,
  preserved,
}: {
  error?: string;
  detail?: string;
  preserved?: {
    domain?: string;
    name?: string;
    slug?: string;
    city?: string;
    region?: string;
    wp_username?: string;
  };
}) {
  const errorMsg = error
    ? error === "invalid"
      ? "Site URL and display name are required. (Slug auto-fills from the URL.)"
      : error === "slug-exists"
        ? "A site with that slug already exists — try editing the slug field."
        : error === "domain-exists"
          ? "A site with that domain is already connected."
          : error === "missing-wp-credentials"
            ? "WordPress username and application password are both required."
            : error === "app-password-too-short"
              ? "That doesn't look like a WordPress application password (they're 24 chars, shown as 6 blocks of 4)."
              : error === "wp-verify-failed"
                ? `WordPress rejected the credentials: ${decodeURIComponent(detail ?? "")}`
                : decodeURIComponent(detail ?? error)
    : null;

  return (
    <div className="w-full space-y-6">
      <WizardHeader step={1} />

      {errorMsg ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {errorMsg}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Connect via WordPress REST API</h2>
            <p className="mt-1 text-sm text-text-muted">
              Paste a WordPress Application Password. We authenticate directly against{" "}
              <code className="font-mono text-xs">wp/v2/*</code> using HTTP Basic. The password is
              stored encrypted with AES-256-GCM.
            </p>
          </div>

          <form action={connectSiteViaRestAction} className="space-y-4">
            <SiteWizardFields
              defaultDomain={preserved?.domain}
              defaultName={preserved?.name}
              defaultSlug={preserved?.slug}
              defaultCity={preserved?.city}
              defaultRegion={preserved?.region}
            />

            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-text">WordPress credentials</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                    Username
                  </span>
                  <input
                    type="text"
                    name="wp_username"
                    autoComplete="off"
                    defaultValue={preserved?.wp_username ?? ""}
                    placeholder="admin"
                    required
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                  <span className="mt-1 block text-xs text-text-faint">
                    A WordPress user with editor or administrator role.
                  </span>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-[0.06em] text-text-muted">
                    Application Password
                  </span>
                  <input
                    type="password"
                    name="wp_app_password"
                    autoComplete="new-password"
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    required
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                  <span className="mt-1 block text-xs text-text-faint">
                    Not your login password. Spaces are stripped automatically.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/admin/sites" className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text">
                Cancel
              </Link>
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-sm hover:bg-accent-hover focus-visible:shadow-glow"
              >
                Verify &amp; connect →
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-xl border border-border bg-surface p-5 text-sm space-y-3 self-start">
          <div>
            <h3 className="text-sm font-semibold text-text">Where do I get an Application Password?</h3>
          </div>
          <ol className="list-decimal space-y-2 pl-4 text-xs text-text-muted">
            <li>
              Log into your WordPress admin.
            </li>
            <li>
              Open{" "}
              <code className="font-mono text-xs">Users → Profile</code> (or your user).
            </li>
            <li>
              Scroll to <strong className="text-text">Application Passwords</strong>. Enter a name
              (e.g. <code className="font-mono">SEO RankPilot</code>) and click{" "}
              <strong className="text-text">Add New Application Password</strong>.
            </li>
            <li>
              WordPress shows a 24-character password formatted as{" "}
              <code className="font-mono text-xs">xxxx xxxx xxxx xxxx xxxx xxxx</code>. Copy it into
              the field on the left. It&apos;s only shown <em>once</em>.
            </li>
          </ol>
          <div className="rounded-md border border-accent/20 bg-accent/[0.04] p-3 text-xs text-text-muted">
            On submit we call{" "}
            <code className="font-mono">{`<domain>/wp-json/wp/v2/users/me`}</code> with HTTP Basic. On
            a 200 the credential is stored encrypted and you jump to policy configuration.
          </div>
          <div className="text-[11px] text-text-faint">
            Revoke any time from the same WordPress screen — you don&apos;t need to touch the platform.
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Policy defaults + first scan.
// ─────────────────────────────────────────────────────────────────────

async function ConfigureStep({ siteId }: { siteId: string }) {
  const d = db();
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) {
    return (
      <div className="w-full space-y-4">
        <p className="text-sm text-danger">Site not found.</p>
      </div>
    );
  }
  const [policy] = await d.select().from(seoPolicies).where(eq(seoPolicies.siteId, siteId)).limit(1);

  return (
    <div className="w-full space-y-6">
      <WizardHeader step={2} />

      <form
        action={connectSiteStep3Action}
        className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <input type="hidden" name="siteId" value={siteId} />

        <div>
          <h2 className="text-lg font-semibold text-text">SEO autopilot defaults</h2>
          <p className="mt-1 text-xs text-text-muted">
            Choose which capabilities the agent runs without your approval. You can change these any time at /admin/seo.
          </p>
        </div>

        <CapabilityRow name="alt_text" label="Alt text fixes" defaultValue={policy?.capabilities?.alt_text ?? "auto"} description="Auto-generate alt text on images that have none. Low risk." />
        <CapabilityRow name="meta_title" label="Meta titles" defaultValue={policy?.capabilities?.meta_title ?? "auto"} description="Rewrite titles over 60 chars or under 30." />
        <CapabilityRow name="meta_description" label="Meta descriptions" defaultValue={policy?.capabilities?.meta_description ?? "auto"} description="Generate descriptions when missing or out of range." />
        <CapabilityRow name="schema_inject" label="Schema injection" defaultValue={policy?.capabilities?.schema_inject ?? "auto"} description="Add JSON-LD blocks the page is missing." />
        <CapabilityRow name="visual_css" label="Visual & UX changes" defaultValue="propose" disabled description="Always proposal-only — visual changes require your eyes on a preview." />

        <div className="border-t border-border pt-4">
          <label className="block text-xs font-medium text-text">
            Competitor URLs <span className="text-text-faint">(optional, one per line)</span>
          </label>
          <textarea
            name="competitors"
            rows={3}
            defaultValue={policy?.competitors ?? ""}
            placeholder="https://competitor1.com&#10;https://competitor2.com"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <p className="mt-1 text-xs text-text-faint">Used for monthly competitor teardown audits.</p>
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-xs font-medium text-text">
            Brand voice notes <span className="text-text-faint">(optional)</span>
          </label>
          <textarea
            name="brandVoice"
            rows={3}
            defaultValue={policy?.brandVoice ?? ""}
            placeholder='Our tone is "calm authority" — never use exclamation marks. We say "cleaner" not "operative".'
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <p className="mt-1 text-xs text-text-faint">Injected into the agent prompts as ground truth.</p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Link href={`/admin/sites/${site.slug}`} className="text-xs text-text-muted hover:text-text">
            Skip for now
          </Link>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-sm hover:bg-accent-hover focus-visible:shadow-glow"
          >
            Finish &amp; open site →
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────

function WizardHeader({ step }: { step: 1 | 2 }) {
  return (
    <header className="space-y-2">
      <Link href="/admin/sites" className="text-xs text-text-muted hover:text-text">← Sites</Link>
      <h1 className="text-2xl font-semibold text-text">Connect a site</h1>
      <p className="text-xs text-text-muted">
        Two quick steps. WordPress Application Password is the only supported method.
      </p>
      <ol className="mt-3 flex items-center gap-2 text-xs">
        {[
          { n: 1 as const, label: "Verify credentials" },
          { n: 2 as const, label: "Configure" },
        ].map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-medium ${
                step === s.n
                  ? "border-accent bg-accent text-accent-fg"
                  : step > s.n
                    ? "border-success bg-success-tint text-success"
                    : "border-border bg-surface-2 text-text-faint"
              }`}
              aria-current={step === s.n ? "step" : undefined}
            >
              {step > s.n ? "✓" : s.n}
            </span>
            <span className={step === s.n ? "font-medium text-text" : "text-text-muted"}>{s.label}</span>
            {i < 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </header>
  );
}

function CapabilityRow({
  name,
  label,
  description,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  description: string;
  defaultValue: "auto" | "propose" | "off";
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text">{label}</div>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      </div>
      <select
        name={`cap_${name}`}
        defaultValue={defaultValue}
        disabled={disabled}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="auto">auto-apply</option>
        <option value="propose">propose</option>
        <option value="off">off</option>
      </select>
    </div>
  );
}
