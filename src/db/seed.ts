import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { apiKeys, sites, users, agentProfiles, kanbanTaskTemplates, kanbanTasks, automationFlows } from "./schema";

const DEFAULT_TEMPLATES = [
  { id: "tpl-audit", name: "Full-site technical audit", title: "Run full-site technical audit", desc: "Crawl the site, flag crawl blockers, canonicals, redirects, and CWV regressions. Export exec-ready report.", defaultAssignee: "Technical SEO Expert", priority: "high", builtIn: true },
  { id: "tpl-brief", name: "Content brief for target keyword", title: "Draft content brief for {{keyword}}", desc: "Search intent, SERP outline, entities, internal-link targets, and word-count guidance.", defaultAssignee: "On-Page Expert", priority: "medium", builtIn: true },
  { id: "tpl-outreach", name: "Link outreach campaign", title: "Launch outreach batch (25 prospects)", desc: "Enrich prospects, generate personalized pitches, queue for approval before send.", defaultAssignee: "Off-Page Expert", priority: "medium", builtIn: true },
  { id: "tpl-refresh", name: "Refresh declining post", title: "Refresh declining post: {{url}}", desc: "Update stats, expand FAQ, add 2026 examples, re-run internal links.", defaultAssignee: "On-Page Expert", priority: "low", builtIn: true },
  { id: "tpl-review", name: "Quarterly QA review", title: "QA review — top 20 landing pages", desc: "E-E-A-T, accuracy, compliance and schema checks. File issues into the fix queue.", defaultAssignee: "Auditor", priority: "high", builtIn: true },
];

const DEFAULT_TASKS = [
  { id: "seed-1", title: "Fix 14 canonical mismatches", desc: "Self-referencing canonicals point to trailing-slash variants.", assignee: "Technical SEO Expert", priority: "high", status: "inprogress", due: new Date(Date.now() + 86400000).toISOString() },
  { id: "seed-2", title: "Add FAQ schema to 12 top service pages", desc: "Service schema markup for Dubai cleaning landing pages.", assignee: "On-Page Expert", priority: "medium", status: "todo", due: new Date(Date.now() + 259200000).toISOString() },
  { id: "seed-3", title: "Pitch 5 UAE real-estate blogs", desc: "Personalized outreach for guest posts on move-in cleaning.", assignee: "Off-Page Expert", priority: "medium", status: "review", due: new Date(Date.now() + 172800000).toISOString() },
  { id: "seed-4", title: "Ship XML sitemap v3 to GSC", desc: "Submit sitemap index to Google Search Console.", assignee: "Technical SEO Expert", priority: "low", status: "done", due: new Date(Date.now() - 86400000).toISOString() },
  { id: "seed-5", title: "Reclaim 8 unlinked brand mentions", desc: "Brand monitoring outreach in UAE directories.", assignee: "Off-Page Expert", priority: "high", status: "todo", due: new Date(Date.now() + 345600000).toISOString() },
  { id: "seed-6", title: "Improve LCP on /pricing (3.1s → <2.0s)", desc: "Optimize hero images and font preload tags.", assignee: "Technical SEO Expert", priority: "critical", status: "inprogress", due: new Date().toISOString() },
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

const DEFAULT_AGENTS = [
  { id: "aks", name: "AKS", title: "SEO Leader", focus: "Routes work, audits sign-off, escalates." },
  { id: "kaveh-noor", name: "Kaveh Noor", title: "On-page Expert", focus: "Titles, H1s, schema, meta descriptions." },
  { id: "renner-voss", name: "Renner Voss", title: "Off-page Expert", focus: "Backlinks, outreach, anchor mix." },
  { id: "malik-rhodes", name: "Malik Rhodes", title: "Technical Expert", focus: "Crawl, CWV, redirects, canonicals." },
  { id: "silas-iyer", name: "Silas Iyer", title: "Blog Writer", focus: "Briefs, drafts, edits, voice." },
  { id: "idris-hale", name: "Idris Hale", title: "Technical SEO", focus: "Sitemaps, indexation, hreflang." },
  { id: "geo", name: "GEO / AI Search Expert", title: "AI Search Expert", focus: "Perplexity citations, Gemini AI Overviews, entity grounding." },
  { id: "international", name: "International & Local Expert", title: "Geo & Local Expert", focus: "Geo-grid heatmaps, GBP review sentiment, hreflang validation." },
];

const DEFAULT_SITES = [
  { slug: "safaeewala", name: "Safaeewala Dubai", domain: "safaeewala.com", city: "Dubai", region: "UAE" },
  { slug: "spotless-ae", name: "Spotless Cleaning AE", domain: "spotlesscleaningservices.ae", city: "Dubai", region: "UAE" },
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

  for (const agent of DEFAULT_AGENTS) {
    const found = await d.select().from(agentProfiles).where(eq(agentProfiles.id, agent.id)).limit(1);
    if (found.length === 0) {
      await d.insert(agentProfiles).values({
        id: agent.id,
        name: agent.name,
        title: agent.title,
        focus: agent.focus,
        isCustom: false,
        isActive: true,
      });
      console.log(`✓ agent seeded: ${agent.name} (${agent.title})`);
    }
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

  for (const t of DEFAULT_TASKS) {
    const found = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, t.id)).limit(1);
    if (found.length === 0) {
      await d.insert(kanbanTasks).values(t);
      console.log(`✓ kanban task seeded: ${t.title}`);
    }
  }

  const INITIAL_AUTOMATION_FLOWS = [
    { id: "l1", name: "Dubai suburb landing page generator", desc: "Auto-create localized pages for Marina, JLT, Downtown, Business Bay, Deira, JVC, Al Barsha, Palm Jumeirah, Silicon Oasis.", category: "local", cadence: "weekly", status: "running", lastRun: "2h ago", successRate: 96 },
    { id: "l2", name: "Local schema & NAP sync", desc: "Keep LocalBusiness / CleaningService JSON-LD + NAP consistent across all UAE listings.", category: "local", cadence: "daily", status: "running", lastRun: "6h ago", successRate: 99 },
    { id: "l3", name: "Arabic / English localization", desc: "Auto-translate meta, headings and service pages with hreflang ar-AE / en-AE tagging.", category: "local", cadence: "weekly", status: "running", lastRun: "1d ago", successRate: 92 },
    { id: "g1", name: "GBP weekly post publisher", desc: "Publish offers, service highlights and photos on Google Business Profile every Monday.", category: "gbp", cadence: "weekly", status: "running", lastRun: "3d ago", successRate: 100 },
    { id: "g2", name: "GBP Q&A auto-responder", desc: "Detect new questions on GBP and draft responses using service FAQ knowledge base.", category: "gbp", cadence: "realtime", status: "paused", lastRun: "12h ago", successRate: 88 },
    { id: "g3", name: "Service area & hours sync", desc: "Update service areas across Dubai zones and public UAE holiday hours automatically.", category: "gbp", cadence: "monthly", status: "running", lastRun: "12d ago", successRate: 100 },
    { id: "r1", name: "Post-service review request", desc: "Trigger WhatsApp + email review requests 2h after job completion in CRM.", category: "reviews", cadence: "realtime", status: "running", lastRun: "18m ago", successRate: 94 },
    { id: "r2", name: "Review reply drafter", desc: "Draft polite bilingual replies to new Google & Trustpilot reviews; flag < 4★ for human review.", category: "reviews", cadence: "hourly", status: "running", lastRun: "40m ago", successRate: 97 },
    { id: "r3", name: "Negative-review alert", desc: "Notify manager on Slack + email within 5 min of any 1–3★ review across UAE platforms.", category: "reviews", cadence: "realtime", status: "running", lastRun: "2h ago", successRate: 100 },
    { id: "c1", name: "Service page meta refresh", desc: "Rewrite outdated meta titles/descriptions for deep-clean, sofa, carpet, move-in/out pages.", category: "onpage", cadence: "weekly", status: "running", lastRun: "4d ago", successRate: 91 },
    { id: "c2", name: "Blog brief & draft factory", desc: "Generate briefs for Dubai-intent queries and produce first drafts.", category: "onpage", cadence: "weekly", status: "running", lastRun: "1d ago", successRate: 89 },
    { id: "c3", name: "Internal linking bot", desc: "Suggest & apply internal links between service, area and blog pages.", category: "onpage", cadence: "daily", status: "running", lastRun: "5h ago", successRate: 95 },
    { id: "b1", name: "UAE directory submission", desc: "Submit business to Yellow Pages UAE, Dubai Chamber, Connect.ae, Yalla, and 20+ local directories.", category: "offpage", cadence: "monthly", status: "running", lastRun: "9d ago", successRate: 87 },
    { id: "b2", name: "Guest-post outreach", desc: "Prospect UAE lifestyle / real-estate blogs and send personalized pitches.", category: "offpage", cadence: "weekly", status: "paused", lastRun: "6d ago", successRate: 62 },
    { id: "b3", name: "Broken-link reclamation", desc: "Find UAE sites linking to dead cleaning-service pages and pitch replacement.", category: "offpage", cadence: "monthly", status: "draft", lastRun: "—", successRate: 0 },
    { id: "t1", name: "Core Web Vitals monitor", desc: "Alert when LCP > 2.5s or CLS > 0.1 on any tracked Dubai service page.", category: "technical", cadence: "hourly", status: "running", lastRun: "22m ago", successRate: 99 },
    { id: "t2", name: "Indexation & crawl audit", desc: "Weekly scan of robots.txt, sitemap, indexation and canonical issues.", category: "technical", cadence: "weekly", status: "running", lastRun: "2d ago", successRate: 98 },
    { id: "t3", name: "Uptime & SSL watcher", desc: "Ping every 5 min from UAE region; alert on downtime or SSL expiry.", category: "technical", cadence: "realtime", status: "running", lastRun: "3m ago", successRate: 100 },
    { id: "rs1", name: "Dubai keyword miner", desc: "Discover new intent keywords (deep clean, sofa shampoo) with UAE volume.", category: "research", cadence: "weekly", status: "running", lastRun: "3d ago", successRate: 93 },
    { id: "rs2", name: "Competitor SERP tracker", desc: "Track ServiceMarket, Justmop, Matic positions daily on 200+ UAE queries.", category: "research", cadence: "daily", status: "running", lastRun: "7h ago", successRate: 100 },
    { id: "rp1", name: "Weekly executive report", desc: "Email PDF report every Sunday: rankings, GBP calls, reviews, traffic.", category: "reporting", cadence: "weekly", status: "running", lastRun: "6d ago", successRate: 100 },
  ];

  for (const flow of INITIAL_AUTOMATION_FLOWS) {
    const found = await d.select().from(automationFlows).where(eq(automationFlows.id, flow.id)).limit(1);
    if (found.length === 0) {
      await d.insert(automationFlows).values({
        id: flow.id,
        name: flow.name,
        desc: flow.desc,
        category: flow.category,
        cadence: flow.cadence,
        status: flow.status,
        lastRun: flow.lastRun,
        successRate: flow.successRate,
        assignedAgents: [],
      });
      console.log(`✓ automation flow seeded: ${flow.name}`);
    }
  }

  console.log("\nSeed complete. Start the app with `npm run dev` → http://localhost:8080");
  process.exit();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
