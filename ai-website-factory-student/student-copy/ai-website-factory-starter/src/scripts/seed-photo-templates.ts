/**
 * Seed the 8 starter photo prompt templates into `photo_templates`.
 *
 * Standalone + idempotent: inserts only the templates whose (slot_key, name)
 * pair is not already present, and marks each `isDefault + isActive` so the
 * photo executor's "default active template for slot" lookup succeeds. Safe to
 * run on prod — touches ONLY photo_templates, nothing else.
 *
 *   docker exec gyl-cron node --import tsx src/scripts/seed-photo-templates.ts
 *
 * Kept in sync with the STARTER_TEMPLATES block in src/db/seed.ts.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { photoTemplates } from "../db/schema";

const STARTER_TEMPLATES: Array<{
  slotKey: string;
  name: string;
  promptSkeleton: string;
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  defaultVariants: number;
  styleHint: string;
}> = [
  {
    slotKey: "hero",
    name: "Hero — pristine villa interior, Dubai skyline",
    aspectRatio: "16:9",
    defaultVariants: 3,
    promptSkeleton:
      "A spotless, freshly cleaned {property_type} interior with soft morning light. Wide cinematic angle, sharp focus on gleaming floors and neatly arranged furniture, {landmark} visible through the window at {time_of_day}. Editorial hospitality look.",
    styleHint:
      "Editorial hospitality photography, sunlit interiors, warm neutral palette, shallow depth of field, no logos, no text overlays.",
  },
  {
    slotKey: "fleet-card-sedan",
    name: "Team card — lead cleaner in uniform",
    aspectRatio: "4:3",
    defaultVariants: 2,
    promptSkeleton:
      "A friendly professional cleaner in a branded uniform photographed on a clean studio backdrop. Three-quarter angle, soft rim lighting, holding a small caddy of eco-cleaning supplies. Face partially framed — approachable, competent.",
    styleHint:
      "Studio portrait, clean cyclorama background, premium service-brand catalog look.",
  },
  {
    slotKey: "fleet-card-suv",
    name: "Kit card — professional cleaning caddy",
    aspectRatio: "4:3",
    defaultVariants: 2,
    promptSkeleton:
      "A neatly arranged professional cleaning kit — microfibre cloths, eco-labelled sprays, HEPA vacuum — on a clean dark studio backdrop. Three-quarter angle, soft rim lighting, polished details.",
    styleHint:
      "Studio product shot, dramatic side lighting, professional-services brochure aesthetic.",
  },
  {
    slotKey: "fleet-card-limo",
    name: "Team card — deep-clean crew",
    aspectRatio: "4:3",
    defaultVariants: 2,
    promptSkeleton:
      "A team of three cleaners in matching uniforms photographed on a soft gradient backdrop. Elegant confident stance, small equipment caddies at their sides. Faces neutral — no expressions overpowering the composition.",
    styleHint:
      "Studio group portrait, wide aspect, premium team-brochure aesthetic.",
  },
  {
    slotKey: "mid-1",
    name: "Mid-page — service moment",
    aspectRatio: "16:9",
    defaultVariants: 2,
    promptSkeleton:
      "A cleaner in a sharp branded uniform gently wipes a marble kitchen countertop inside a Dubai {property_type} at {time_of_day}. Hands and cloth only — no face — premium hospitality-service moment.",
    styleHint:
      "Editorial documentary photography, warm window light, refined hospitality cue, brand-premium vibe.",
  },
  {
    slotKey: "mid-2",
    name: "Mid-page — spotless interior detail",
    aspectRatio: "16:9",
    defaultVariants: 2,
    promptSkeleton:
      "Interior detail of a freshly cleaned {property_type} — gleaming glass shower, spotless polished wood floor, immaculate linen folded on the bed, a citrus scent bottle on the dresser. No people.",
    styleHint:
      "Macro interior product photography, ultra-shallow depth of field, golden-hour interior glow.",
  },
  {
    slotKey: "area-context",
    name: "Area context — Dubai neighbourhood landmark",
    aspectRatio: "16:9",
    defaultVariants: 2,
    promptSkeleton:
      "A wide cinematic photograph of {landmark} in {city}, {region}, at {time_of_day}. Clean composition, no vehicles, no people in foreground. Sense of place.",
    styleHint:
      "Travel-editorial photography, atmospheric mood, premium destination feel.",
  },
  {
    slotKey: "cta-bg",
    name: "CTA background — moody clean interior",
    aspectRatio: "16:9",
    defaultVariants: 2,
    promptSkeleton:
      "A dark moody wide cinematic photograph of a {property_type} living room after a deep clean at night, warm interior lamps on, subtle reflections on the polished floor. Negative space on the right for overlay text.",
    styleHint:
      "Moody cinematic still, deep navy and warm-amber palette, ample negative space, premium campaign aesthetic.",
  },
];

async function main() {
  await ensureSchema();
  const d = db();
  let inserted = 0;
  for (const t of STARTER_TEMPLATES) {
    const existing = await d
      .select({ id: photoTemplates.id })
      .from(photoTemplates)
      .where(and(eq(photoTemplates.slotKey, t.slotKey), eq(photoTemplates.name, t.name)))
      .limit(1);
    if (existing.length) {
      console.log(`· exists: ${t.slotKey} — ${t.name}`);
      continue;
    }
    await d.insert(photoTemplates).values({
      slotKey: t.slotKey,
      name: t.name,
      promptSkeleton: t.promptSkeleton,
      styleHint: t.styleHint,
      aspectRatio: t.aspectRatio,
      defaultVariants: t.defaultVariants,
      isDefault: true,
      isActive: true,
    });
    inserted++;
    console.log(`✓ seeded: ${t.slotKey} — ${t.name}`);
  }
  const [tot] = await d.select({ n: sql<number>`count(*)::int` }).from(photoTemplates);
  console.log(`\nDone. Inserted ${inserted}; photo_templates now has ${tot?.n ?? "?"} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
