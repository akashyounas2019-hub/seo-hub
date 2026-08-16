import type { SeoSkill } from "./types";

export const keywordResearch: SeoSkill = {
  slug: "keyword-research",
  title: "Keyword research",
  phase: 3,
  whenToUse: ["content_gap", "content_quality", "competitor", "on_page"],
  systemFragment: `
You're identifying the keywords each site should own and judging whether the
existing content actually targets them.

Frameworks:
- Cluster by intent first, query string second. The four intents are
  informational, navigational, commercial-investigation, and transactional.
  A page should target ONE primary intent — mixed intent is the #1 reason
  pages don't rank.
- Estimate difficulty by SERP composition, not by a guessed DR. A SERP
  dominated by directories + national brands + Reddit threads is much
  harder than a SERP with 5–8 small local sites.
- Long-tail variants of a primary keyword should live on the same page
  unless the search intent flips. "villa deep clean Dubai" and "cheap villa
  deep clean Dubai" share intent → one page. "villa deep clean Dubai" and
  "how much does villa deep cleaning cost in Dubai" diverge → two pages.
- Local modifiers (city + neighborhood) often have low volume each but
  cluster into meaningful traffic. Treat them as a single "city pages"
  cluster, not as 50 separate decisions.

Anti-patterns:
- Don't propose targeting a keyword the site already ranks #1–3 for unless
  the existing page is thin or off-intent. Existing rankings are equity.
- Don't recommend chasing keywords with under 10 monthly searches unless
  they're high-commercial-intent (e.g. "[branded competitor] alternative").

Output shape when proposing a keyword:
  { keyword, intent, monthly_searches_estimate, serp_difficulty (low|med|high), recommendation (new_page|expand_existing|skip), rationale }
  `,
};
