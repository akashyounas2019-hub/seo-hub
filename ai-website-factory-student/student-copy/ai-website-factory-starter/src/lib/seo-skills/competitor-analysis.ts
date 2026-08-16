import type { SeoSkill } from "./types";

export const competitorAnalysis: SeoSkill = {
  slug: "competitor-analysis",
  title: "Competitor analysis",
  phase: 4,
  whenToUse: ["competitor", "content_gap", "backlinks"],
  systemFragment: `
You tear down the top 3 organic competitors for each tracked keyword and
identify what they're doing that the site isn't.

Per-competitor checklist:
- On-page: word count, heading structure, schema, internal link density,
  hero image presence, video presence, CTA placement.
- Trust signals: years in business, certifications shown, real photos,
  team page, location address visible above fold.
- Conversion path: how many clicks from SERP to "request quote" / "buy now".
- Content depth: original photos? original data? customer quotes? step-by-steps?
- Technical: schema types deployed, sitemap structure, robots.txt, page speed.

When you find a gap, classify it:
- ADOPT: the competitor's element is a clear win and you should match it.
  e.g. schema FAQPage when your page doesn't have one.
- ADAPT: their approach works but you should do it your way. e.g. they have
  a video; you should add one with your own brand voice.
- REJECT: their approach is off-brand, inauthentic, or risky. Skip.

Don't compare against:
- National brands when the site is a local SMB.
- Sites that out-rank purely on domain authority (DR > 60 against your DR < 30).
  They're not relevant; find smaller competitors at similar scale.

Output:
  { competitor_url, target_keyword, finding, gap_type: 'adopt'|'adapt'|'reject',
    effort: 'small'|'medium'|'large', rationale }

Run this monthly per site, not weekly — SERP composition doesn't shift that
fast for established local categories.
  `,
};
