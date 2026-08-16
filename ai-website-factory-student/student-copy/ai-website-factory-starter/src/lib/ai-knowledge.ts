import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgSettings, type Site } from "@/db/schema";

/**
 * Default network-wide knowledge base. Used when the admin hasn't customized
 * `org_settings.network_knowledge_base` yet — so every freshly-installed
 * platform already answers customer questions intelligently about service
 * area, scheduling, and standard cleaning-business policies.
 *
 * To customize: edit at /admin/settings → "Network-wide AI knowledge."
 */
const DEFAULT_NETWORK_KB = `OPERATOR: Ten By Ten Cleaning Company (Dubai). We are the parent brand behind every site in this network; individual sites may trade under sub-brands but the operator is the same. All customer promises, warranties, pricing bands, and the 60-point checklist trace back to Ten By Ten.

SERVICE AREA: Dubai and the wider UAE.

We operate a network of residential & commercial cleaning services across the UAE. Areas served include Palm Jumeirah, Emirates Hills, Dubai Marina, Downtown Dubai, DIFC, JBR, Business Bay, Jumeirah, Al Barsha, Dubai Hills, Arabian Ranches, JVC (Jumeirah Village Circle), Silicon Oasis, Al Furjan, Motor City, Sports City, Meadows, The Springs, The Greens, Damac Hills, Mirdif, Al Quoz, Al Warqa, and neighbouring communities. Coverage extends to Abu Dhabi, Sharjah, and Ajman on request. If a customer mentions any UAE community, you may confirm coverage.

SERVICE TYPES:
- Standard cleaning: routine upkeep — kitchens, bathrooms, dusting, floors, waste.
- Deep cleaning: baseboards, inside appliances, grout, vents, AC vents — for first-time bookings or seasonal resets.
- Villa deep clean: full villa refresh against a written 60-point checklist. Common for handover, quarterly refresh, or post-fit-out.
- Move-in / move-out cleaning: full top-to-bottom clean for handover, expanded to cover inside cabinets, appliance interiors, and tenancy handover-condition items.
- Post-construction cleaning: dust removal, paint residue, final handover after fit-out.
- Sofa, carpet, curtain, and mattress cleaning: on-site steam or wet-clean.
- Recurring plans: weekly, bi-weekly, or monthly — discounted vs. one-time bookings.
- Commercial / office cleaning: after-hours service, customizable scope and frequency.

OPERATING HOURS: Sunday–Thursday 8am–8pm, Friday–Saturday 9am–6pm. Same-day availability is common across Dubai.

CURRENCY & PRICING: All prices quoted in AED. Fixed AED quotes returned the same working day based on square footage, number of rooms, and current condition — no hidden fees, VAT included.

NETWORK POLICIES:
- Free cancellation or reschedule up to 24 hours before the appointment.
- Licensed by Dubai Municipality / trade licence held; team members background-checked before placement.
- Every clean is audited against a written 60-point checklist before the team leaves; the completed checklist is shared with the customer.
- Bilingual support: English and Arabic.
- Cleaning supplies and equipment are provided; eco-friendly / non-toxic products available on request at no extra charge.
- Recurring customers can skip, pause, or reschedule any visit with 24 hours' notice.

PAYMENT: Cash, major credit cards, and bank transfer accepted. Invoicing available for recurring commercial accounts.`;

/**
 * Return the network-wide knowledge base. Falls back to the Dubai-wide
 * default if the admin hasn't customized it.
 */
export async function getNetworkKnowledge(): Promise<string> {
  const [row] = await db()
    .select({ kb: orgSettings.networkKnowledgeBase })
    .from(orgSettings)
    .where(eq(orgSettings.id, "singleton"))
    .limit(1);
  const custom = (row?.kb ?? "").trim();
  return custom || DEFAULT_NETWORK_KB;
}

/**
 * Compose the AI's full knowledge context for a given site: network KB +
 * site-specific KB. Used by the chat widget and the smart-quote parser.
 *
 * Stacking order: network first (foundation), site second (local override /
 * additional detail). The LLM gets both as ground truth.
 */
export async function getAiKnowledgeFor(site: Site): Promise<string> {
  const network = await getNetworkKnowledge();
  const siteKb = (site.knowledgeBase ?? "").trim();
  const parts = [
    `=== NETWORK-WIDE FACTS (apply to every location) ===\n${network}\n=== END NETWORK-WIDE FACTS ===`,
  ];
  if (siteKb) {
    parts.push(
      `=== SITE-SPECIFIC FACTS for ${site.name}${site.city ? ` (${site.city})` : ""} ===\n${siteKb}\n=== END SITE-SPECIFIC FACTS ===`,
    );
  }
  return parts.join("\n\n");
}

// Re-export the default for the settings page placeholder.
export { DEFAULT_NETWORK_KB };
