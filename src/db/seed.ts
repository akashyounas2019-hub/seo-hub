import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { apiKeys, sites, users, kanbanTaskTemplates } from "./schema";

// Real starter templates a user can pick from when creating a Kanban task
// (matching TEMPLATES-style static config used elsewhere in this app) --
// not fabricated activity. Fake demo tasks (DEFAULT_TASKS) and fake
// automation flows with invented successRate/lastRun values
// (INITIAL_AUTOMATION_FLOWS) used to be seeded here too; both were removed
// since they're exactly the kind of dummy data this project's standing rule
// prohibits. Confirmed via production DB before removal: neither had ever
// actually been run against the live database (0 rows), so this is a
// dead-code cleanup, not a data migration.
const DEFAULT_TEMPLATES = [
  { id: "tpl-audit", name: "Full-site technical audit", title: "Run full-site technical audit", desc: "Crawl the site, flag crawl blockers, canonicals, redirects, and CWV regressions. Export exec-ready report.", defaultAssignee: "Technical SEO Expert", priority: "high", builtIn: true },
  { id: "tpl-brief", name: "Content brief for target keyword", title: "Draft content brief for {{keyword}}", desc: "Search intent, SERP outline, entities, internal-link targets, and word-count guidance.", defaultAssignee: "On-Page Expert", priority: "medium", builtIn: true },
  { id: "tpl-outreach", name: "Link outreach campaign", title: "Launch outreach batch (25 prospects)", desc: "Enrich prospects, generate personalized pitches, queue for approval before send.", defaultAssignee: "Off-Page Expert", priority: "medium", builtIn: true },
  { id: "tpl-refresh", name: "Refresh declining post", title: "Refresh declining post: {{url}}", desc: "Update stats, expand FAQ, add 2026 examples, re-run internal links.", defaultAssignee: "On-Page Expert", priority: "low", builtIn: true },
  { id: "tpl-review", name: "Quarterly QA review", title: "QA review — top 20 landing pages", desc: "E-E-A-T, accuracy, compliance and schema checks. File issues into the fix queue.", defaultAssignee: "Auditor", priority: "high", builtIn: true },
];

const SCRYPT_PREFIX = "scrypt$";
const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

function genSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

const DEFAULT_SITES = [
  {
    slug: "safaeewala",
    name: "Safaeewala Cleaning Services",
    domain: "safaeewala.com",
    city: "Dubai",
    region: "UAE",
    health: "onboarding" as const,
    gaConnected: true,
    gaPropertyId: "377896920",
    gaPropertyLabel: "GA4-Safaeewala-Dubai (377896920)",
    gscConnected: true,
    gscPropertyUrl: "https://safaeewala.com/",
    gbpConnected: false,
    wpConnected: false,
  },
];

async function main() {
  await ensureSchema();
  const d = db();

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme123";

  const existing = await d.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length === 0) {
    await d.insert(users).values({
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      name: "Admin",
      role: "admin",
    });
    console.log(`✓ admin user created: ${adminEmail}`);
  } else {
    console.log(`· admin user exists: ${adminEmail}`);
  }

  for (const s of DEFAULT_SITES) {
    const found = await d.select().from(sites).where(eq(sites.slug, s.slug)).limit(1);
    let siteId: string;
    if (found.length === 0) {
      const [inserted] = await d.insert(sites).values(s).returning();
      siteId = inserted.id;
      console.log(`✓ site connected: ${s.slug} (${s.domain})`);
    } else {
      siteId = found[0].id;
      console.log(`· site exists: ${s.slug}`);
    }
    const existingKeys = await d.select().from(apiKeys).where(eq(apiKeys.siteId, siteId)).limit(1);
    if (existingKeys.length === 0) {
      const keyId = `site_${s.slug.replace(/-/g, "_")}_${randomBytes(4).toString("hex")}`;
      const secret = genSecret(32);
      await d.insert(apiKeys).values({ siteId, keyId, secret, active: true });
    }
  }

  for (const tpl of DEFAULT_TEMPLATES) {
    const found = await d.select().from(kanbanTaskTemplates).where(eq(kanbanTaskTemplates.id, tpl.id)).limit(1);
    if (found.length === 0) {
      await d.insert(kanbanTaskTemplates).values(tpl);
      console.log(`✓ task template seeded: ${tpl.name}`);
    }
  }

  console.log(`\nSeed complete. Start the app with \`npm run dev\` → http://localhost:${process.env.PORT || 3333}`);
  process.exit();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
