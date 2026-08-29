import type { StructuredKnowledgeBase } from "../db/schema";

export const DEFAULT_NETWORK_KB = `OPERATOR: Ten By Ten Cleaning Company (Dubai).
Parent brand behind every website project in this network. All customer promises, warranties, pricing guidelines, and checklists trace back to our core network standards.

SERVICE AREA: Dubai and wider UAE emirates (Sharjah, Abu Dhabi, Ajman, RAK on request).
COVERED COMMUNITIES: Palm Jumeirah, Emirates Hills, Dubai Marina, Downtown Dubai, DIFC, JBR, Business Bay, Jumeirah, Al Barsha, Dubai Hills, Arabian Ranches, JVC, Silicon Oasis, Al Furjan, Motor City, Sports City, Mirdif, Damac Hills.

GENERAL OPERATING HOURS: Sun-Thu 8am-8pm, Fri-Sat 9am-6pm. WhatsApp dispatch 8am-10pm daily.
GENERAL POLICIES:
- Free cancellation or reschedule up to 24 hours prior.
- Background-checked, insured, uniformed team members.
- Eco-friendly / non-toxic products available on request.
- Quotes in AED including standard VAT.`;

/**
 * Formats a StructuredKnowledgeBase JSON object into structured Markdown sections.
 */
export function formatStructuredKb(kb?: StructuredKnowledgeBase | null): string {
  if (!kb) return "";
  const parts: string[] = [];

  // Business Profile
  if (kb.businessProfile) {
    const bp = kb.businessProfile;
    const lines: string[] = [];
    if (bp.businessName) lines.push(`- Business Name: ${bp.businessName}`);
    if (bp.niche) lines.push(`- Industry / Niche: ${bp.niche}`);
    if (bp.phone) lines.push(`- Phone: ${bp.phone}`);
    if (bp.whatsapp) lines.push(`- WhatsApp: ${bp.whatsapp}`);
    if (bp.address) lines.push(`- Address: ${bp.address}`);
    if (bp.workingHours) lines.push(`- Hours: ${bp.workingHours}`);
    if (bp.tradeLicense) lines.push(`- Trade License: ${bp.tradeLicense}`);
    if (bp.establishedYear) lines.push(`- Established: ${bp.establishedYear}`);
    if (lines.length > 0) {
      parts.push(`### Business Profile & Contact\n${lines.join("\n")}`);
    }
  }

  // Services Catalog
  if (kb.services && kb.services.length > 0) {
    const serviceLines = kb.services.map((s) => {
      let head = `* **${s.name}**`;
      // Show exactly what's entered in the price field -- no "AED" suffix
      // auto-appended. Whatever currency/format the operator typed (or
      // didn't) is what the AI agent sees, not an assumed one.
      if (s.priceAed) head += ` — From ${s.priceAed}`;
      if (s.turnaround) head += ` (${s.turnaround})`;
      const details: string[] = [];
      if (s.category) details.push(`Category: ${s.category}`);
      if (s.description) details.push(`Scope: ${s.description}`);
      if (s.keywords && s.keywords.length > 0) details.push(`Target Keywords: ${s.keywords.join(", ")}`);
      if (s.features && s.features.length > 0) details.push(`Key Features: ${s.features.join("; ")}`);
      return `${head}\n  ${details.join(" | ")}`;
    });
    parts.push(`### Services & Pricing Catalog\n${serviceLines.join("\n")}`);
  }

  // Brand Voice & Guidelines
  if (kb.brandTone) {
    const bt = kb.brandTone;
    const lines: string[] = [];
    if (bt.tone) lines.push(`- Tone of Voice: ${bt.tone}`);
    if (bt.usps && bt.usps.length > 0) lines.push(`- Unique Value Propositions: ${bt.usps.join("; ")}`);
    if (bt.rulesDos && bt.rulesDos.length > 0) lines.push(`- DOs: ${bt.rulesDos.join("; ")}`);
    if (bt.rulesDonts && bt.rulesDonts.length > 0) lines.push(`- DON'Ts: ${bt.rulesDonts.join("; ")}`);
    if (bt.targetPersonas && bt.targetPersonas.length > 0) lines.push(`- Target Customer Personas: ${bt.targetPersonas.join("; ")}`);
    if (lines.length > 0) {
      parts.push(`### Brand Voice & Positioning\n${lines.join("\n")}`);
    }
  }

  // FAQs
  if (kb.faqs && kb.faqs.length > 0) {
    const faqLines = kb.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`);
    parts.push(`### Customer FAQs & Q&A\n${faqLines.join("\n\n")}`);
  }

  // Policies
  if (kb.policies && kb.policies.length > 0) {
    const policyLines = kb.policies.map((p) => `- **${p.title}**: ${p.description}`);
    parts.push(`### Business Policies & Guarantees\n${policyLines.join("\n")}`);
  }

  // Competitors
  if (kb.competitors && kb.competitors.length > 0) {
    const compLines = kb.competitors.map((c) => `- **${c.name}**${c.domain ? ` (${c.domain})` : ""}: ${c.counterStrategy || "N/A"}`);
    parts.push(`### Competitor Counter-Positioning\n${compLines.join("\n")}`);
  }

  return parts.join("\n\n");
}

/**
 * Assembles full grounding prompt text combining network facts, site text facts, and structured facts.
 */
export function compileFullKnowledge(opts: {
  siteName?: string;
  city?: string;
  plainTextKb?: string;
  structuredKb?: StructuredKnowledgeBase | null;
  networkKb?: string;
}): string {
  const { siteName = "Target Website", city, plainTextKb, structuredKb, networkKb = DEFAULT_NETWORK_KB } = opts;
  const sections: string[] = [];

  sections.push(`=== 1. NETWORK-WIDE MANDATES & POLICIES ===\n${networkKb.trim()}\n=== END NETWORK MANDATES ===`);

  if (plainTextKb && plainTextKb.trim()) {
    sections.push(`=== 2. SITE GENERAL FACTS (${siteName}${city ? ` - ${city}` : ""}) ===\n${plainTextKb.trim()}\n=== END SITE GENERAL FACTS ===`);
  }

  const structuredFormatted = formatStructuredKb(structuredKb);
  if (structuredFormatted.trim()) {
    sections.push(`=== 3. STRUCTURED CATALOG & BRAND SPECIFICATIONS ===\n${structuredFormatted.trim()}\n=== END STRUCTURED CATALOG ===`);
  }

  return sections.join("\n\n");
}
