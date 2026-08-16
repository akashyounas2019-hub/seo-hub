/**
 * AI Overview citability pass.
 *
 * Given a generated build page (markdown body + meta + target keyword +
 * AI-Overview angle), call Claude with a tight system prompt that returns
 * structured suggestions for making the page more citable by AI Overviews,
 * Perplexity, ChatGPT-with-browsing, etc.
 *
 * This is a SUGGESTER, not a rewriter. We never modify the page directly —
 * the chat agent shows the user the proposed changes and asks them to
 * approve / reject one by one. Auto-rewriting is the wrong default because
 * each page is the result of many decisions and the LLM can easily flatten
 * the voice.
 *
 * Returns:
 *   - passages_to_bold[] — exact substrings (≤120 chars) from the page body
 *     that answer the AI Overview angle directly. Bolding these gives
 *     extraction engines a stronger signal.
 *   - factoids_to_add[] — citable single-sentence facts (with source if
 *     known) that would strengthen citability. Each is < 200 chars.
 *   - missing_faqs[] — questions the page should answer but doesn't yet,
 *     phrased as natural-language search queries.
 *   - rewrite_suggestions[] — when a passage is close but not quite
 *     citable, the suggested rewrite + original for diff display.
 *   - schema_recommendations[] — JSON-LD types that should be added or
 *     improved (e.g. "Add a FAQPage block citing the 3 questions above").
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface AiOverviewSuggestions {
  passages_to_bold: Array<{ snippet: string; rationale: string }>;
  factoids_to_add: Array<{ fact: string; source_hint: string | null; placement: string }>;
  missing_faqs: Array<{ question: string; intent: string; answer_hint: string }>;
  rewrite_suggestions: Array<{ original: string; suggested: string; why: string }>;
  schema_recommendations: string[];
  overall_grade: "weak" | "fair" | "strong" | "exceptional";
  one_line_verdict: string;
}

const SYSTEM = `
You audit a generated webpage for AI Overview / Perplexity / ChatGPT-browse citability.

Citability principles (use these as your ranking criteria):
1. PASSAGE EXTRACTION. AI Overviews cite passage-level content (single sentences or
   short blocks), not whole pages. The most-citable passages are: (a) direct
   answers to a known question, (b) numeric facts with units + context (e.g.
   "A 3-bedroom villa deep clean in Palm Jumeirah takes 4-6 hours and starts
   at AED 350"), (c) comparison sentences ("Standard clean covers surfaces
   and floors; deep clean adds baseboards, appliances, grout, and vents"),
   (d) lists of 3-7 items each <12 words.
2. STRUCTURED SIGNALS. FAQPage schema with 3+ Q/A pairs is the single highest-yield
   change for AI Overview eligibility. BreadcrumbList helps for navigation
   topics. LocalBusiness w/ aggregateRating helps for local intent.
3. FACTOIDS. Pages that name specific numbers (prices, distances, times,
   vehicle counts) cite better than pages that hedge ("affordable", "fast",
   "many vehicles"). When the page has a hedge, suggest a specific factoid
   to replace it.
4. ANTI-PATTERNS to flag:
   - Marketing puffery answering nothing ("we provide world-class luxury")
   - Hedged numbers ("we offer competitive pricing" instead of "from $95/hr")
   - Long paragraphs (>4 sentences) that bury the answer
   - Missing direct phrasing of the target keyword in an H2 or first 100 words

Output STRICTLY valid JSON matching this shape:
{
  "passages_to_bold": [{ "snippet": "exact substring from page body, <120 chars", "rationale": "1 sentence why" }],
  "factoids_to_add": [{ "fact": "citable sentence with numbers/units", "source_hint": "where you'd verify it, or null", "placement": "near which heading or paragraph" }],
  "missing_faqs": [{ "question": "natural-language search query", "intent": "informational|commercial|transactional", "answer_hint": "1-sentence answer sketch" }],
  "rewrite_suggestions": [{ "original": "exact substring from page", "suggested": "improved version", "why": "1 sentence" }],
  "schema_recommendations": ["string per recommendation"],
  "overall_grade": "weak|fair|strong|exceptional",
  "one_line_verdict": "single sentence summary"
}

Rules:
- Output ONLY the JSON object. No prose, no markdown fences.
- Limit each array to 3-5 items max. Quality over quantity.
- "snippet" + "original" values must appear LITERALLY in the page body.
- Do not invent statistics — flag missing ones via factoids_to_add with source_hint.
- If the page is already strong, return mostly empty arrays + overall_grade:"strong"|"exceptional".
`.trim();

export async function suggestAiOverviewImprovements(
  client: Anthropic,
  opts: {
    pageBodyMarkdown: string;
    metaTitle: string;
    metaDescription: string;
    targetKeyword: string;
    aiOverviewAngle: string;
    businessName: string;
    targetCity: string;
    model?: string;
  },
): Promise<AiOverviewSuggestions> {
  const model = opts.model ?? "claude-opus-4-7"; // Heavy tier — needs nuance. Caller can pass cheap for testing.
  const userPrompt = `
Business: ${opts.businessName} (${opts.targetCity})
Target keyword: ${opts.targetKeyword}
AI Overview angle (the question this page should win): ${opts.aiOverviewAngle}

Meta title: ${opts.metaTitle}
Meta description: ${opts.metaDescription}

Page body (Markdown):
${opts.pageBodyMarkdown}
`.trim();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Strip code fences if the model added them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`AI Overview pass: response was not valid JSON. First 200 chars: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI Overview pass: response was not an object");
  }
  const o = parsed as Record<string, unknown>;

  const safeArr = (k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);

  return {
    passages_to_bold: safeArr("passages_to_bold")
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        snippet: typeof x.snippet === "string" ? x.snippet : "",
        rationale: typeof x.rationale === "string" ? x.rationale : "",
      }))
      .filter((x) => x.snippet),
    factoids_to_add: safeArr("factoids_to_add")
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        fact: typeof x.fact === "string" ? x.fact : "",
        source_hint: typeof x.source_hint === "string" ? x.source_hint : null,
        placement: typeof x.placement === "string" ? x.placement : "",
      }))
      .filter((x) => x.fact),
    missing_faqs: safeArr("missing_faqs")
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        question: typeof x.question === "string" ? x.question : "",
        intent: typeof x.intent === "string" ? x.intent : "informational",
        answer_hint: typeof x.answer_hint === "string" ? x.answer_hint : "",
      }))
      .filter((x) => x.question),
    rewrite_suggestions: safeArr("rewrite_suggestions")
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        original: typeof x.original === "string" ? x.original : "",
        suggested: typeof x.suggested === "string" ? x.suggested : "",
        why: typeof x.why === "string" ? x.why : "",
      }))
      .filter((x) => x.original && x.suggested),
    schema_recommendations: safeArr("schema_recommendations").filter(
      (x): x is string => typeof x === "string",
    ),
    overall_grade: (["weak", "fair", "strong", "exceptional"] as const).includes(
      o.overall_grade as "weak",
    )
      ? (o.overall_grade as "weak" | "fair" | "strong" | "exceptional")
      : "fair",
    one_line_verdict: typeof o.one_line_verdict === "string" ? o.one_line_verdict : "",
  };
}
