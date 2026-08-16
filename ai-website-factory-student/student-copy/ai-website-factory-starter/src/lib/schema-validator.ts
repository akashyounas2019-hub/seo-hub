/**
 * JSON-LD structural validator for the schema types the build pipeline
 * actually emits: LocalBusiness, Service, FAQPage, Article, BreadcrumbList,
 * AggregateRating, Review.
 *
 * Not a full schema.org validator — covers the required-fields shape that
 * Google Rich Results actually checks for + the cleaning-vertical conventions
 * we generate in `seo-agent-onpage.ts` and `build:page_generate`. Use this
 * to fail the build review gate when bad schema slips through, and to give
 * the chat agent a way to lint LLM-generated JSON-LD before it ships.
 *
 * Returns:
 *   { ok: true } when valid
 *   { ok: false, errors: [{ path, code, message }] } when not
 */

export type SchemaError = { path: string; code: string; message: string };
export type SchemaValidation =
  | { ok: true; type: string; warnings: SchemaError[] }
  | { ok: false; type: string | null; errors: SchemaError[]; warnings: SchemaError[] };

const KNOWN_TYPES = [
  "LocalBusiness",
  "ProfessionalService",
  // Cleaning-vertical LocalBusiness subtypes recognized by Google.
  "HouseCleaning",
  "HomeAndConstructionBusiness",
  "Service",
  "FAQPage",
  "Article",
  "BreadcrumbList",
  "AggregateRating",
  "Review",
  "Organization",
  "WebPage",
  "WebSite",
] as const;

function err(path: string, code: string, message: string): SchemaError {
  return { path, code, message };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isStr(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function getType(jsonLd: Record<string, unknown>): string | null {
  const t = jsonLd["@type"];
  if (Array.isArray(t)) return typeof t[0] === "string" ? t[0] : null;
  return typeof t === "string" ? t : null;
}

/**
 * Validate one JSON-LD block. Accepts the raw parsed object — the caller
 * has already done `JSON.parse(string)` or pulled it out of the page's
 * `meta.schema_ld` field.
 */
export function validateJsonLd(jsonLd: unknown): SchemaValidation {
  const errors: SchemaError[] = [];
  const warnings: SchemaError[] = [];

  if (!isObj(jsonLd)) {
    return {
      ok: false,
      type: null,
      errors: [err("$", "not-an-object", "JSON-LD root must be an object")],
      warnings,
    };
  }

  // @context check
  const ctx = jsonLd["@context"];
  if (ctx !== "https://schema.org" && ctx !== "http://schema.org") {
    if (Array.isArray(ctx) && !ctx.includes("https://schema.org")) {
      errors.push(err("$.@context", "missing-context", '@context must be "https://schema.org"'));
    } else if (typeof ctx !== "string") {
      errors.push(err("$.@context", "missing-context", '@context must be "https://schema.org"'));
    }
  }

  const type = getType(jsonLd);
  if (!type) {
    errors.push(err("$.@type", "missing-type", "@type is required"));
    return { ok: false, type: null, errors, warnings };
  }

  if (!KNOWN_TYPES.includes(type as (typeof KNOWN_TYPES)[number])) {
    warnings.push(err("$.@type", "unknown-type", `@type "${type}" is not one of the validated types — structural check skipped`));
  }

  // Dispatch per type
  switch (type) {
    case "LocalBusiness":
    case "ProfessionalService":
    case "HouseCleaning":
    case "HomeAndConstructionBusiness":
      validateLocalBusiness(jsonLd, errors, warnings);
      break;
    case "Service":
      validateService(jsonLd, errors, warnings);
      break;
    case "FAQPage":
      validateFAQPage(jsonLd, errors, warnings);
      break;
    case "Article":
      validateArticle(jsonLd, errors, warnings);
      break;
    case "BreadcrumbList":
      validateBreadcrumbList(jsonLd, errors, warnings);
      break;
    case "AggregateRating":
      validateAggregateRating(jsonLd, "$", errors, warnings);
      break;
    case "Review":
      validateReview(jsonLd, "$", errors, warnings);
      break;
  }

  if (errors.length > 0) return { ok: false, type, errors, warnings };
  return { ok: true, type, warnings };
}

function validateLocalBusiness(o: Record<string, unknown>, errors: SchemaError[], warnings: SchemaError[]) {
  if (!isStr(o.name)) errors.push(err("$.name", "missing-name", "LocalBusiness requires name"));
  if (!o.address) errors.push(err("$.address", "missing-address", "LocalBusiness requires address (PostalAddress)"));
  else if (isObj(o.address)) {
    if (!isStr(o.address.streetAddress)) warnings.push(err("$.address.streetAddress", "missing-street", "address.streetAddress recommended"));
    if (!isStr(o.address.addressLocality)) errors.push(err("$.address.addressLocality", "missing-locality", "address.addressLocality (city) is required"));
    if (!isStr(o.address.addressRegion)) warnings.push(err("$.address.addressRegion", "missing-region", "address.addressRegion (province/state) recommended"));
    if (!isStr(o.address.addressCountry)) warnings.push(err("$.address.addressCountry", "missing-country", "address.addressCountry recommended (e.g. \"CA\")"));
  }
  if (!isStr(o.telephone)) warnings.push(err("$.telephone", "missing-phone", "telephone is strongly recommended for local SEO"));
  if (!isStr(o.url) && !isStr(o["@id"])) warnings.push(err("$.url", "missing-url", "url or @id recommended so Google can canonicalize"));
  // priceRange shows up in knowledge panels — soft warning if missing
  if (!isStr(o.priceRange)) warnings.push(err("$.priceRange", "missing-price-range", "priceRange (e.g. \"$$\") is recommended"));
  if (o.aggregateRating) validateAggregateRating(o.aggregateRating, "$.aggregateRating", errors, warnings);
  if (o.geo && isObj(o.geo)) {
    if (typeof o.geo.latitude !== "number" || typeof o.geo.longitude !== "number") {
      warnings.push(err("$.geo", "geo-shape", "geo should be GeoCoordinates with numeric latitude + longitude"));
    }
  }
}

function validateService(o: Record<string, unknown>, errors: SchemaError[], warnings: SchemaError[]) {
  if (!isStr(o.name)) errors.push(err("$.name", "missing-name", "Service requires name"));
  if (!o.provider) errors.push(err("$.provider", "missing-provider", "Service requires provider (LocalBusiness/Organization)"));
  if (!isStr(o.serviceType) && !isStr(o.category)) warnings.push(err("$.serviceType", "missing-service-type", "serviceType or category recommended"));
  if (!o.areaServed) warnings.push(err("$.areaServed", "missing-area-served", "areaServed strongly recommended for local services"));
}

function validateFAQPage(o: Record<string, unknown>, errors: SchemaError[], warnings: SchemaError[]) {
  // FAQ rich results were retired by Google in May 2026. FAQPage is still valid
  // JSON-LD (and harmless for parsing / AI answers), but it no longer produces a
  // SERP rich result — so we warn rather than treat it as a rankings/CTR win.
  warnings.push(err("$", "faqpage-deprecated", "FAQPage rich results were retired (May 2026). Valid for parsing/AI answers but it will NOT render a SERP FAQ dropdown — don't rely on it for rankings/CTR; prefer LocalBusiness/Service/Breadcrumb."));
  const mainEntity = o.mainEntity;
  if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
    errors.push(err("$.mainEntity", "missing-questions", "FAQPage requires mainEntity (non-empty array of Question)"));
    return;
  }
  mainEntity.forEach((q, i) => {
    const path = `$.mainEntity[${i}]`;
    if (!isObj(q) || getType(q) !== "Question") {
      errors.push(err(path, "not-question", "Each mainEntity must be @type:Question"));
      return;
    }
    if (!isStr(q.name)) errors.push(err(`${path}.name`, "missing-question", "Question.name is required"));
    const ans = q.acceptedAnswer;
    if (!isObj(ans)) {
      errors.push(err(`${path}.acceptedAnswer`, "missing-answer", "Question requires acceptedAnswer (Answer)"));
    } else {
      if (getType(ans) !== "Answer") errors.push(err(`${path}.acceptedAnswer`, "not-answer", "acceptedAnswer must be @type:Answer"));
      if (!isStr(ans.text)) errors.push(err(`${path}.acceptedAnswer.text`, "missing-answer-text", "Answer.text is required"));
      else if ((ans.text as string).length < 30) warnings.push(err(`${path}.acceptedAnswer.text`, "short-answer", "Answer is under 30 chars — too thin to win AI Overview citation"));
    }
  });
}

function validateArticle(o: Record<string, unknown>, errors: SchemaError[], warnings: SchemaError[]) {
  if (!isStr(o.headline)) errors.push(err("$.headline", "missing-headline", "Article requires headline"));
  else if ((o.headline as string).length > 110) warnings.push(err("$.headline", "long-headline", "headline > 110 chars — Google truncates rich results"));
  if (!o.author) errors.push(err("$.author", "missing-author", "Article requires author (Person/Organization)"));
  if (!isStr(o.datePublished)) errors.push(err("$.datePublished", "missing-published", "Article requires datePublished (ISO date)"));
  if (!isStr(o.image) && !Array.isArray(o.image)) warnings.push(err("$.image", "missing-image", "image strongly recommended (Google rich result requirement)"));
}

function validateBreadcrumbList(o: Record<string, unknown>, errors: SchemaError[], warnings: SchemaError[]) {
  const items = o.itemListElement;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(err("$.itemListElement", "missing-items", "BreadcrumbList requires non-empty itemListElement"));
    return;
  }
  items.forEach((it, i) => {
    const path = `$.itemListElement[${i}]`;
    if (!isObj(it) || getType(it) !== "ListItem") {
      errors.push(err(path, "not-listitem", "Each breadcrumb must be @type:ListItem"));
      return;
    }
    if (typeof it.position !== "number") errors.push(err(`${path}.position`, "missing-position", "ListItem.position (1-indexed) required"));
    if (!isStr(it.name)) errors.push(err(`${path}.name`, "missing-name", "ListItem.name required"));
    if (!isStr(it.item)) warnings.push(err(`${path}.item`, "missing-url", "ListItem.item (URL) recommended"));
  });
  void warnings;
}

function validateAggregateRating(
  raw: unknown,
  path: string,
  errors: SchemaError[],
  warnings: SchemaError[],
) {
  if (!isObj(raw)) {
    errors.push(err(path, "not-an-object", "aggregateRating must be an object"));
    return;
  }
  const o = raw;
  const value = typeof o.ratingValue === "number" ? o.ratingValue : Number(o.ratingValue);
  if (!Number.isFinite(value) || value < 1 || value > 5) errors.push(err(`${path}.ratingValue`, "bad-rating", "ratingValue must be a number 1-5"));
  const count = typeof o.reviewCount === "number" ? o.reviewCount : Number(o.reviewCount);
  if (!Number.isFinite(count) || count < 1) errors.push(err(`${path}.reviewCount`, "bad-count", "reviewCount must be a positive number"));
  // Google requires reviewCount >= 1; under 5 they often refuse to render stars
  if (Number.isFinite(count) && count < 5) warnings.push(err(`${path}.reviewCount`, "few-reviews", `reviewCount=${count} — Google rarely shows stars under 5 reviews`));
}

function validateReview(raw: unknown, path: string, errors: SchemaError[], warnings: SchemaError[]) {
  if (!isObj(raw)) {
    errors.push(err(path, "not-an-object", "Review must be an object"));
    return;
  }
  const o = raw;
  if (!o.author) errors.push(err(`${path}.author`, "missing-author", "Review.author required"));
  if (!o.reviewRating) errors.push(err(`${path}.reviewRating`, "missing-rating", "Review.reviewRating (Rating) required"));
  if (!isStr(o.reviewBody)) warnings.push(err(`${path}.reviewBody`, "missing-body", "Review.reviewBody recommended"));
}

/**
 * Convenience: parse a JSON-LD string + validate. Returns a wrapper
 * matching SchemaValidation but with a parse_error code on bad JSON.
 */
export function validateJsonLdString(s: string): SchemaValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    return {
      ok: false,
      type: null,
      errors: [err("$", "parse-error", e instanceof Error ? e.message : "Invalid JSON")],
      warnings: [],
    };
  }
  // Array of multiple blocks (some pages use a @graph or array of blocks)
  if (Array.isArray(parsed)) {
    const allErrors: SchemaError[] = [];
    const allWarnings: SchemaError[] = [];
    const types: string[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const res = validateJsonLd(parsed[i]);
      if (res.type) types.push(res.type);
      if (!res.ok) {
        for (const e of res.errors) allErrors.push({ ...e, path: `[${i}]${e.path === "$" ? "" : e.path}` });
      }
      for (const w of res.warnings) allWarnings.push({ ...w, path: `[${i}]${w.path === "$" ? "" : w.path}` });
    }
    const typeLabel = types.join(", ") || null;
    if (allErrors.length > 0) return { ok: false, type: typeLabel, errors: allErrors, warnings: allWarnings };
    return { ok: true, type: typeLabel ?? "array", warnings: allWarnings };
  }
  return validateJsonLd(parsed);
}
