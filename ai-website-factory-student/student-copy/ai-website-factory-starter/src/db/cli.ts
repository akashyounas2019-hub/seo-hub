/**
 * Tiny CLI for managing users and site assignments in dev. v0.3 will replace
 * this with proper admin UI.
 *
 * Usage:
 *   npm run user:add -- <email> <password> <role>            # role = admin|manager|student
 *   npm run user:assign -- <email> <site-slug> <role>        # role = manager|worker
 *   npm run user:list
 *   npm run site:list
 */
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { sites, siteUsers, users } from "./schema";
import { hashPassword } from "../lib/auth";

const VALID_USER_ROLES = ["admin", "manager", "student"] as const;
const VALID_SITE_ROLES = ["manager", "worker"] as const;

type UserRole = (typeof VALID_USER_ROLES)[number];
type SiteRole = (typeof VALID_SITE_ROLES)[number];

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function userAdd(args: string[]) {
  const [email, password, role] = args;
  if (!email || !password || !role) die("usage: user:add <email> <password> <role>");
  if (!VALID_USER_ROLES.includes(role as UserRole)) {
    die(`bad role "${role}", expected one of: ${VALID_USER_ROLES.join(", ")}`);
  }

  const d = db();
  const existing = await d.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length) die(`user ${email} already exists`);

  const [created] = await d
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      role: role as UserRole,
    })
    .returning({ id: users.id, email: users.email, role: users.role });
  console.log(`✓ created user ${created.email} (${created.role}) — id ${created.id}`);
}

async function userAssign(args: string[]) {
  const [email, slug, role] = args;
  if (!email || !slug || !role) die("usage: user:assign <email> <site-slug> <role>");
  if (!VALID_SITE_ROLES.includes(role as SiteRole)) {
    die(`bad site role "${role}", expected one of: ${VALID_SITE_ROLES.join(", ")}`);
  }

  const d = db();
  const [user] = await d.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) die(`user ${email} not found`);
  const [site] = await d.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) die(`site ${slug} not found`);

  const existing = await d
    .select()
    .from(siteUsers)
    .where(and(eq(siteUsers.siteId, site.id), eq(siteUsers.userId, user.id)))
    .limit(1);
  if (existing.length) {
    await d
      .update(siteUsers)
      .set({ role: role as SiteRole })
      .where(and(eq(siteUsers.siteId, site.id), eq(siteUsers.userId, user.id)));
    console.log(`✓ updated ${user.email} on ${site.slug} → ${role}`);
  } else {
    await d
      .insert(siteUsers)
      .values({ siteId: site.id, userId: user.id, role: role as SiteRole });
    console.log(`✓ assigned ${user.email} to ${site.slug} as ${role}`);
  }
}

async function userList() {
  const d = db();
  const rows = await d
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  console.table(rows.map((r) => ({ ...r, id: r.id.slice(0, 8) })));
}

async function siteList() {
  const d = db();
  const rows = await d
    .select({ slug: sites.slug, name: sites.name, domain: sites.domain, city: sites.city })
    .from(sites)
    .orderBy(sites.createdAt);
  console.table(rows);
}

async function main() {
  await ensureSchema();
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "user:add":
      await userAdd(rest);
      break;
    case "user:assign":
      await userAssign(rest);
      break;
    case "user:list":
      await userList();
      break;
    case "site:list":
      await siteList();
      break;
    default:
      die(`unknown command: ${command ?? "(none)"}
Available: user:add, user:assign, user:list, site:list`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
