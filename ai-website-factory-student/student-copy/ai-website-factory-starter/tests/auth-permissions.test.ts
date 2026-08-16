import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, siteUsers, users } from "@/db/schema";
import {
  createSession,
  deleteSession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { getVisibility } from "@/lib/permissions";

let adminId: string;
let managerId: string;
let siteVisibleId: string;
let siteHiddenId: string;

beforeAll(async () => {
  const slugA = `vp_a_${randomBytes(3).toString("hex")}`;
  const slugB = `vp_b_${randomBytes(3).toString("hex")}`;
  const [a] = await db()
    .insert(sites)
    .values({ slug: slugA, name: "A", domain: `${slugA}.test` })
    .returning({ id: sites.id });
  const [b] = await db()
    .insert(sites)
    .values({ slug: slugB, name: "B", domain: `${slugB}.test` })
    .returning({ id: sites.id });
  siteVisibleId = a.id;
  siteHiddenId = b.id;

  const [admin] = await db()
    .insert(users)
    .values({
      email: `admin_${randomBytes(3).toString("hex")}@test.example`,
      passwordHash: hashPassword("admin-password-1"),
      role: "admin",
    })
    .returning({ id: users.id });
  adminId = admin.id;

  const [manager] = await db()
    .insert(users)
    .values({
      email: `mgr_${randomBytes(3).toString("hex")}@test.example`,
      passwordHash: hashPassword("manager-password-1"),
      role: "manager",
    })
    .returning({ id: users.id });
  managerId = manager.id;

  await db().insert(siteUsers).values({ siteId: siteVisibleId, userId: managerId, role: "manager" });
});

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const stored = hashPassword("hunter2");
    expect(await verifyPassword("hunter2", stored)).toBe(true);
  });
  it("rejects an incorrect password", async () => {
    const stored = hashPassword("hunter2");
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });
  it("rejects on null/empty stored hash without throwing (constant-timing dummy run)", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bogus-format")).toBe(false);
  });
});

describe("session lifecycle", () => {
  it("creates a session and resolves it back to the user", async () => {
    const { token } = await createSession(adminId);
    const u = await getSessionUser(token);
    expect(u?.id).toBe(adminId);
  });
  it("returns null after deleteSession", async () => {
    const { token } = await createSession(adminId);
    await deleteSession(token);
    const u = await getSessionUser(token);
    expect(u).toBeNull();
  });
});

describe("getVisibility — permission scoping", () => {
  it("returns 'all' for admin", async () => {
    const [admin] = await db().select().from(users).where(eq(users.id, adminId)).limit(1);
    const v = await getVisibility(admin);
    expect(v.kind).toBe("all");
  });

  it("returns scoped siteIds for manager — includes their site, excludes others", async () => {
    const [mgr] = await db().select().from(users).where(eq(users.id, managerId)).limit(1);
    const v = await getVisibility(mgr);
    expect(v.kind).toBe("scoped");
    if (v.kind === "scoped") {
      expect(v.siteIds).toContain(siteVisibleId);
      expect(v.siteIds).not.toContain(siteHiddenId);
    }
  });
});
