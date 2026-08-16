/**
 * site-renderer.ts — parameterized static-site render engine (ported from
 * the operator's earlier standalone build script; now serves the Dubai
 * cleaning-services portfolio).
 *
 * Renders a SINGLE full HTML document (string) for one Studio page, driven entirely
 * by parameters — no filesystem reads, no JSON imports, no writeFileSync. The CSS and
 * the app.js interactions are inlined so the document works inside an iframe `srcDoc`.
 *
 * The component library (header / multi-step hero form / EEAT / steps / services
 * carousel / features / fleet / areas / what-to-expect / FAQ accordion / contact /
 * mega-footer / CTA band / on-theme SVG scenes / distributed editorial chunks /
 * area-page sections) is ported verbatim; only the `:root` palette, fonts and the
 * business-specific copy are parameterized.
 *
 * Pure TypeScript — no Node-only APIs. Runs server-side in Next but never touches fs.
 */
import { sectionsForPageType } from "./page-section-specs";

/* ---------------------------------------------------------------------------- *
 *  Public API (must match — another module imports these names)
 * ---------------------------------------------------------------------------- */

export type StudioPalette = {
  base: string;
  surface: string;
  surface2: string;
  accent: string;
  gold2: string;
  ink: string;
  muted: string;
  line: string;
  displayFont: string;
  bodyFont: string;
};

export type StudioBusiness = {
  businessName: string;
  /** Business niche / industry, e.g. "dental clinic". Drives generic copy fallbacks. */
  niche?: string;
  city: string;
  region?: string;
  phone: string;
  email: string;
  services: { label: string; slug: string; blurb?: string }[];
  areas: { label: string; slug: string }[];
  logoA?: string; // first half of wordmark, e.g. "Capital"
  logoB?: string; // second/accent half, e.g. "Limos"
};

export type StudioRenderPage = {
  pageType: string;
  pageSlug: string;
  title: string;
  h1?: string | null;
  metaDescription?: string | null;
  bodyHtml?: string | null;
  faq?: { q: string; a: string }[] | null;
};

export type StudioRenderInput = {
  business: StudioBusiness;
  palette: StudioPalette;
  page: StudioRenderPage;
  /** ordered ENABLED section types to emit in the mid-body; if omitted, use the canonical default for page.pageType */
  sections?: string[];
  device?: "desktop" | "mobile";
};

export const DEFAULT_STUDIO_PALETTE: StudioPalette = {
  base: "#0b0d12",
  surface: "#14171f",
  surface2: "#1b1f29",
  accent: "#c9a43c",
  gold2: "#e7c766",
  ink: "#f4f1ea",
  muted: "#b7b3a9",
  line: "rgba(201,164,60,.28)",
  displayFont: "Playfair Display",
  bodyFont: "Source Sans 3",
};

/* ---------------------------------------------------------------------------- *
 *  Helpers
 * ---------------------------------------------------------------------------- */

const escAttr = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escHtml = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const telHref = (phone: string): string => "tel:" + String(phone || "").replace(/[^\d+]/g, "");
const mailHref = (email: string): string => "mailto:" + String(email || "");
const slugify = (s: string): string => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Internal links are preview-only placeholders.
const href = (slug: string): string => {
  const s = String(slug || "");
  if (!s || s === "#") return "#";
  if (/^(https?:|tel:|mailto:|#|\.|\/)/.test(s)) return s;
  return "./" + s.replace(/^\/+|\/+$/g, "");
};

/* ---- unique-id generator for SVG defs (per render) ---- */
function makeUid(): () => string {
  let n = 0;
  return () => "g" + ++n;
}

/* ---------------------------------------------------------------------------- *
 *  defaultPaletteFromDna — extract hex colors from a designDna jsonb blob
 * ---------------------------------------------------------------------------- */
export function defaultPaletteFromDna(dna: unknown): StudioPalette {
  const out: StudioPalette = { ...DEFAULT_STUDIO_PALETTE };
  if (!dna || typeof dna !== "object") return out;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dna as any;

  let hexes: string[] = [];
  if (Array.isArray(d.palette)) {
    hexes = d.palette.filter((x: unknown) => typeof x === "string" && /^#?[0-9a-fA-F]{6}$/.test(String(x))).map((x: string) => (x.startsWith("#") ? x : "#" + x));
  } else if (typeof d.markdown === "string") {
    const m = d.markdown.match(/#[0-9a-fA-F]{6}/g);
    if (m) hexes = m;
  } else if (typeof d.palette === "string") {
    const m = d.palette.match(/#[0-9a-fA-F]{6}/g);
    if (m) hexes = m;
  }

  // De-dup, keep order.
  hexes = Array.from(new Set(hexes.map((h) => h.toLowerCase())));

  // Sort by luminance so we can map darkest→base, brightest→ink, and pick a
  // mid-bright saturated one as the accent.
  const lum = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const sat = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16) / 255,
      g = parseInt(hex.slice(3, 5), 16) / 255,
      b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };

  if (hexes.length) {
    const byLum = [...hexes].sort((a, b) => lum(a) - lum(b));

    // ── Accent must be VIVID and clearly readable on a dark base. Pick the most
    // saturated colour in a safe luminance band (not near-black, not near-white).
    // Blindly using palette[0] is wrong — it's often the dark brand background,
    // which would make every gold button invisible (accent == base). ──────────
    const vivid = hexes
      .filter((h) => sat(h) >= 0.28 && lum(h) >= 45 && lum(h) <= 220)
      .sort((a, b) => sat(b) - sat(a) || lum(b) - lum(a));
    if (vivid.length) {
      out.accent = vivid[0];
      out.gold2 = lighten(vivid[0], 0.2);
      out.line = hexToRgba(vivid[0], 0.28);
    }
    // else: keep the DEFAULT vivid gold accent/gold2/line — never go dark-on-dark.

    // ── Dark luxury theme: backgrounds stay dark, text stays light. Only adopt
    // a DNA colour for base/ink when it's actually dark/light enough; otherwise
    // keep the proven default so contrast is guaranteed. ──────────────────────
    const darkest = byLum[0];
    const lightest = byLum[byLum.length - 1];
    if (darkest && lum(darkest) <= 60) {
      out.base = darkest;
      out.surface = byLum[1] && lum(byLum[1]) <= 80 ? byLum[1] : lighten(darkest, 0.06);
      out.surface2 = lighten(out.surface, 0.05);
    }
    if (lightest && lum(lightest) >= 180) out.ink = lightest;
  }
  return out;
}

/** Lighten a #rrggbb toward white by `amt` (0..1). */
function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const ch = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    const nv = Math.round(v + (255 - v) * amt);
    return Math.max(0, Math.min(255, nv)).toString(16).padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(201,164,60,${a})`;
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------------------------------------------------------------------- *
 *  SVG scene placeholders — NICHE-NEUTRAL abstract art.
 *
 *  These are tasteful gradient / geometric / framed compositions that read as
 *  intentional brand illustration for ANY business (dental, legal, HVAC, yoga,
 *  …). No vehicles, no industry-specific imagery. They use the palette accent
 *  colors passed at render time via the per-scene `ac` (accent) value so the art
 *  always matches the site. The `scenes` object keeps the SAME keys the rest of
 *  the renderer references (skyline/about/reservation/etc.) so emitters are
 *  unchanged — only the drawn content is now generic.
 * ---------------------------------------------------------------------------- */
type SceneCtx = { uid: () => string; ac: string; ac2: string; ink: string; base: string };

const GRAD = (id: string, a: string, b: string): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const dots = (n: number, w: number, h: number, c: string): string =>
  Array.from({ length: n }, (_, i) => `<circle cx="${(i * 137) % w}" cy="${(i * 53) % (h * 0.55)}" r="${i % 3 ? 1 : 1.6}" fill="${c}" opacity="${0.18 + (i % 4) * 0.08}"/>`).join("");
const F = (inner: string, vb = "0 0 1200 560"): string =>
  `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">${inner}</svg>`;

// Soft concentric-ring / orbit motif — calm, premium, industry-neutral.
function rings(cx: number, cy: number, ac: string): string {
  let out = "";
  for (let i = 4; i >= 1; i--) out += `<circle cx="${cx}" cy="${cy}" r="${i * 52}" fill="none" stroke="${ac}" stroke-width="1.4" opacity="${0.10 + (4 - i) * 0.06}"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="34" fill="${ac}" opacity=".85"/>`;
  return out;
}
// Layered "mountain/wave" band — abstract horizon, no skyline buildings.
function waveBand(y: number, ac: string, ac2: string): string {
  return (
    `<path d="M0,${y} C200,${y - 70} 360,${y + 30} 600,${y - 20} C840,${y - 70} 1000,${y + 20} 1200,${y - 30} L1200,560 L0,560 Z" fill="${ac2}" opacity=".16"/>` +
    `<path d="M0,${y + 50} C220,${y - 10} 420,${y + 90} 640,${y + 30} C860,${y - 30} 1020,${y + 70} 1200,${y + 20} L1200,560 L0,560 Z" fill="${ac}" opacity=".12"/>`
  );
}
// Floating rounded tiles — works as a generic "content/services" backdrop.
function tileGrid(ac: string): string {
  let out = "";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    if ((r + c) % 2 === 0) continue;
    out += `<rect x="${120 + c * 190}" y="${120 + r * 110}" width="150" height="80" rx="14" fill="${ac}" opacity="${0.08 + ((r + c) % 3) * 0.05}"/>`;
  }
  return out;
}

type SceneFn = (ctx: SceneCtx) => string;

// Scene builders take the per-render uid + palette accents so the abstract art
// matches the site. Keys are preserved for back-compat; the `pin`/`s` flags are
// accepted-and-ignored so existing call sites keep working.
const scenes = {
  skyline:
    (_pin?: boolean): SceneFn =>
    ({ uid, ac, ac2, ink }) => {
      const g = uid();
      return F(
        `<defs>${GRAD(g, "#0c1018", "#1a2133")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${dots(36, 1200, 560, ink)}${rings(940, 170, ac)}${waveBand(420, ac, ac2)}`
      );
    },
  airport:
    (): SceneFn =>
    ({ uid, ac, ac2, ink }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0b0f18", "#202a3d")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${dots(30, 1200, 560, ink)}${waveBand(380, ac, ac2)}${rings(260, 200, ac)}`);
    },
  wedding:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(
        `<defs><radialGradient id="${g}" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#1b1b22"/><stop offset="1" stop-color="#0c0d12"/></radialGradient></defs><rect width="1200" height="560" fill="url(#${g})"/><g fill="none" stroke="${ac}" stroke-width="3" opacity=".5">${rings(600, 280, ac2)}</g>`
      );
    },
  stretch:
    (_s?: boolean): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0b0f18", "#191f2e")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${tileGrid(ac)}${waveBand(440, ac, ac2)}`);
    },
  bus:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0c0f18", "#1d1730")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${tileGrid(ac)}${waveBand(460, ac, ac2)}`);
    },
  nightout:
    (): SceneFn =>
    ({ uid, ac, ac2, ink }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0a0c16", "#241a33")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${dots(48, 1200, 560, ink)}${rings(960, 150, ac)}${waveBand(430, ac, ac2)}`);
    },
  sedan:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0c1018", "#171d2b")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${rings(600, 290, ac)}${waveBand(430, ac, ac2)}`);
    },
  suv:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0c1018", "#171d2b")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${tileGrid(ac)}${waveBand(430, ac, ac2)}`);
    },
  fleetline:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(`<defs>${GRAD(g, "#0c1018", "#1a2030")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${tileGrid(ac)}${waveBand(450, ac, ac2)}`);
    },
  reservation:
    (): SceneFn =>
    ({ uid, ac, ac2, ink }) => {
      const g = uid();
      return F(
        `<defs>${GRAD(g, "#0c1018", "#181f2e")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${dots(24, 1200, 560, ink)}<g transform="translate(430,150)"><rect x="0" y="0" width="340" height="260" rx="18" fill="#101726" stroke="${ac}" stroke-width="2"/><rect x="0" y="0" width="340" height="56" rx="18" fill="${ac}"/><rect x="0" y="40" width="340" height="16" fill="${ac}"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${28 + (i % 4) * 78}" y="${92 + Math.floor(i / 4) * 50}" width="48" height="34" rx="6" fill="#1b2230"/>`).join("")}<path d="M150,210 l34,34 70,-86" fill="none" stroke="${ac2}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`
      );
    },
  about:
    (): SceneFn =>
    ({ uid, ac, ac2 }) => {
      const g = uid();
      return F(
        `<defs>${GRAD(g, "#0c1018", "#171d2b")}</defs><rect width="1200" height="560" fill="url(#${g})"/>${rings(600, 280, ac)}${waveBand(460, ac, ac2)}`
      );
    },
};

// data-slot is kept for the Studio's future photo-swap feature, but no visible
// "photo:" dev label — the SVG reads as intentional brand illustration.
const slot = (svg: string, id: string): string => `<div class="slot" data-slot="${escAttr(id)}">${svg}</div>`;

/* ---------------------------------------------------------------------------- *
 *  Inline icons
 * ---------------------------------------------------------------------------- */
const icon = (d: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const IC: Record<string, string> = {
  shield: '<path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  car: '<path d="M5 16v-3l2-5h10l2 5v3"/><path d="M3 16h18"/><circle cx="7.5" cy="18" r="1.4"/><circle cx="16.5" cy="18" r="1.4"/>',
  plane: '<path d="M10.5 13.5 3 11l1-2 8 1 4.5-5a2 2 0 1 1 3 3l-5 4.5 1 8-2 1-2.5-7.5L7 20l-2-1 1-4z"/>',
  star: '<path d="M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.6 6.6 19.5 7.9 13.6 3.4 9.6l6-.6z"/>',
  medal: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-2 7 5.5-3 5.5 3-2-7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 0 1 0 6"/>',
  phone: '<path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7"/>',
  badge: '<path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z"/>',
  sparkle: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
};

/* ---------------------------------------------------------------------------- *
 *  Static section data (facts-free, not business claims)
 * ---------------------------------------------------------------------------- */
// Generic "gallery"/showcase cards — niche-neutral placeholders. Each uses an
// abstract scene; copy is intentionally generic until the content agent fills it.
const GALLERY = [
  { name: "Our work", cap: "Quality you can see", lug: "Done right", best: "Every project", scene: scenes.sedan() },
  { name: "Our team", cap: "Friendly & professional", lug: "Experienced", best: "Here to help", scene: scenes.about() },
  { name: "Our space", cap: "Clean & welcoming", lug: "Well-equipped", best: "Built for you", scene: scenes.suv() },
  { name: "Our results", cap: "Trusted outcomes", lug: "Proven", best: "Happy customers", scene: scenes.skyline() },
];
const EEAT = [
  { ic: "medal", h: "Experience", t: "Years of hands-on work serving customers across the area, every kind of need." },
  { ic: "badge", h: "Expertise", t: "A team that knows the work — and gets the details right the first time." },
  { ic: "shield", h: "Authority", t: "Properly licensed and insured, with vetted, qualified professionals." },
  { ic: "star", h: "Trust", t: "Clear, up-front pricing and dependable service — no surprises, ever." },
];
const STEPS = [
  { n: "1", h: "Tell us what you need", t: "Book online in minutes or give us a call." },
  { n: "2", h: "We confirm the details", t: "You get a clear plan and an up-front quote." },
  { n: "3", h: "We get to work", t: "Our team shows up prepared and on time." },
  { n: "4", h: "You're taken care of", t: "Quality work, done right, every time." },
];
const FEATURES = [
  { ic: "badge", h: "Clear, up-front pricing" },
  { ic: "clock", h: "Fast, reliable scheduling" },
  { ic: "star", h: "Highly rated service" },
  { ic: "shield", h: "Licensed & insured" },
  { ic: "users", h: "Friendly, expert team" },
  { ic: "pin", h: "Serving the whole area" },
];
const INCL = [
  "A clear, up-front quote before any work begins",
  "Friendly, professional service from start to finish",
  "Qualified, vetted team members",
  "Quality you can count on",
  "Responsive support when you need it",
  "Local knowledge and care",
];
// Generic, city-parameterized fallbacks for an "areas" / coverage section.
const GENERIC_PLACES = ["Downtown core", "Business district", "Neighborhoods nearby", "Surrounding towns", "Shopping centres", "Transit hubs"];

/* ---------------------------------------------------------------------------- *
 *  CSS — :root is palette-driven; the rest is verbatim from the source.
 * ---------------------------------------------------------------------------- */
function buildCss(pal: StudioPalette): string {
  const root = `:root{--base:${pal.base};--surface:${pal.surface};--surface2:${pal.surface2};--accent:${pal.accent};--gold2:${pal.gold2};--ink:${pal.ink};--muted:${pal.muted};--line:${pal.line}}`;
  const disp = `'${pal.displayFont}',Georgia,serif`;
  const body = `'${pal.bodyFont}',system-ui,sans-serif`;
  return `
${root}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--base);color:var(--ink);font-family:${body};font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
h1,h2,h3{font-family:${disp};font-weight:600;line-height:1.12}
h1{font-size:clamp(2.4rem,5vw,3.8rem);margin:.12em 0 .3em}h2{font-size:2.1rem;margin:0 0 .4em}h3{font-size:1.25rem;margin:0 0 .35em}
p{opacity:.92;margin:0 0 1.05em}a{color:inherit}.gold{color:var(--accent)}
.eyebrow{font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 .7em;display:inline-block}
.accent-rule{width:54px;height:3px;background:var(--accent);border-radius:3px;margin:.1em 0 1.3em}
.btn{display:inline-flex;align-items:center;gap:.5em;background:linear-gradient(135deg,var(--gold2),var(--accent));color:#191407;font-weight:700;padding:.8em 1.4em;border-radius:999px;text-decoration:none;min-height:46px;border:0;cursor:pointer;font-size:1rem;box-shadow:0 8px 24px rgba(201,164,60,.25);transition:transform .15s}
.btn:hover{transform:translateY(-2px)}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none}
.slot{position:relative;width:100%;height:100%;overflow:hidden}.slot-tag{position:absolute;left:8px;bottom:8px;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#cdbf9d;background:rgba(8,10,15,.6);border:1px dashed rgba(201,164,60,.5);border-radius:6px;padding:2px 7px}
/* header */
header.site{position:sticky;top:0;z-index:40;background:rgba(11,13,18,.9);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06)}
.topbar{display:flex;align-items:center;gap:18px;min-height:66px}
.logo{font-family:${disp};font-size:1.35rem;font-weight:700;text-decoration:none}.logo b{color:var(--accent)}
nav.main{display:flex;gap:20px;margin-left:auto;font-size:.95rem}nav.main a{text-decoration:none;opacity:.86;padding:6px 2px}nav.main a:hover{color:var(--accent);opacity:1}
.hdr-contact{display:flex;align-items:center;gap:14px;font-size:.9rem}
.hdr-contact a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:var(--ink);opacity:.9}.hdr-contact a:hover{color:var(--accent)}
.hdr-contact svg{width:17px;height:17px;color:var(--accent)}
.hdr-contact .btn{padding:.5em 1.05em;min-height:40px;font-size:.88rem}
.nav-toggle{display:none;margin-left:auto;background:none;border:1px solid var(--line);color:var(--ink);border-radius:10px;width:46px;height:46px;cursor:pointer}
.nav-toggle svg{width:22px;height:22px}
/* hero */
.hero{position:relative;min-height:560px;display:flex;align-items:center;overflow:hidden}
.hero-bg{position:absolute;inset:0}.hero-bg .slot{height:100%}
.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,9,13,.93),rgba(7,9,13,.6) 52%,rgba(7,9,13,.28));z-index:1}
.hero .wrap{position:relative;z-index:2;display:grid;grid-template-columns:1.05fr .95fr;gap:44px;align-items:center;padding:74px 24px;width:100%}
.hero.solo .wrap{grid-template-columns:1fr;max-width:880px}
.hero .sub{font-size:1.16rem;opacity:.92;margin-bottom:1.4em;max-width:600px}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
.pill-row{display:flex;gap:20px;flex-wrap:wrap;margin-top:26px}.pill-row .t{display:flex;align-items:center;gap:8px;font-size:.9rem;color:var(--muted)}.pill-row svg{width:20px;height:20px;color:var(--accent)}
.ribbon{display:inline-block;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold2);border:1px dashed rgba(201,164,60,.5);border-radius:999px;padding:5px 12px;margin-bottom:14px}
/* multi-step form */
.qform{background:linear-gradient(180deg,#faf7f0,#efe9da);color:#191407;border-radius:18px;padding:24px;box-shadow:0 30px 70px rgba(0,0,0,.5)}
.qform .qe{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#8a6d1f;font-weight:800}
.qform h3{font-family:${disp};color:#191407;margin:2px 0 12px}
.qf-dots{display:flex;gap:8px;margin-bottom:14px}.qf-dots span{flex:1;height:5px;border-radius:3px;background:#d9cdab}.qf-dots span.on{background:var(--accent)}
.qfield{margin-bottom:11px}.qfield label{display:block;font-size:.76rem;font-weight:700;color:#5b5444;margin:0 0 5px}
.qfield input,.qfield select{width:100%;border:1px solid #cdbf9d;background:#fff;border-radius:10px;padding:12px 13px;font:inherit;color:#191407;min-height:46px}
.qf-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qf-step[hidden]{display:none}.qf-nav{display:flex;gap:10px;margin-top:14px}.qf-nav .btn{flex:1;justify-content:center}
.qf-back{background:transparent;border:1px solid #cdbf9d;color:#5b5444;box-shadow:none}
/* generic band */
section.band{padding:84px 0;border-top:1px solid rgba(255,255,255,.05)}section.alt{background:var(--surface)}
.sec-head{text-align:center;max-width:680px;margin:0 auto 40px}.sec-head .accent-rule{margin-left:auto;margin-right:auto}
/* eeat */
.eeat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.eeat-card{background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:24px}
.eeat-card .ic{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:rgba(201,164,60,.12);margin-bottom:14px}.eeat-card .ic svg{width:24px;height:24px;color:var(--accent)}
.eeat-card p{font-size:.94rem;color:var(--muted);margin:0}
/* steps */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;counter-reset:s}
.step{position:relative;padding:0 6px}.step .n{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-family:${disp};font-size:1.3rem;color:#191407;background:linear-gradient(135deg,var(--gold2),var(--accent));margin-bottom:14px;font-weight:700}
.step p{font-size:.94rem;color:var(--muted);margin:0}
/* features */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.feat{display:flex;align-items:center;gap:14px;background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:18px 20px}
.feat .ic{width:42px;height:42px;flex:none;border-radius:11px;display:grid;place-items:center;background:rgba(201,164,60,.12)}.feat .ic svg{width:22px;height:22px;color:var(--accent)}.feat h3{font-size:1.02rem;margin:0;font-family:${body};font-weight:700}
/* carousel */
.carousel{position:relative}.car-viewport{overflow:hidden}
.car-track{display:flex;gap:20px;transition:transform .4s ease}
.car-track>*{flex:0 0 calc((100% - 40px)/3)}
.car-btn{position:absolute;top:38%;z-index:3;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);background:rgba(11,13,18,.8);color:var(--ink);cursor:pointer;display:grid;place-items:center}
.car-btn:hover{background:var(--accent);color:#191407}.car-btn svg{width:22px;height:22px}.car-prev{left:-10px}.car-next{right:-10px}
.car-dots{display:flex;gap:9px;justify-content:center;margin-top:24px}
.car-dots button{width:9px;height:9px;border-radius:50%;border:0;background:#3a3f4b;cursor:pointer;padding:0}.car-dots button.on{background:var(--accent);width:24px;border-radius:5px}
.pcard{background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:16px;overflow:hidden;text-decoration:none;display:block;transition:border-color .15s,transform .15s}
.pcard:hover{border-color:var(--line);transform:translateY(-3px)}.pcard .thumb{aspect-ratio:16/10}.pcard .pc{padding:18px}
.pcard h3{font-size:1.12rem;margin:0 0 3px}.pcard p{font-size:.9rem;color:var(--muted);margin:0 0 10px}.pcard .more{color:var(--accent);font-weight:700;font-size:.88rem}
.pcard .spec{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.pcard .spec span{font-size:.74rem;color:var(--muted);background:rgba(255,255,255,.05);border-radius:6px;padding:3px 8px}
/* areas */
.areas-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
.acard{background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:border-color .15s,transform .15s}.acard:hover{border-color:var(--line);transform:translateY(-3px)}
.acard .thumb{aspect-ratio:4/3}.acard .ac{padding:14px 16px}.acard h3{font-size:1.05rem;margin:0}.acard span{color:var(--accent);font-size:.82rem;font-weight:700}
/* feature/body */
.feature{display:grid;grid-template-columns:1.1fr .9fr;gap:44px;align-items:center}.feature .art{border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.07);aspect-ratio:16/11;box-shadow:0 24px 60px rgba(0,0,0,.4)}
.body-copy{max-width:760px}.body-copy h2{margin-top:1.4em}.body-copy h2:first-child{margin-top:0}
.prose{max-width:880px;margin:0 auto}.prose h2{font-size:1.6rem;margin:1.5em 0 .4em}.prose h2:first-child{margin-top:0}.prose p{font-size:1.06rem}
.feature.rev .art{order:-1}
.callout{display:grid;grid-template-columns:1.1fr .9fr;gap:32px;align-items:center;background:var(--surface2);border:1px solid var(--line);border-radius:18px;padding:32px}
.callout h2{font-size:1.7rem}.callout p{color:var(--muted)}.callout-art{border-radius:14px;overflow:hidden;aspect-ratio:16/10}
.incl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.incl{display:flex;align-items:flex-start;gap:12px;background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px}.incl svg{width:22px;height:22px;color:var(--accent);flex:none;margin-top:2px}.incl span{font-size:.96rem}
@media(max-width:760px){.callout{grid-template-columns:1fr}.incl-grid{grid-template-columns:1fr}}
.places-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.place{display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px 18px}.place svg{width:22px;height:22px;color:var(--accent);flex:none}.place span{font-weight:600}
.airtable{width:100%;border-collapse:collapse;margin:.4em 0 1em}.airtable th{text-align:left;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);padding:10px 8px;border-bottom:1px solid var(--line)}.airtable td{padding:13px 8px;border-bottom:1px solid rgba(255,255,255,.08)}.airtable td:first-child{font-weight:600}
@media(max-width:760px){.places-grid{grid-template-columns:1fr}}
/* expect (reviews substitute) */
.expect{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.ecard{background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:24px}.ecard .ic{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:rgba(201,164,60,.12);margin-bottom:12px}.ecard .ic svg{width:22px;height:22px;color:var(--accent)}.ecard p{font-size:.94rem;color:var(--muted);margin:0}
/* faq accordion */
.faq{max-width:860px;margin:0 auto}
.faq-item{border-top:1px solid rgba(255,255,255,.1)}.faq-item:last-child{border-bottom:1px solid rgba(255,255,255,.1)}
.faq-q{width:100%;text-align:left;background:none;border:0;color:var(--ink);font:inherit;font-size:1.12rem;font-family:${disp};padding:22px 44px 22px 0;cursor:pointer;position:relative;min-height:44px}
.faq-q .chev{position:absolute;right:4px;top:50%;transform:translateY(-50%);transition:transform .25s;color:var(--accent)}.faq-q .chev svg{width:22px;height:22px}
.faq-q[aria-expanded="true"] .chev{transform:translateY(-50%) rotate(180deg)}
.faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}.faq-a p{margin:0 0 22px;color:var(--muted)}
/* contact */
.contact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.ccard{background:var(--surface2);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:22px;text-align:center}
.ccard .ic{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:rgba(201,164,60,.12);margin:0 auto 12px}.ccard .ic svg{width:24px;height:24px;color:var(--accent)}
.ccard a,.ccard p{display:block;text-decoration:none;color:var(--ink);font-weight:700;margin:0}.ccard small{color:var(--muted);font-weight:400}
/* cta */
.ctaband{position:relative;text-align:center;padding:96px 0;overflow:hidden}.ctaband .hero-bg{opacity:.45}.ctaband:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,15,.86),rgba(8,10,15,.93));z-index:1}.ctaband .wrap{position:relative;z-index:2}.ctaband h2{font-size:2.5rem}
/* footer */
footer.site{background:#090a0e;border-top:1px solid rgba(255,255,255,.07);padding:56px 0 28px;color:var(--muted);font-size:.92rem}
.fcols{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1.2fr;gap:28px}
footer h4{color:var(--ink);font-family:${body};font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;margin:0 0 14px}
footer a{display:block;text-decoration:none;opacity:.82;margin-bottom:8px;min-height:24px}footer a:hover{color:var(--accent);opacity:1}
footer .fc-contact a{display:flex;align-items:center;gap:8px}footer .fc-contact svg{width:16px;height:16px;color:var(--accent)}
footer .copy{border-top:1px solid rgba(255,255,255,.07);margin-top:34px;padding-top:20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:.85rem}
.note{font-size:.72rem;color:#8a8270;border:1px dashed rgba(201,164,60,.4);border-radius:8px;padding:2px 8px}
@media(max-width:980px){.eeat-grid,.steps,.areas-grid,.contact-grid{grid-template-columns:repeat(2,1fr)}.feat-grid,.expect{grid-template-columns:1fr 1fr}.car-track>*{flex-basis:calc((100% - 20px)/2)}.fcols{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.hero .wrap,.feature{grid-template-columns:1fr;gap:28px}.hero{min-height:auto}.hero .wrap{padding:46px 24px}section.band{padding:54px 0}body{font-size:16px}h1{font-size:2.1rem}
nav.main{display:none;position:absolute;top:66px;left:0;right:0;flex-direction:column;background:#0c0f16;border-bottom:1px solid var(--line);padding:10px 24px;gap:0}nav.main.open{display:flex}nav.main a{padding:13px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.hdr-contact{display:none}.nav-toggle{display:grid;place-items:center}
.car-track>*{flex-basis:86%}.car-prev{left:0}.car-next{right:0}
.eeat-grid,.steps,.feat-grid,.expect,.areas-grid,.contact-grid{grid-template-columns:1fr}.fcols{grid-template-columns:1fr}}
`;
}

/* ---------------------------------------------------------------------------- *
 *  app.js — interactions, inlined verbatim
 * ---------------------------------------------------------------------------- */
const APP = `// GYL interactions: mobile nav, multi-step form, carousel, FAQ accordion
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-nav-toggle]');
  if(t){var nav=document.querySelector('[data-nav]');var open=nav.classList.toggle('open');t.setAttribute('aria-expanded',open);}
});
// multi-step form
document.querySelectorAll('[data-form]').forEach(function(form){
  var steps=[].slice.call(form.querySelectorAll('.qf-step'));var dots=[].slice.call(form.querySelectorAll('.qf-dots span'));var i=0;
  function show(n){i=Math.max(0,Math.min(steps.length-1,n));steps.forEach(function(s,k){s.hidden=k!==i;});dots.forEach(function(d,k){d.classList.toggle('on',k<=i);});}
  form.querySelectorAll('.qf-next').forEach(function(b){b.addEventListener('click',function(){show(i+1);});});
  form.querySelectorAll('.qf-back').forEach(function(b){b.addEventListener('click',function(){show(i-1);});});
  form.addEventListener('submit',function(e){e.preventDefault();var w=form.querySelector('.qf-step[data-step="2"]');if(w)w.innerHTML='<div style="text-align:center;padding:20px 0"><div style="font-family:serif;font-size:1.3rem;color:#191407;margin-bottom:6px">Thank you!</div><p style="color:#5b5444;margin:0">On the live site this sends your quote request to dispatch.</p></div>';});
});
// carousel
document.querySelectorAll('[data-carousel]').forEach(function(car){
  var track=car.querySelector('[data-track]');var dotsWrap=car.querySelector('[data-dots]');
  var prev=car.querySelector('.car-prev');var next=car.querySelector('.car-next');var page=0;
  function perView(){var w=window.innerWidth;return w<=760?1:(w<=980?2:3);}
  function pages(){return Math.max(1,Math.ceil(track.children.length/perView()));}
  function go(p){page=(p+pages())%pages();var card=track.children[0];if(!card)return;var step=card.getBoundingClientRect().width+20;track.style.transform='translateX(-'+(page*step*perView())+'px)';[].slice.call(dotsWrap.children).forEach(function(d,k){d.classList.toggle('on',k===page);});}
  function build(){dotsWrap.innerHTML='';for(var k=0;k<pages();k++){var b=document.createElement('button');b.setAttribute('aria-label','Slide '+(k+1));(function(k){b.addEventListener('click',function(){go(k);});})(k);dotsWrap.appendChild(b);}go(Math.min(page,pages()-1));}
  prev&&prev.addEventListener('click',function(){go(page-1);});next&&next.addEventListener('click',function(){go(page+1);});
  // swipe
  var x0=null;car.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  car.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)go(page+(dx<0?1:-1));x0=null;});
  var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(build,150);});build();
});
// FAQ accordion (single-open)
document.querySelectorAll('[data-accordion]').forEach(function(acc){
  acc.querySelectorAll('.faq-q').forEach(function(q){q.addEventListener('click',function(){
    var open=q.getAttribute('aria-expanded')==='true';
    acc.querySelectorAll('.faq-q').forEach(function(o){o.setAttribute('aria-expanded','false');o.nextElementSibling.style.maxHeight=null;});
    if(!open){q.setAttribute('aria-expanded','true');var a=q.nextElementSibling;a.style.maxHeight=a.scrollHeight+'px';}
  });});
});
`;

/* ---------------------------------------------------------------------------- *
 *  splitChunks — split bodyHtml on <h2> for distributed editorial bands
 * ---------------------------------------------------------------------------- */
type Chunk = { heading: string; html: string };
function splitChunks(html: string): Chunk[] {
  if (!html) return [];
  const parts = html
    .split(/(?=<h2)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts
    .map((seg) => {
      const m = seg.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      return { heading: m ? m[1].replace(/<[^>]+>/g, "") : "", html: m ? seg.replace(/<h2[\s\S]*?<\/h2>/i, "").trim() : seg };
    })
    .filter((c) => c.html);
}

/* ---------------------------------------------------------------------------- *
 *  Render context — everything an emitter needs, resolved once per page.
 * ---------------------------------------------------------------------------- */
type Ctx = {
  biz: StudioBusiness;
  page: StudioRenderPage;
  city: string;
  niche: string;
  phoneHref: string;
  mailHref: string;
  phone: string;
  email: string;
  logoA: string;
  logoB: string;
  bodyHtml: string;
  chunks: Chunk[];
  faq: { q: string; a: string }[];
  scene: SceneCtx; // uid generator
  /** consumes the next editorial chunk as an alternating text+image band */
  nextChunk: (rev?: boolean) => string;
  /** consumes ALL remaining editorial chunks as a sequence of bands */
  remainingChunks: () => string;
  heroScene: SceneFn;
};

/* ---------------------------------------------------------------------------- *
 *  Component fragments
 * ---------------------------------------------------------------------------- */
const wordmark = (a: string, b: string, sz = "1.35rem"): string =>
  `<span class="logo" style="font-size:${sz}">${escHtml(a)}<b>${escHtml(b)}</b></span>`;

function buildHeader(ctx: Ctx): string {
  return `<header class="site"><div class="wrap topbar"><a class="logo" href="#">${escHtml(ctx.logoA)}<b>${escHtml(ctx.logoB)}</b></a>
<button class="nav-toggle" aria-label="Open menu" aria-expanded="false" data-nav-toggle>${icon('<path d="M3 6h18M3 12h18M3 18h18"/>')}</button>
<nav class="main" data-nav><a href="#">Services</a><a href="#">Gallery</a><a href="#">Areas</a><a href="#">About</a><a href="#">Contact</a></nav>
<div class="hdr-contact"><a href="${ctx.phoneHref}">${icon(IC.phone)} ${escHtml(ctx.phone)}</a><a href="${ctx.mailHref}">${icon(IC.mail)} Email</a><a class="btn" href="#">Book now</a></div></div></header>`;
}

const heroForm = (city: string): string => `<form class="qform" data-form novalidate>
<div class="qe">Fast quote</div><h3>Request a quote</h3>
<div class="qf-dots"><span class="on"></span><span></span><span></span></div>
<div class="qf-step" data-step="0"><div class="qfield"><label>What do you need?</label><input type="text" placeholder="Tell us briefly what you're looking for"></div><div class="qfield"><label>Location</label><input type="text" placeholder="e.g. ${escAttr(city)}"></div><div class="qf-nav"><button type="button" class="btn qf-next">Continue →</button></div></div>
<div class="qf-step" data-step="1" hidden><div class="qf-row"><div class="qfield"><label>Preferred date</label><input type="date"></div><div class="qfield"><label>Preferred time</label><input type="time"></div></div><div class="qfield"><label>How did you hear about us?</label><select><option>Google search</option><option>Referral</option><option>Social media</option><option>Other</option></select></div><div class="qf-nav"><button type="button" class="btn qf-back">← Back</button><button type="button" class="btn qf-next">Continue →</button></div></div>
<div class="qf-step" data-step="2" hidden><div class="qfield"><label>Name</label><input type="text" placeholder="Your name"></div><div class="qf-row"><div class="qfield"><label>Email</label><input type="email" placeholder="you@email.com"></div><div class="qfield"><label>Phone</label><input type="tel" placeholder="phone"></div></div><div class="qf-nav"><button type="button" class="btn qf-back">← Back</button><button type="submit" class="btn">Get my quote →</button></div></div>
</form>`;

const pills = (): string =>
  `<div class="pill-row"><span class="t">${icon(IC.shield)} Licensed &amp; insured</span><span class="t">${icon(IC.clock)} Fast response</span><span class="t">${icon(IC.star)} Highly rated</span></div>`;

/** Pick a hero scene by page type. */
function heroSceneFor(pageType: string): SceneFn {
  const m: Record<string, SceneFn> = {
    home: scenes.skyline(),
    service: scenes.fleetline(),
    area: scenes.skyline(true),
    service_area: scenes.skyline(true),
    areas_hub: scenes.skyline(true),
    services_hub: scenes.fleetline(),
    fleet: scenes.fleetline(),
    about: scenes.about(),
    reservation: scenes.reservation(),
    contact: scenes.skyline(),
    faq: scenes.skyline(),
    blog: scenes.skyline(),
  };
  return m[pageType] || scenes.skyline();
}

function buildHero(ctx: Ctx): string {
  const withForm = ["home", "service", "area", "service_area", "reservation"].includes(ctx.page.pageType);
  const rawH1 = (ctx.page.h1 || (ctx.page.title || "").split("|")[0] || "").trim() || ctx.biz.businessName;
  // highlight the city word in gold
  const cityRe = new RegExp("\\b" + ctx.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
  const h1g = escHtml(rawH1).replace(cityRe, `<span class="gold">${escHtml(ctx.city)}</span>`);
  const sub = escHtml((ctx.page.metaDescription || `Trusted ${ctx.niche} serving ${ctx.city} and the surrounding area.`).slice(0, 180));
  const eyebrow = escHtml(ctx.biz.businessName);
  return `<section id="sec-hero" class="hero ${withForm ? "" : "solo"}"><div class="hero-bg">${slot(ctx.heroScene(ctx.scene), "hero")}</div><div class="wrap"><div class="lead"><span class="eyebrow">${eyebrow}</span><h1>${h1g}</h1><p class="sub">${sub}</p><div class="cta-row"><a class="btn" href="#">Get a quote →</a><a class="btn ghost" href="${ctx.phoneHref}">${icon(IC.phone)} Call now</a></div>${pills()}</div>${withForm ? heroForm(ctx.city) : ""}</div></section>`;
}

/* ---- mid-body section emitters keyed by spec type ---- */
const emitters: Record<string, (ctx: Ctx) => string> = {
  hero: () => "", // hero is rendered first, never inside the loop

  content: (ctx) => ctx.remainingChunks(),

  eeat: (ctx) =>
    `<section id="sec-eeat" class="band"><div class="wrap"><div class="sec-head"><span class="eyebrow">Why choose us</span><h2>${escHtml(ctx.city)}'s trusted ${escHtml(ctx.niche)}</h2><div class="accent-rule"></div></div><div class="eeat-grid">${EEAT.map((e) => `<div class="eeat-card"><div class="ic">${icon(IC[e.ic])}</div><h3>${e.h}</h3><p>${e.t}</p></div>`).join("")}</div></div></section>`,

  steps: () =>
    `<section id="sec-steps" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">How it works</span><h2>Simple from start to finish</h2><div class="accent-rule"></div></div><div class="steps">${STEPS.map((s) => `<div class="step"><div class="n">${s.n}</div><h3>${s.h}</h3><p>${s.t}</p></div>`).join("")}</div></div></section>`,

  services: (ctx) => {
    const svc = ctx.biz.services.length
      ? ctx.biz.services
      : [{ label: "Our services", slug: "#", blurb: "Quality service, done right." }];
    const scenePool: SceneFn[] = [scenes.sedan(), scenes.suv(), scenes.skyline(), scenes.about(), scenes.fleetline(), scenes.nightout()];
    return `<section id="sec-services" class="band"><div class="wrap"><div class="sec-head"><span class="eyebrow">What we do</span><h2>Our ${escHtml(ctx.city)} services</h2><div class="accent-rule"></div></div><div class="carousel" data-carousel><button class="car-btn car-prev" aria-label="Previous">${icon('<path d="M15 6l-6 6 6 6"/>')}</button><div class="car-viewport"><div class="car-track" data-track>${svc
      .map((s, i) => {
        const sc = scenePool[i % scenePool.length](ctx.scene);
        return `<a class="pcard" href="${href(s.slug)}"><div class="thumb">${slot(sc, "service." + slugify(s.label))}</div><div class="pc"><h3>${escHtml(s.label)}</h3><p>${escHtml(s.blurb || "Quality service, done right.")}</p><span class="more">Learn more →</span></div></a>`;
      })
      .join("")}</div></div><button class="car-btn car-next" aria-label="Next">${icon('<path d="M9 6l6 6-6 6"/>')}</button><div class="car-dots" data-dots></div></div></div></section>`;
  },

  features: (ctx) =>
    `<section id="sec-features" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">The difference</span><h2>Why ${escHtml(ctx.city)} chooses ${escHtml(ctx.biz.businessName)}</h2><div class="accent-rule"></div></div><div class="feat-grid">${FEATURES.map((f) => `<div class="feat"><div class="ic">${icon(IC[f.ic])}</div><h3>${f.h}</h3></div>`).join("")}</div></div></section>`,

  // Generic gallery / showcase — replaces the old vehicle "fleet" emitter.
  gallery: (ctx) =>
    `<section id="sec-gallery" class="band"><div class="wrap"><div class="sec-head"><span class="eyebrow">A closer look</span><h2>See our work</h2><div class="accent-rule"></div></div><div class="carousel" data-carousel><button class="car-btn car-prev" aria-label="Previous">${icon('<path d="M15 6l-6 6 6 6"/>')}</button><div class="car-viewport"><div class="car-track" data-track>${GALLERY.map((f) => `<div class="pcard"><div class="thumb">${slot(f.scene(ctx.scene), "gallery." + slugify(f.name))}</div><div class="pc"><h3>${f.name}</h3><div class="spec"><span>${f.cap}</span><span>${f.lug}</span><span>${f.best}</span></div></div></div>`).join("")}</div></div><button class="car-btn car-next" aria-label="Next">${icon('<path d="M9 6l6 6-6 6"/>')}</button><div class="car-dots" data-dots></div></div></div></section>`,

  // Generic pricing/packages band (real prices only once the operator adds them).
  pricing: (ctx) =>
    `<section id="sec-pricing" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">Pricing</span><h2>Clear, up-front pricing</h2><div class="accent-rule"></div><p style="color:var(--muted)">Your exact quote is confirmed before any work begins — no surprises.</p></div><div class="incl-grid">${INCL.slice(0, 3).map((i) => `<div class="incl">${icon(IC.shield)}<span>${escHtml(i)}</span></div>`).join("")}</div><div style="text-align:center;margin-top:28px"><a class="btn" href="#">Get your quote →</a></div></div></section>`,

  areas: (ctx) => {
    const areas = ctx.biz.areas.length ? ctx.biz.areas : [{ label: ctx.city, slug: "#" }];
    return `<section id="sec-areas" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">Where we go</span><h2>Areas we serve near <span class="gold">${escHtml(ctx.city)}</span></h2><div class="accent-rule"></div></div><div class="areas-grid">${areas
      .map((a) => `<a class="acard" href="${href(a.slug)}"><div class="thumb">${slot(scenes.skyline(true)(ctx.scene), "area." + slugify(a.label))}</div><div class="ac"><h3>${escHtml(a.label)}</h3><span>View ${escHtml(a.label)} →</span></div></a>`)
      .join("")}</div></div></section>`;
  },

  reviews: () =>
    `<section id="sec-reviews" class="band"><div class="wrap"><div class="sec-head"><span class="eyebrow">What to expect</span><h2>Every job, the same standard</h2><div class="accent-rule"></div><p style="color:var(--muted)">Verified customer reviews will appear here once the business profile is connected.</p></div><div class="expect"><div class="ecard"><div class="ic">${icon(IC.clock)}</div><h3>On time, every time</h3><p>We show up when we say we will and keep you informed throughout.</p></div><div class="ecard"><div class="ic">${icon(IC.star)}</div><h3>Quality work</h3><p>Careful, professional service with attention to the details that matter.</p></div><div class="ecard"><div class="ic">${icon(IC.users)}</div><h3>A team you can trust</h3><p>Licensed, vetted and courteous from first contact to the finished job.</p></div></div></div></section>`,

  // Alias: the section spec uses "testimonials" — render the same "what to expect" band.
  testimonials: function (ctx) { return emitters.reviews(ctx); },

  faq: (ctx) =>
    !ctx.faq.length
      ? ""
      : `<section id="sec-faq" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">Good to know</span><h2>Frequently asked questions</h2><div class="accent-rule"></div></div><div class="faq" data-accordion>${ctx.faq
          .map((f) => `<div class="faq-item"><button class="faq-q" aria-expanded="false">${escHtml(f.q)}<span class="chev">${icon('<path d="M6 9l6 6 6-6"/>')}</span></button><div class="faq-a"><p>${escHtml(f.a)}</p></div></div>`)
          .join("")}</div></div></section>`,

  inclusions: () =>
    `<section id="sec-incl" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">What's included</span><h2>Every job includes</h2><div class="accent-rule"></div></div><div class="incl-grid">${INCL.map((i) => `<div class="incl">${icon(IC.shield)}<span>${escHtml(i)}</span></div>`).join("")}</div></div></section>`,

  about_city: (ctx) => {
    const html = ctx.chunks[0] ? ctx.chunks[0].html : `<p>${escHtml(ctx.page.metaDescription || `${ctx.niche} serving ${ctx.city} and the surrounding area.`)}</p>`;
    return `<section id="sec-about-city" class="band"><div class="wrap"><div class="feature"><div class="body-copy"><span class="eyebrow">About ${escHtml(ctx.city)}</span><h2>Serving ${escHtml(ctx.city)}</h2><div class="accent-rule"></div>${html}</div><div class="art">${slot(ctx.heroScene(ctx.scene), "about-" + slugify(ctx.city))}</div></div></div></section>`;
  },

  // Generic "about" band (about-page support) — uses the first editorial chunk.
  about: (ctx) => {
    const html = ctx.chunks[0] ? ctx.chunks[0].html : `<p>${escHtml(ctx.page.metaDescription || `About ${ctx.biz.businessName}.`)}</p>`;
    return `<section id="sec-about" class="band"><div class="wrap"><div class="feature"><div class="body-copy"><span class="eyebrow">About us</span><h2>About ${escHtml(ctx.biz.businessName)}</h2><div class="accent-rule"></div>${html}</div><div class="art">${slot(ctx.heroScene(ctx.scene), "about-" + slugify(ctx.biz.businessName))}</div></div></div></section>`;
  },

  top_places: (ctx) => {
    const places = GENERIC_PLACES;
    return `<section id="sec-places" class="band alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">Around town</span><h2>Areas we cover in ${escHtml(ctx.city)}</h2><div class="accent-rule"></div></div><div class="places-grid">${places.map((pl) => `<div class="place">${icon(IC.pin)}<span>${escHtml(pl)}</span></div>`).join("")}</div></div></section>`;
  },

  contact: (ctx) => {
    const areaNames = (ctx.biz.areas.length ? ctx.biz.areas : [{ label: ctx.city, slug: "#" }]).slice(0, 4).map((a) => escHtml(a.label)).join(" · ");
    return `<section id="sec-contact" class="band"><div class="wrap"><div class="sec-head"><span class="eyebrow">Get in touch</span><h2>Contact us</h2><div class="accent-rule"></div></div><div class="contact-grid"><div class="ccard"><div class="ic">${icon(IC.phone)}</div><a href="${ctx.phoneHref}">${escHtml(ctx.phone)}</a><small>Call or text</small></div><div class="ccard"><div class="ic">${icon(IC.mail)}</div><a href="${ctx.mailHref}">Email us</a><small>${escHtml(ctx.email)}</small></div><div class="ccard"><div class="ic">${icon(IC.clock)}</div><p>Open by appointment</p><small>See hours below</small></div><div class="ccard"><div class="ic">${icon(IC.pin)}</div><p>${escHtml(ctx.city)} &amp; area</p><small>${areaNames}</small></div></div></div></section>`;
  },
};

/* ---- editorial split-chunk band (text + image, alternating) ---- */
const splitChunk = (c: Chunk, svg: string, id: string, rev: boolean, biz: string): string =>
  `<section class="band ${rev ? "alt" : ""}"><div class="wrap"><div class="feature ${rev ? "rev" : ""}"><div class="body-copy">${c.heading ? `<span class="eyebrow">${escHtml(biz)}</span><h2>${escHtml(c.heading)}</h2><div class="accent-rule"></div>` : ""}${c.html}</div><div class="art">${slot(svg, id)}</div></div></div></section>`;

const placeholderContent = (): string =>
  `<section class="band"><div class="wrap"><div class="prose"><p>Content generated by the content agent will appear here.</p></div></div></section>`;

/* ---- CTA band + footer (anchor the end) ---- */
function buildCTA(ctx: Ctx): string {
  return `<section id="sec-cta" class="ctaband"><div class="hero-bg">${slot(ctx.heroScene(ctx.scene), "cta-bg")}</div><div class="wrap"><span class="eyebrow">Ready when you are</span><h2>Get started in ${escHtml(ctx.city)}</h2><p style="max-width:600px;margin:0 auto 1.5em;opacity:.92">Clear up-front pricing, friendly service, work done right — guaranteed.</p><div class="cta-row" style="justify-content:center"><a class="btn" href="#">Get a quote →</a><a class="btn ghost" href="${ctx.phoneHref}">${icon(IC.phone)} ${escHtml(ctx.phone)}</a></div></div></section>`;
}

function buildFooter(ctx: Ctx): string {
  const svc = ctx.biz.services.length ? ctx.biz.services : [{ label: "Our Services", slug: "#" }];
  const areas = ctx.biz.areas.length ? ctx.biz.areas : [{ label: ctx.city, slug: "#" }];
  const region = ctx.biz.region ? `${ctx.city}, ${ctx.biz.region}` : ctx.city;
  const blurb = `Trusted ${ctx.niche || "local service"} in ${ctx.city} and the surrounding area.`;
  return `<footer class="site"><div class="wrap"><div class="fcols">
<div>${wordmark(ctx.logoA, ctx.logoB, "1.25rem")}<p style="margin:12px 0;max-width:280px">${escHtml(blurb)}</p></div>
<div><h4>Services</h4>${svc.map((s) => `<a href="${href(s.slug)}">${escHtml(s.label)}</a>`).join("")}</div>
<div><h4>Areas</h4>${areas.map((a) => `<a href="${href(a.slug)}">${escHtml(a.label)}</a>`).join("")}</div>
<div><h4>Company</h4><a href="#">About</a><a href="#">Services</a><a href="#">Contact</a><a href="#">Get a quote</a></div>
<div class="fc-contact"><h4>Contact</h4><a href="${ctx.phoneHref}">${icon(IC.phone)} ${escHtml(ctx.phone)}</a><a href="${ctx.mailHref}">${icon(IC.mail)} ${escHtml(ctx.email)}</a><a href="#">${icon(IC.clock)} Open 24/7</a><a href="#">${icon(IC.pin)} ${escHtml(region)}</a></div>
</div><div class="copy"><span>© ${escHtml(ctx.biz.businessName)} — ${escHtml(region)}</span><span>Privacy · Terms</span></div></div></footer>`;
}

/* ---------------------------------------------------------------------------- *
 *  renderStudioPage — assemble the document
 * ---------------------------------------------------------------------------- */
export function renderStudioPage(input: StudioRenderInput): string {
  const palette: StudioPalette = { ...DEFAULT_STUDIO_PALETTE, ...(input.palette || {}) };
  const biz = input.business;
  const page = input.page;
  const device = input.device === "mobile" ? "mobile" : "desktop";

  // derive wordmark
  const nameParts = (biz.businessName || "Your Business").trim().split(/\s+/);
  const logoA = biz.logoA ?? (nameParts[0] || "Your");
  const logoB = biz.logoB ?? (nameParts.slice(1).join(" ") || "Business");

  const city = biz.city || "your city";
  const bodyHtml = page.bodyHtml || "";
  const chunks = splitChunks(bodyHtml);
  const faq = Array.isArray(page.faq) ? page.faq : [];

  // editorial chunk pool — varied scene art, alternating sides
  const scnCtx: SceneCtx = { uid: makeUid(), ac: palette.accent, ac2: palette.gold2, ink: palette.ink, base: palette.base };
  const pool: SceneFn[] = [scenes.skyline(), scenes.sedan(), scenes.fleetline(), scenes.nightout(), scenes.about()];
  let ci = 0;

  const heroScene = heroSceneFor(page.pageType);

  const ctx: Ctx = {
    biz,
    page,
    city,
    niche: (biz.niche && biz.niche.trim()) || "local service business",
    phone: biz.phone || "",
    email: biz.email || "",
    phoneHref: telHref(biz.phone || ""),
    mailHref: mailHref(biz.email || ""),
    logoA,
    logoB,
    bodyHtml,
    chunks,
    faq,
    scene: scnCtx,
    heroScene,
    nextChunk: (rev) => {
      if (ci >= chunks.length) return "";
      const c = chunks[ci];
      const svg = pool[ci % pool.length](scnCtx);
      ci++;
      return splitChunk(c, svg, "content-" + ci, rev ?? false, biz.businessName);
    },
    remainingChunks: () => {
      // about_city consumes chunk[0]; if that emitter ran, start after it.
      if (ci >= chunks.length) return placeholderContent();
      let out = "";
      let rev = false;
      while (ci < chunks.length) {
        const c = chunks[ci];
        const svg = pool[ci % pool.length](scnCtx);
        ci++;
        out += splitChunk(c, svg, "content-" + ci, rev, biz.businessName);
        rev = !rev;
      }
      return out || placeholderContent();
    },
  };

  // Resolve the section order: explicit array, or canonical default for the page type.
  const sectionTypes: string[] = input.sections && input.sections.length ? input.sections : sectionsForPageType(page.pageType).map((s) => s.type);

  // If about_city is present, it consumes chunk[0]; bump the pointer past it so the
  // distributed `content` band doesn't repeat the intro paragraph.
  const hasAboutCity = sectionTypes.includes("about_city") && chunks.length > 0;

  // Assemble mid-body: skip hero (rendered first) and contact (rendered near the end).
  let mid = "";
  let contactEmitted = false;
  for (const type of sectionTypes) {
    if (type === "hero") continue;
    if (type === "contact") continue; // handled after the loop
    if (type === "about_city" && hasAboutCity && ci === 0) {
      // emit about_city using chunk[0], then advance the chunk pointer so `content` skips it
      mid += emitters.about_city(ctx);
      ci = Math.max(ci, 1);
      continue;
    }
    const fn = emitters[type];
    if (fn) mid += fn(ctx);
  }

  const contactBlock = sectionTypes.includes("contact") ? emitters.contact(ctx) : "";
  void contactEmitted;

  const head =
    `<!doctype html><html lang="en" data-device="${device}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escAttr(page.title || biz.businessName)}</title>` +
    `<meta name="description" content="${escAttr(page.metaDescription || "")}">` +
    `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="${googleFontsUrl(palette.displayFont, palette.bodyFont)}" rel="stylesheet">` +
    `<style>${buildCss(palette)}</style></head><body>`;

  return (
    head +
    buildHeader(ctx) +
    buildHero(ctx) +
    mid +
    contactBlock +
    buildCTA(ctx) +
    buildFooter(ctx) +
    `<script>${APP}</script>` +
    `</body></html>`
  );
}

/* ---- Google Fonts URL from the two font family names ---- */
function googleFontsUrl(display: string, body: string): string {
  const fam = (name: string, weights: string): string => `family=${name.trim().replace(/\s+/g, "+")}:wght@${weights}`;
  const parts = [fam(display || "Playfair Display", "500;600;700")];
  if ((body || "").trim().toLowerCase() !== (display || "").trim().toLowerCase()) {
    parts.push(fam(body || "Source Sans 3", "400;600;700"));
  }
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}
