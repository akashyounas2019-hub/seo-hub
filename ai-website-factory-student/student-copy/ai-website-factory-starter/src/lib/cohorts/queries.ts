/**
 * Cohort queries — composable site-filter functions for the /admin/cohorts
 * page and the future bulk-action engine. Each preset returns a
 * `Site[]` slice with enough metadata for the operator to decide.
 *
 * Add a new cohort by:
 *   1. Adding a new entry to PRESETS below
 *   2. Implementing its loader function
 *   3. Adding a matching bulk action in lib/cohorts/actions.ts (next pass)
 */
import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  sites,
  siteHealthAudits,
  siteCredentials,
  integrationsAccounts,
  siteGbp,
  fixProposals,
  alerts,
} from "@/db/schema";

export interface CohortSite {
  id: string;
  slug: string;
  name: string;
  domain: string;
  /** Reason this row is in the cohort (e.g., "composite 54" or "plugin v0.21 < target 0.25"). */
  reason: string;
  /** Optional severity hint for sorting/colour. */
  severity?: "info" | "warn" | "error" | "critical";
}

export interface CohortDef {
  key: string;
  label: string;
  /** One-line explanation shown above the result list. */
  description: string;
  load: () => Promise<CohortSite[]>;
}

// ─── individual loaders ──────────────────────────────────────────────

async function compositeBelow70(): Promise<CohortSite[]> {
  // Latest audit per site, filter composite < 70.
  const latestPerSite = db()
    .select({
      siteId: siteHealthAudits.siteId,
      maxCreated: sql<Date>`max(${siteHealthAudits.createdAt})`.as("mc"),
    })
    .from(siteHealthAudits)
    .groupBy(siteHealthAudits.siteId)
    .as("lps");

  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      composite: siteHealthAudits.compositeScore,
    })
    .from(sites)
    .innerJoin(latestPerSite, eq(latestPerSite.siteId, sites.id))
    .innerJoin(
      siteHealthAudits,
      and(eq(siteHealthAudits.siteId, sites.id), eq(siteHealthAudits.createdAt, latestPerSite.maxCreated))
    )
    .where(lt(siteHealthAudits.compositeScore, 70));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    reason: `composite ${r.composite}/100`,
    severity: (r.composite ?? 0) < 50 ? "error" : "warn",
  }));
}

async function missingCredentials(): Promise<CohortSite[]> {
  // Sites with no active WP credential stored. ("active" = revoked_at IS NULL).
  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      credCount: sql<number>`count(${siteCredentials.id})::int`,
    })
    .from(sites)
    .leftJoin(
      siteCredentials,
      and(eq(siteCredentials.siteId, sites.id), isNull(siteCredentials.revokedAt))
    )
    .groupBy(sites.id, sites.slug, sites.name, sites.domain)
    .having(sql`count(${siteCredentials.id}) = 0`);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    reason: "no WP credential saved",
    severity: "warn",
  }));
}

async function noGbp(): Promise<CohortSite[]> {
  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      gbpUrl: siteGbp.gbpProfileUrl,
    })
    .from(sites)
    .leftJoin(siteGbp, eq(siteGbp.siteId, sites.id));

  return rows
    .filter((r) => !r.gbpUrl)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      reason: "no GBP profile URL on file",
      severity: "info",
    }));
}

async function noPaymentIntegration(): Promise<CohortSite[]> {
  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      hasStripe: sql<boolean>`bool_or(${integrationsAccounts.provider} = 'stripe')`,
      hasSquare: sql<boolean>`bool_or(${integrationsAccounts.provider} = 'square')`,
    })
    .from(sites)
    .leftJoin(integrationsAccounts, eq(integrationsAccounts.siteId, sites.id))
    .groupBy(sites.id, sites.slug, sites.name, sites.domain);

  return rows
    .filter((r) => !r.hasStripe && !r.hasSquare)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      reason: "no Stripe or Square connected",
      severity: "info",
    }));
}

async function openCriticalAlerts(): Promise<CohortSite[]> {
  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      n: sql<number>`count(${alerts.id})::int`,
    })
    .from(sites)
    .innerJoin(
      alerts,
      and(eq(alerts.siteId, sites.id), eq(alerts.status, "open"), or(eq(alerts.severity, "critical"), eq(alerts.severity, "error")))
    )
    .groupBy(sites.id, sites.slug, sites.name, sites.domain);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    reason: `${r.n} open error/critical alert(s)`,
    severity: "critical",
  }));
}

async function pendingFixes(): Promise<CohortSite[]> {
  const rows = await db()
    .select({
      id: sites.id,
      slug: sites.slug,
      name: sites.name,
      domain: sites.domain,
      n: sql<number>`count(${fixProposals.id})::int`,
    })
    .from(sites)
    .innerJoin(fixProposals, and(eq(fixProposals.siteId, sites.id), eq(fixProposals.status, "pending")))
    .groupBy(sites.id, sites.slug, sites.name, sites.domain);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    reason: `${r.n} fix(es) pending approval`,
    severity: "warn",
  }));
}

// ─── preset registry ────────────────────────────────────────────────

export const PRESETS: CohortDef[] = [
  {
    key: "composite_below_70",
    label: "Composite < 70",
    description: "Sites whose latest health composite is in priority-intervention range.",
    load: compositeBelow70,
  },
  {
    key: "missing_credentials",
    label: "No WP credentials",
    description: "Sites without an active app-password credential — agent can't act on these.",
    load: missingCredentials,
  },
  {
    key: "no_gbp",
    label: "No Google Business Profile",
    description: "Sites missing a linked GBP — losing map-pack visibility.",
    load: noGbp,
  },
  {
    key: "no_payment_integration",
    label: "No payment integration",
    description: "Sites without Stripe or Square — reservations can't auto-charge.",
    load: noPaymentIntegration,
  },
  {
    key: "open_critical_alerts",
    label: "Open critical/error alerts",
    description: "Sites with at least one unresolved error or critical alert.",
    load: openCriticalAlerts,
  },
  {
    key: "pending_fixes",
    label: "Pending fixes",
    description: "Sites with fix proposals awaiting approval.",
    load: pendingFixes,
  },
];

export function presetByKey(key: string | undefined): CohortDef | null {
  if (!key) return PRESETS[0] ?? null;
  return PRESETS.find((p) => p.key === key) ?? null;
}
