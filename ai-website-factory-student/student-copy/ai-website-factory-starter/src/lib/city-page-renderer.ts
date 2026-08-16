/**
 * city-page-renderer.ts — turns the build:page_generate "## SECTION: …" markdown
 * spec into a premium, mobile-first, fully styled HTML page.
 *
 * The content agent emits a rich section spec (hero · trust_strip · feature_grid ·
 * comparison_table · pricing_cards · process_steps · testimonial · area_highlights ·
 * faq_accordion · cta_block · related_links). Neither the editorial renderer nor the
 * old preview turned these into a real page — they dumped the spec as text. This
 * module parses the spec and emits a designed page styled to the project's Design
 * DNA palette (Bay-Street-Midnight / Operating-Authority-Gold / Ledger-Cream) with
 * Cormorant Garamond + Inter, premium inline SVG icons (never emoji), and a
 * responsive grid that collapses cleanly to one column on mobile.
 *
 * Parser is field-name tolerant: each section exposes flat `key: value` fields,
 * `- …` list items (with `·`-separated `key: value` pairs), `### name` card blocks,
 * and any raw markdown table — so sections whose exact field names vary still
 * render through a graceful generic path.
 */

export type CityPalette = {
  ink: string;      // primary dark
  gold: string;     // accent
  cream: string;    // surface
  text: string;     // body text on light
  muted: string;    // sub-labels
};

export const DEFAULT_CITY_PALETTE: CityPalette = {
  ink: "#0B1320",
  gold: "#B8935A",
  cream: "#F4EFE6",
  text: "#161616",
  muted: "#6B6357",
};

export type CityRenderInput = {
  markdown: string;
  businessName: string;
  city: string;
  phone?: string;
  palette?: Partial<CityPalette>;
  device?: "desktop" | "mobile";
};

/* ───────────────────────── escaping + inline md ───────────────────────── */
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only allow real CSS color literals into the <style> block — never raw,
 *  attacker-influenceable strings (DNA palette is LLM-generated). Prevents a
 *  </style><script> breakout. Falls back to the provided default. */
function safeColor(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$|^[a-z]{3,20}$/.test(v.trim())
    ? v.trim()
    : fallback;
}
/** minimal inline markdown: **bold**, strip surrounding quotes left as-is. */
function inline(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/* ───────────────────────── parser ───────────────────────── */
export type ParsedSection = {
  type: string;
  fields: Record<string, string>;
  items: Array<Record<string, string>>;   // from "- …" lines
  cards: Array<{ name: string; fields: Record<string, string> }>; // from "### …" blocks
  table: { headers: string[]; rows: string[][] } | null;
  rawLines: string[];
};

function parseKVsFromInline(s: string): Record<string, string> {
  // "stat: $5M · label: Commercial liability"  → {stat,label}
  const out: Record<string, string> = {};
  for (const part of s.split("·")) {
    const m = part.match(/^\s*([a-z0-9_]+)\s*:\s*(.+?)\s*$/i);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  if (Object.keys(out).length === 0) out.text = s.trim();
  return out;
}

export function parseSectionSpec(markdown: string): ParsedSection[] {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const sections: ParsedSection[] = [];
  let cur: ParsedSection | null = null;
  let curCard: { name: string; fields: Record<string, string> } | null = null;
  let tableBuf: string[] = [];

  const flushTable = () => {
    if (!cur || tableBuf.length < 2) { tableBuf = []; return; }
    const rowOf = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const headers = rowOf(tableBuf[0]);
    const rows = tableBuf.slice(2).map(rowOf); // skip the |---| separator
    cur.table = { headers, rows };
    tableBuf = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, "");
    const secM = line.match(/^##\s*SECTION:\s*([a-z0-9_]+)/i);
    if (secM) {
      flushTable();
      cur = { type: secM[1].toLowerCase(), fields: {}, items: [], cards: [], table: null, rawLines: [] };
      curCard = null;
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    cur.rawLines.push(line);

    if (/^\s*\|.*\|\s*$/.test(line)) { tableBuf.push(line); continue; }
    else if (tableBuf.length) flushTable();

    const cardM = line.match(/^###\s+(.+?)\s*$/);
    if (cardM) { curCard = { name: cardM[1].trim(), fields: {} }; cur.cards.push(curCard); continue; }

    const listM = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (listM) { cur.items.push(parseKVsFromInline(listM[1])); curCard = null; continue; }

    const kvM = line.match(/^\s*([a-z0-9_]+)\s*:\s*(.+?)\s*$/i);
    if (kvM) {
      const k = kvM[1].toLowerCase(), v = kvM[2].trim();
      if (curCard) curCard.fields[k] = v; else cur.fields[k] = v;
    }
  }
  flushTable();
  return sections;
}

/* ───────────────────────── premium icons (no emoji) ───────────────────────── */
const ICONS: Record<string, string> = {
  route: '<path d="M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h5"/><circle cx="18" cy="5" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3.2 7 7 8.5 3.8-1.5 7-4 7-8.5V6z"/><path d="m9 12 2 2 4-4"/>',
  meter: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-3M12 5V3M5 6 4 5M19 6l1-1"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  car: '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M5 13h14v4H5zM7 17v1.5M17 17v1.5"/><circle cx="8" cy="15" r="0"/>',
  star: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
function iconSvg(hint: string): string {
  const key = (hint || "").toLowerCase().replace(/[^a-z]/g, "");
  const path = ICONS[key] || ICONS[Object.keys(ICONS).find((k) => key.includes(k)) || ""] || ICONS.star;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/* ───────────────────────── section renderers ───────────────────────── */
function f(s: ParsedSection, ...keys: string[]): string {
  for (const k of keys) if (s.fields[k]) return s.fields[k];
  return "";
}

function renderHero(s: ParsedSection, biz: string, phone: string): string {
  const eyebrow = f(s, "eyebrow");
  const headline = f(s, "headline") || biz;
  const sub = f(s, "subhead", "subheadline", "sub");
  const cta1 = f(s, "primary_cta", "cta", "primary");
  const cta2 = f(s, "secondary_cta", "secondary");
  const proof = f(s, "hero_proof", "proof");
  return `<section class="hero">
    ${eyebrow ? `<div class="masthead">${esc(eyebrow)}</div>` : ""}
    <div class="hero-inner">
      <h1>${inline(headline)}</h1>
      ${sub ? `<p class="lede">${inline(sub)}</p>` : ""}
      <div class="cta-row">
        ${cta1 ? `<a class="btn gold" href="#reserve">${esc(cta1)}</a>` : ""}
        ${cta2 ? `<a class="btn ghost" href="${phone ? `tel:${esc(phone.replace(/[^0-9+]/g, ""))}` : "#reserve"}">${esc(cta2)}</a>` : ""}
      </div>
      ${proof ? `<p class="proof">${esc(proof)}</p>` : ""}
    </div>
  </section>`;
}

function renderTrustStrip(s: ParsedSection): string {
  const items = s.items.length ? s.items : [];
  if (!items.length) return "";
  return `<section class="trust"><div class="wrap trust-grid">
    ${items.map((it) => `<div class="trust-cell"><span class="stat">${esc(it.stat || it.text || "")}</span><span class="lbl">${esc(it.label || "")}</span></div>`).join("")}
  </div></section>`;
}

function renderFeatureGrid(s: ParsedSection): string {
  const cards = s.cards.length ? s.cards : [];
  if (!cards.length) return renderGeneric(s, "Why us");
  return `<section class="band"><div class="wrap">
    <div class="grid3">
      ${cards.map((c) => `<article class="fcard"><span class="ic">${iconSvg(c.fields.icon_hint || "star")}</span>
        <h3>${inline(c.fields.title || c.name)}</h3>
        <p>${inline(c.fields.body || "")}</p></article>`).join("")}
    </div></div></section>`;
}

function renderComparison(s: ParsedSection): string {
  if (!s.table) return renderGeneric(s, "How we compare");
  const { headers, rows } = s.table;
  return `<section class="band alt"><div class="wrap">
    <div class="ctable-wrap"><table class="ctable">
      <thead><tr>${headers.map((h, i) => `<th${i === 0 ? ' class="lead"' : ""}>${inline(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r, ri) => `<tr${ri === 0 ? ' class="ours"' : ""}>${r.map((c, ci) => `<td${ci === 0 ? ' class="lead"' : ""}>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></div></section>`;
}

function renderPricing(s: ParsedSection): string {
  const cards = s.cards.length ? s.cards : [];
  if (!cards.length) return renderGeneric(s, "Fleet & tariff");
  return `<section class="band"><div class="wrap">
    <div class="grid3">
      ${cards.map((c) => `<article class="pcard">
        <h3>${inline(c.fields.class || c.name)}</h3>
        ${c.fields.capacity ? `<p class="cap">${esc(c.fields.capacity)}</p>` : ""}
        ${c.fields.ideal ? `<p class="ideal">${inline(c.fields.ideal)}</p>` : ""}
        ${c.fields.marker ? `<p class="marker">${inline(c.fields.marker)}</p>` : ""}
      </article>`).join("")}
    </div></div></section>`;
}

function renderProcess(s: ParsedSection): string {
  const items = s.cards.length ? s.cards.map((c) => c.fields) : s.items;
  if (!items.length) return renderGeneric(s, "How it works");
  return `<section class="band alt"><div class="wrap"><ol class="steps">
    ${items.map((it, i) => `<li><span class="num">${String(i + 1).padStart(2, "0")}</span>
      <div><h3>${inline(it.title || it.step || it.text || "")}</h3>${it.body || it.detail ? `<p>${inline(it.body || it.detail)}</p>` : ""}</div></li>`).join("")}
  </ol></div></section>`;
}

function renderTestimonial(s: ParsedSection): string {
  const quotes = s.cards.length ? s.cards.map((c) => c.fields) : s.items;
  if (!quotes.length) return "";
  return `<section class="band"><div class="wrap"><div class="grid2">
    ${quotes.map((q) => `<figure class="quote"><blockquote>${inline(q.quote || q.text || "")}</blockquote>
      <figcaption>${esc(q.attribution || q.author || "")}</figcaption></figure>`).join("")}
  </div></div></section>`;
}

function renderAreas(s: ParsedSection, city: string): string {
  const items = s.items.length ? s.items : s.cards.map((c) => c.fields);
  if (!items.length) return renderGeneric(s, `Around ${city}`);
  return `<section class="band alt"><div class="wrap">
    <div class="hairline"><span>${esc(city)} · transit & landmarks</span></div>
    <div class="grid2 areas">
      ${items.map((it) => `<div class="arow"><span class="ad-item">${inline(it.item || it.text || "")}</span>${it.detail ? `<span class="ad-detail">${inline(it.detail)}</span>` : ""}</div>`).join("")}
    </div></div></section>`;
}

function renderFaq(s: ParsedSection): string {
  const items = s.cards.length ? s.cards.map((c) => c.fields) : s.items;
  const qa = items.map((it) => ({ q: it.question || it.q || it.title || it.text || "", a: it.answer || it.a || it.body || it.detail || "" })).filter((x) => x.q);
  if (!qa.length) return "";
  return `<section class="band"><div class="wrap narrow">
    <div class="hairline"><span>Questions, answered</span></div>
    ${qa.map((x) => `<details class="faq"><summary>${inline(x.q)}<span class="chev"></span></summary><div class="ans">${inline(x.a)}</div></details>`).join("")}
  </div></section>`;
}

function renderCta(s: ParsedSection, phone: string): string {
  const head = f(s, "headline", "title") || "Book your clean";
  const body = f(s, "body", "subhead", "text");
  const cta = f(s, "cta", "primary_cta", "button") || "See your fare";
  return `<section id="reserve" class="ctaband"><div class="wrap center">
    <h2>${inline(head)}</h2>${body ? `<p>${inline(body)}</p>` : ""}
    <div class="cta-row center">
      <a class="btn gold" href="#reserve">${esc(cta)}</a>
      ${phone ? `<a class="btn ghost-light" href="tel:${esc(phone.replace(/[^0-9+]/g, ""))}">${iconSvg("phone")} ${esc(phone)}</a>` : ""}
    </div></div></section>`;
}

function renderRelated(s: ParsedSection): string {
  const items = s.items.length ? s.items : s.cards.map((c) => c.fields);
  const links = items.map((it) => it.text || it.item || it.label || it.title || "").filter(Boolean);
  if (!links.length) return "";
  return `<section class="band alt"><div class="wrap">
    <div class="hairline"><span>Related</span></div>
    <div class="chips">${links.map((l) => `<a class="chip" href="#">${inline(l)}</a>`).join("")}</div>
  </div></section>`;
}

/** Graceful fallback for any section type / field shape we didn't special-case. */
function renderGeneric(s: ParsedSection, title: string): string {
  const blocks: string[] = [];
  const heading = f(s, "headline", "title") || title;
  const body = f(s, "body", "subhead", "text");
  if (body) blocks.push(`<p class="lede dark">${inline(body)}</p>`);
  if (s.cards.length) {
    blocks.push(`<div class="grid3">${s.cards.map((c) => `<article class="fcard"><h3>${inline(c.fields.title || c.name)}</h3><p>${inline(c.fields.body || c.fields.detail || "")}</p></article>`).join("")}</div>`);
  }
  if (s.items.length) {
    blocks.push(`<ul class="plain">${s.items.map((it) => `<li>${inline(it.text || it.item || Object.values(it).join(" · "))}</li>`).join("")}</ul>`);
  }
  if (!blocks.length) return "";
  return `<section class="band"><div class="wrap"><h2>${inline(heading)}</h2>${blocks.join("")}</div></section>`;
}

/* ───────────────────────── document shell ───────────────────────── */
export function renderCityPageFromSpec(input: CityRenderInput): string {
  const merged = { ...DEFAULT_CITY_PALETTE, ...(input.palette || {}) };
  const p: CityPalette = {
    ink: safeColor(merged.ink, DEFAULT_CITY_PALETTE.ink),
    gold: safeColor(merged.gold, DEFAULT_CITY_PALETTE.gold),
    cream: safeColor(merged.cream, DEFAULT_CITY_PALETTE.cream),
    text: safeColor(merged.text, DEFAULT_CITY_PALETTE.text),
    muted: safeColor(merged.muted, DEFAULT_CITY_PALETTE.muted),
  };
  const biz = input.businessName || "Limo Service";
  const city = input.city || "your city";
  const phone = input.phone || "";
  const sections = parseSectionSpec(input.markdown);

  const body = sections.map((s) => {
    switch (s.type) {
      case "hero": return renderHero(s, biz, phone);
      case "trust_strip": return renderTrustStrip(s);
      case "feature_grid": return renderFeatureGrid(s);
      case "comparison_table": return renderComparison(s);
      case "pricing_cards": return renderPricing(s);
      case "process_steps": return renderProcess(s);
      case "testimonial": return renderTestimonial(s);
      case "area_highlights": return renderAreas(s, city);
      case "faq_accordion": return renderFaq(s);
      case "cta_block": return renderCta(s, phone);
      case "related_links": return renderRelated(s);
      default: return renderGeneric(s, s.type.replace(/_/g, " "));
    }
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:${p.ink};--gold:${p.gold};--cream:${p.cream};--text:${p.text};--muted:${p.muted};}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Inter,system-ui,sans-serif;color:var(--text);background:var(--cream);line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;line-height:1.08;letter-spacing:-.01em}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.wrap.narrow{max-width:820px}.center{text-align:center}
.tnum{font-variant-numeric:tabular-nums}
section{padding:clamp(48px,7vw,96px) 0}
.band{background:#fff}.band.alt{background:var(--cream)}
/* hero */
.hero{background:var(--ink);color:#fff;padding:0;position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;inset:0;background:radial-gradient(120% 80% at 80% 0%,rgba(184,147,90,.18),transparent 60%)}
.masthead{position:relative;border-bottom:1px solid rgba(184,147,90,.32);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);padding:12px 24px;font-variant-numeric:tabular-nums;text-align:center}
.hero-inner{position:relative;max-width:1180px;margin:0 auto;padding:clamp(64px,10vw,140px) 24px}
.hero h1{font-size:clamp(40px,7vw,82px);max-width:16ch}
.hero .lede{margin-top:22px;max-width:60ch;font-size:clamp(16px,2.2vw,20px);color:rgba(255,255,255,.82)}
.cta-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:34px}.cta-row.center{justify-content:center}
.btn{display:inline-flex;align-items:center;gap:9px;padding:15px 28px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease;min-height:48px}
.btn svg{width:18px;height:18px}
.btn.gold{background:var(--gold);color:var(--ink);box-shadow:0 8px 24px -8px rgba(184,147,90,.6)}
.btn.gold:hover{transform:translateY(-2px)}
.btn.ghost{border:1px solid rgba(255,255,255,.4);color:#fff}
.btn.ghost-light{border:1px solid var(--ink);color:var(--ink)}
.hero .proof{margin-top:26px;font-size:13px;color:rgba(255,255,255,.6);letter-spacing:.02em}
/* trust */
.trust{background:var(--ink);padding:0;border-top:1px solid rgba(184,147,90,.25)}
.trust-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:rgba(184,147,90,.18)}
.trust-cell{background:var(--ink);padding:26px 18px;text-align:center}
.trust .stat{display:block;font-family:"Cormorant Garamond",serif;font-size:26px;color:var(--gold);font-variant-numeric:tabular-nums}
.trust .lbl{display:block;margin-top:6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.55)}
/* grids */
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.fcard{background:var(--cream);border:1px solid rgba(11,19,32,.08);border-radius:12px;padding:30px}
.fcard .ic{display:inline-flex;width:46px;height:46px;align-items:center;justify-content:center;border-radius:10px;background:var(--ink);color:var(--gold);margin-bottom:16px}
.fcard .ic svg{width:24px;height:24px}
.fcard h3{font-size:23px;margin-bottom:8px}.fcard p{color:var(--muted);font-size:15px}
/* pricing */
.pcard{background:var(--ink);color:#fff;border-radius:14px;padding:30px;border:1px solid rgba(184,147,90,.25)}
.pcard h3{font-size:24px;color:#fff}
.pcard .cap{margin-top:8px;color:rgba(255,255,255,.6);font-size:13px;letter-spacing:.02em}
.pcard .ideal{margin-top:14px;color:rgba(255,255,255,.8);font-size:14.5px}
.pcard .marker{margin-top:18px;font-family:"Cormorant Garamond",serif;font-size:24px;color:var(--gold);font-variant-numeric:tabular-nums;border-top:1px solid rgba(184,147,90,.3);padding-top:14px}
/* comparison */
.ctable-wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(11,19,32,.1)}
.ctable{width:100%;border-collapse:collapse;font-size:14px;min-width:680px}
.ctable th,.ctable td{padding:15px 18px;text-align:left;border-bottom:1px solid rgba(11,19,32,.08)}
.ctable thead th{background:var(--ink);color:#fff;font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em}
.ctable td.lead,.ctable th.lead{font-weight:600}
.ctable tr.ours td{background:rgba(184,147,90,.12)}
.ctable tr.ours td.lead{color:var(--ink);box-shadow:inset 3px 0 0 var(--gold)}
/* steps */
.steps{list-style:none;display:grid;gap:20px;counter-reset:s}
.steps li{display:flex;gap:20px;align-items:flex-start}
.steps .num{font-family:"Cormorant Garamond",serif;font-size:34px;color:var(--gold);line-height:1;min-width:54px;font-variant-numeric:tabular-nums}
.steps h3{font-size:21px}.steps p{color:var(--muted);font-size:15px;margin-top:4px}
/* quote */
.quote blockquote{font-family:"Cormorant Garamond",serif;font-size:24px;line-height:1.4;color:var(--ink)}
.quote blockquote:before{content:"“";color:var(--gold);font-size:34px;line-height:0;vertical-align:-.2em;margin-right:4px}
.quote figcaption{margin-top:16px;font-size:13px;color:var(--muted);letter-spacing:.02em}
/* areas */
.hairline{border-top:1px solid var(--gold);padding-top:12px;margin-bottom:28px}
.hairline span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.areas .arow{padding:16px 0;border-bottom:1px solid rgba(11,19,32,.08)}
.ad-item{display:block;font-weight:600;color:var(--ink)}
.ad-detail{display:block;margin-top:4px;color:var(--muted);font-size:14.5px}
/* faq */
.faq{border-bottom:1px solid rgba(11,19,32,.12)}
.faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 0;font-weight:600;font-size:17px;color:var(--ink)}
.faq summary::-webkit-details-marker{display:none}
.faq .chev{width:11px;height:11px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg);transition:transform .2s;flex:none}
.faq[open] .chev{transform:rotate(-135deg)}
.faq .ans{padding:0 0 22px;color:var(--muted);font-size:15px;max-width:70ch}
/* cta */
.ctaband{background:var(--ink);color:#fff;text-align:center}
.ctaband h2{font-size:clamp(30px,4.5vw,48px)}
.ctaband p{margin:16px auto 28px;max-width:54ch;color:rgba(255,255,255,.78)}
/* misc */
.lede.dark{color:var(--muted);max-width:64ch;font-size:18px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{padding:9px 16px;border:1px solid rgba(11,19,32,.15);border-radius:999px;text-decoration:none;color:var(--ink);font-size:14px;font-weight:500}
.chip:hover{border-color:var(--gold);color:var(--gold)}
.plain{padding-left:18px;color:var(--muted)}
h2{font-size:clamp(28px,4vw,44px);margin-bottom:18px;color:var(--ink)}
/* responsive */
@media(max-width:900px){.grid3{grid-template-columns:repeat(2,1fr)}.trust-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:620px){
  .grid3,.grid2{grid-template-columns:1fr}
  .trust-grid{grid-template-columns:repeat(2,1fr)}
  .hero h1{font-size:36px}.cta-row .btn{width:100%;justify-content:center}
  .steps li{gap:14px}.steps .num{font-size:28px;min-width:42px}
}
</style></head>
<body>${body}</body></html>`;
}
