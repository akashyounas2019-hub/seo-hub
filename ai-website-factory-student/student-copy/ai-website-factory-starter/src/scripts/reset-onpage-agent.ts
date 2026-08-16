/**
 * One-shot: overwrite the `onpage` agent_profiles row with the current
 * BUILT_IN_DEFAULT_SKILLS.onpage + the current focus text.
 *
 * Why: ensureBuiltInAgents() uses ON CONFLICT DO NOTHING, so once a row
 * exists we never touch it again. This script bypasses that so the fresh
 * Dubai-cleaning defaults land on the live app without waiting for the
 * operator to click "Reset to default" in the UI.
 *
 *   Stop the dev server first (PGlite is single-writer), then:
 *     npm run agent:reset:onpage
 *
 * Safe to re-run.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { agentProfiles } from "../db/schema";
import { AGENT_ROSTER, BUILT_IN_DEFAULT_SKILLS } from "../lib/agent-roster";

async function main() {
  await ensureSchema();
  const seed = AGENT_ROSTER.find((a) => a.id === "onpage");
  if (!seed) throw new Error("onpage not in AGENT_ROSTER");

  const result = await db()
    .update(agentProfiles)
    .set({
      focus: seed.focus,
      skillInstructions: BUILT_IN_DEFAULT_SKILLS.onpage,
      updatedAt: new Date(),
    })
    .where(eq(agentProfiles.id, "onpage"))
    .returning({ id: agentProfiles.id });

  if (result.length === 0) {
    // Row didn't exist yet — seed it (matches ensureBuiltInAgents shape).
    await db().insert(agentProfiles).values({
      id: seed.id,
      name: seed.name,
      title: seed.title,
      focus: seed.focus,
      skillInstructions: BUILT_IN_DEFAULT_SKILLS.onpage,
      isCustom: false,
      isActive: true,
    });
    console.log(`Seeded onpage agent (${seed.name}).`);
  } else {
    console.log(`Reset onpage agent (${seed.name}) — focus + skill instructions updated.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
