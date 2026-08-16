import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, siteUsers, tasks, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";

/**
 * Server-action scope tests — a manager-scoped user cannot mutate a task
 * or lead on a site they're not assigned to.
 *
 * We mock `next/headers`, `next/navigation` (redirect throws so the test
 * can assert it was called), and `@/lib/server-auth.getCurrentUser` so
 * the actions resolve to the "forged" session user.
 *
 * Why mock redirect: server-action `redirect("...")` is implemented as
 * a thrown sentinel — vitest's `expect(...).rejects.toThrow(/forbidden/)`
 * is the cleanest way to detect the rejection.
 */

const forgedUser: { id: string | null } = { id: null };

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined,
    delete: () => {},
  }),
  headers: () => ({
    get: () => null,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("@/lib/server-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server-auth")>("@/lib/server-auth");
  return {
    ...actual,
    getCurrentUser: async () => {
      if (!forgedUser.id) return null;
      const [u] = await db().select().from(users).where(eq(users.id, forgedUser.id)).limit(1);
      return u ?? null;
    },
    requireUser: async () => {
      if (!forgedUser.id) throw new Error("no forged user set");
      const [u] = await db().select().from(users).where(eq(users.id, forgedUser.id)).limit(1);
      if (!u) throw new Error("forged user not found");
      return u;
    },
    requireAdmin: async () => {
      if (!forgedUser.id) throw new Error("no forged user set");
      const [u] = await db().select().from(users).where(eq(users.id, forgedUser.id)).limit(1);
      if (!u || u.role !== "admin") {
        const err = new Error("NEXT_REDIRECT");
        (err as Error & { digest?: string }).digest = "NEXT_REDIRECT;replace;/admin;307;";
        throw err;
      }
      return u;
    },
  };
});

let managerId: string;
let visibleSiteId: string;
let hiddenSiteId: string;
let taskOnHiddenSite: string;

beforeAll(async () => {
  // Two sites; manager assigned only to the first.
  const slugA = `scope_a_${randomBytes(3).toString("hex")}`;
  const slugB = `scope_b_${randomBytes(3).toString("hex")}`;
  const [a] = await db().insert(sites).values({ slug: slugA, name: "A", domain: `${slugA}.test` }).returning({ id: sites.id });
  const [b] = await db().insert(sites).values({ slug: slugB, name: "B", domain: `${slugB}.test` }).returning({ id: sites.id });
  visibleSiteId = a.id;
  hiddenSiteId = b.id;

  const [mgr] = await db()
    .insert(users)
    .values({
      email: `scope_mgr_${randomBytes(3).toString("hex")}@test.example`,
      passwordHash: hashPassword("scope-mgr-1"),
      role: "manager",
    })
    .returning({ id: users.id });
  managerId = mgr.id;
  await db().insert(siteUsers).values({ siteId: visibleSiteId, userId: managerId, role: "manager" });

  // Task and lead on the *hidden* site (the one the manager is not assigned to).
  const [t] = await db()
    .insert(tasks)
    .values({ siteId: hiddenSiteId, title: "Hidden site task", priority: "normal" })
    .returning({ id: tasks.id });
  taskOnHiddenSite = t.id;
});

describe("server actions enforce per-site scope", () => {
  it("manager cannot update status on a task outside their site assignments", async () => {
    forgedUser.id = managerId;
    const { updateTaskStatusAction } = await import("@/app/actions/tasks");
    const fd = new FormData();
    fd.set("status", "in_progress");
    await expect(updateTaskStatusAction(taskOnHiddenSite, fd)).rejects.toThrow(/NEXT_REDIRECT/);

    // And the task status should NOT have changed in the DB.
    const [t] = await db().select().from(tasks).where(eq(tasks.id, taskOnHiddenSite)).limit(1);
    expect(t.status).toBe("todo");
  });

  it("manager cannot comment on a task outside their site assignments", async () => {
    forgedUser.id = managerId;
    const { addTaskCommentAction } = await import("@/app/actions/tasks");
    const fd = new FormData();
    fd.set("body", "should not work");
    await expect(addTaskCommentAction(taskOnHiddenSite, fd)).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
