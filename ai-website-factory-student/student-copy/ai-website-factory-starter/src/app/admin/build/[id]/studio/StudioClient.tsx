"use client";

/**
 * StudioClient — the drag-and-drop SECTION COMPOSER.
 *
 *   TOP     page-type tabs: Home · City · Service · Hub · About · Reservation.
 *   LEFT    the active type's ordered sections — drag to reorder, toggle on/off,
 *           and choose a design VARIANT (a real captured screenshot from one of
 *           reference cleaning-services sites the operator has captured) per section.
 *   RIGHT   a live COMPOSITE preview: the chosen section screenshots stacked
 *           top-to-bottom — "this is how my page will look" from the parts you
 *           picked. Sections with no chosen variant show a labelled placeholder.
 *
 * Per-type compositions are saved to project.lockedDesigns (via saveType) so
 * every generated page of that type inherits the design. React-18 safe — no
 * useActionState; mutations run through useTransition + async handlers.
 * Premium inline SVG icons only.
 */
import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  PAGE_TYPE_LABELS,
  sectionsForPageType,
  requiredSectionTypes,
  type SectionSpec,
  type StudioSection,
} from "@/lib/page-section-specs";

/* ── serializable shapes from the server ─────────────────────────────────── */
export type StudioVariant = {
  selectionId: string;
  sectionType: string;
  label: string | null;
  screenshotUrl: string | null;
  siteName: string | null;
  siteUrl: string | null;
  siteTraffic: number | null;
  recommended: boolean;
};

export type StudioKeyword = {
  id: string;
  keyword: string;
  status: string;
  role: string;
  intent: string | null;
  volumeTier: string | null;
};

type Actions = {
  saveType: (projectId: string, pageType: string, sections: StudioSection[]) => Promise<{ ok: boolean }>;
  linkResearch: (projectId: string, runId?: string) => Promise<{ ok: boolean; count: number; runId: string | null }>;
  lockReplicate: (projectId: string, pageType: string) => Promise<{ ok: boolean; count: number }>;
  finalizeKeywords: (projectId: string) => Promise<{ ok: boolean; count: number }>;
  removeKeyword: (keywordId: string) => Promise<{ ok: boolean }>;
  setGlobal: (projectId: string, sectionType: string, selectionId: string | null) => Promise<{ ok: boolean }>;
};

type Props = {
  projectId: string;
  businessName: string;
  pageTypes: Array<{ type: string; label: string }>;
  savedByType: Record<string, StudioSection[]>;
  keywords: StudioKeyword[];
  variantsByType: Record<string, StudioVariant[]>;
  variantCount: number;
  globalSections: Record<string, { selectionId: string }>;
  actions: Actions;
};

/* ── premium inline icons ─────────────────────────────────────────────────── */
const Ic = {
  drag: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="6" cy="4" r="1.2" /><circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="12" r="1.2" /><circle cx="10" cy="12" r="1.2" />
    </svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.3" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m2.5 6 2.2 2.2L9.5 3.5" />
    </svg>
  ),
  x: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  ),
  shield: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2 3.5 3.8V8c0 3 2.2 4.5 4.5 6 2.3-1.5 4.5-3 4.5-6V3.8z" /><path d="m6 8 1.4 1.4L10.5 6.5" />
    </svg>
  ),
  star: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1.5l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13.4l.8-4.2L2 6.4l4.2-.5z" />
    </svg>
  ),
  image: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" />
    </svg>
  ),
  globe: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.3" /><path d="M1.7 8h12.6M8 1.7c1.8 1.7 2.8 3.9 2.8 6.3S9.8 12.6 8 14.3C6.2 12.6 5.2 10.4 5.2 8S6.2 3.4 8 1.7Z" />
    </svg>
  ),
  prev: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 3 5 8l5 5" /></svg>
  ),
  next: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 3 5 5-5 5" /></svg>
  ),
  expand: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-5 5M2.5 13.5l5-5" />
    </svg>
  ),
};

/** For a canonical spec section type, which research section types carry useful
 *  variants. Maps our SEO spine to the capture detector's vocabulary. */
const VARIANT_ALIASES: Record<string, string[]> = {
  header: ["header"],
  footer: ["footer"],
  hero: ["hero"],
  eeat: ["stats", "partners", "about", "features"],
  services: ["services"],
  features: ["features"],
  steps: ["process"],
  fleet: ["fleet", "gallery"],
  areas: ["areas"],
  reviews: ["testimonials"],
  faq: ["faq"],
  contact: ["contact", "cta"],
  inclusions: ["features", "services"],
  about_city: ["about"],
  top_places: ["gallery", "areas"],
  airport: ["other"],
};

export function StudioClient({
  projectId,
  businessName,
  pageTypes,
  savedByType,
  keywords,
  variantsByType,
  variantCount,
  globalSections,
  actions,
}: Props) {
  const router = useRouter();
  // Global sections (project-level) held in client state for instant feedback.
  const [globals, setGlobals] = useState<Record<string, { selectionId: string }>>(globalSections);
  const [, startGlobal] = useTransition();

  const [activeType, setActiveType] = useState<string>(pageTypes[0]?.type ?? "home");
  const [layout, setLayout] = useState<StudioSection[]>(savedByType[activeType] ?? []);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null);
  const [fullView, setFullView] = useState(false);
  // Pointer-based drag-to-canvas (reliable — no flaky native HTML5 DnD).
  type DragPayload = { type: string; selectionId: string; img: string | null; label: string };
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overCanvas, setOverCanvas] = useState(false);
  // Pending press for the drag threshold (declared early — used by the tab-reset effect).
  const pending = useRef<{ payload: DragPayload; x: number; y: number } | null>(null);

  // Reset layout when the page type changes (load that type's saved comp).
  useEffect(() => {
    setLayout(savedByType[activeType] ?? []);
    setDirty(false);
    setOpenPickerFor(null);
    setDrag(null);
    setOverCanvas(false);
    pending.current = null;
  }, [activeType, savedByType]);

  // Esc closes the full-screen preview.
  useEffect(() => {
    if (!fullView) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setFullView(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullView]);

  const sMap = useMemo(() => new Map(sectionsForPageType(activeType).map((s) => [s.type, s])), [activeType]);
  const reqTypes = useMemo(() => requiredSectionTypes(activeType), [activeType]);

  /** Variants available for a spec section type (via the alias map), flattened. */
  function variantsFor(specType: string): StudioVariant[] {
    const aliases = VARIANT_ALIASES[specType] ?? [specType];
    const out: StudioVariant[] = [];
    for (const a of aliases) for (const v of variantsByType[a] ?? []) out.push(v);
    return out;
  }
  const findVariant = (id: string | null): StudioVariant | null => {
    if (!id) return null;
    for (const list of Object.values(variantsByType)) {
      const hit = list.find((v) => v.selectionId === id);
      if (hit) return hit;
    }
    return null;
  };

  /* ── mutations ──────────────────────────────────────────────────────────── */
  const reindex = (rows: StudioSection[]) => rows.map((s, i) => ({ ...s, order: i }));
  function toggleEnabled(type: string) {
    if (reqTypes.has(type)) return;
    setLayout((p) => reindex(p.map((s) => (s.type === type ? { ...s, enabled: !s.enabled } : s))));
    setDirty(true);
  }
  function setVariant(type: string, selectionId: string | null) {
    setLayout((p) => p.map((s) => (s.type === type ? { ...s, variantSelectionId: selectionId } : s)));
    setOpenPickerFor(null);
    setDirty(true);
  }

  // ── global sections ──
  const isGlobal = (type: string) => !!globals[type];
  const effectiveVariantId = (sec: StudioSection) => globals[sec.type]?.selectionId ?? sec.variantSelectionId;
  /** Route a variant choice: a global section persists at project level (shows on
   *  every page); a normal section updates only this page type's layout. */
  function applyVariant(type: string, selectionId: string | null) {
    if (isGlobal(type)) {
      if (!selectionId) return; // a global section always keeps a concrete design
      setGlobals((g) => ({ ...g, [type]: { selectionId } }));
      startGlobal(() => { void actions.setGlobal(projectId, type, selectionId); });
      setOpenPickerFor(null);
    } else {
      setVariant(type, selectionId);
    }
  }
  /** Toggle a section global on/off (capturing its current/best design when on). */
  function toggleGlobal(type: string) {
    if (isGlobal(type)) {
      setGlobals((g) => { const n = { ...g }; delete n[type]; return n; });
      startGlobal(() => { void actions.setGlobal(projectId, type, null); });
    } else {
      const cur =
        layout.find((s) => s.type === type)?.variantSelectionId ??
        variantsFor(type).find((v) => v.recommended)?.selectionId ??
        variantsFor(type)[0]?.selectionId ??
        null;
      if (!cur) return; // no design to globalize yet
      setGlobals((g) => ({ ...g, [type]: { selectionId: cur } }));
      startGlobal(() => { void actions.setGlobal(projectId, type, cur); });
    }
  }
  /** ◀ ▶ cycle a section through its variants (incl. Default) in the live canvas. */
  function cycleVariant(type: string, dir: -1 | 1) {
    const opts: (string | null)[] = [null, ...variantsFor(type).map((v) => v.selectionId)];
    if (opts.length <= 1) return;
    const sec = layout.find((s) => s.type === type);
    const curId = (isGlobal(type) ? globals[type]?.selectionId : sec?.variantSelectionId) ?? null;
    const idx = Math.max(0, opts.indexOf(curId));
    applyVariant(type, opts[(idx + dir + opts.length) % opts.length]);
  }

  // ── pointer-drag: grab a section/design → a ghost follows the cursor →
  //    drop anywhere on the canvas to place it. Works regardless of native DnD. ──
  const setVarRef = useRef(applyVariant);
  setVarRef.current = applyVariant;
  // Pending press: drag only STARTS after the pointer moves past a threshold,
  // so a plain click (place / open picker) never flashes the ghost. (audit M1)
  function beginDrag(e: ReactPointerEvent, payload: DragPayload | null) {
    if (!payload) return;
    pending.current = { payload, x: e.clientX, y: e.clientY };
    const onPendMove = (ev: globalThis.PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 5) {
        pending.current = null;
        window.removeEventListener("pointermove", onPendMove);
        window.removeEventListener("pointerup", onPendCancel);
        setGhost({ x: ev.clientX, y: ev.clientY });
        setDrag(p.payload); // hands off to the main drag effect
      }
    };
    const onPendCancel = () => {
      pending.current = null;
      window.removeEventListener("pointermove", onPendMove);
      window.removeEventListener("pointerup", onPendCancel);
    };
    window.addEventListener("pointermove", onPendMove);
    window.addEventListener("pointerup", onPendCancel, { once: true });
  }
  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: globalThis.PointerEvent) => {
      setGhost({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      setOverCanvas(!!el?.closest("[data-canvas]"));
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      if (el?.closest("[data-canvas]")) setVarRef.current(drag.type, drag.selectionId);
      setDrag(null);
      setOverCanvas(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);
  /** Best (recommended) or first design for a section, as a drag payload. */
  function bestPayload(type: string, label: string): DragPayload | null {
    const vs = variantsFor(type);
    const best = vs.find((v) => v.recommended) || vs[0];
    return best ? { type, selectionId: best.selectionId, img: best.screenshotUrl, label } : null;
  }

  const [isSaving, startSave] = useTransition();
  const [isLinking, startLink] = useTransition();
  const [isKw, startKw] = useTransition();

  function handleSave(lock: boolean) {
    startSave(async () => {
      const r = await actions.saveType(projectId, activeType, layout);
      if (r.ok && lock) await actions.lockReplicate(projectId, activeType);
      setStatusMsg(r.ok ? (lock ? `Locked ${activeLabel} design for every ${activeLabel} page.` : `Saved ${activeLabel} composition.`) : "Save failed.");
      setDirty(false);
      router.refresh();
    });
  }
  function handleLink() {
    startLink(async () => {
      const r = await actions.linkResearch(projectId);
      setStatusMsg(r.ok ? `Loaded ${r.count} researched section(s) into your library.` : "No captured research found yet — let the capture finish.");
      router.refresh();
    });
  }

  const activeLabel = PAGE_TYPE_LABELS[activeType] ?? activeType;
  const liveKeywords = keywords.filter((k) => k.status !== "dropped");
  const queuedCount = keywords.filter((k) => k.status === "queued").length;

  return (
    <div className="space-y-4">
      {/* ── page-type tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        <div className="flex flex-wrap items-center gap-1">
          {pageTypes.map((t) => {
            const active = t.type === activeType;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => setActiveType(t.type)}
                className={[
                  "rounded-md px-3.5 py-1.5 text-base font-medium transition",
                  active ? "bg-accent text-accent-fg shadow-xs" : "text-text-muted hover:bg-surface-2 hover:text-text",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-text-faint">
          <span className="tnum">{variantCount}</span> researched sections in library
        </div>
      </div>

      {/* ── library load banner (when empty) ───────────────────────────── */}
      {variantCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-tint px-4 py-3">
          <div>
            <p className="text-base font-medium text-text">Your section library is empty — there are no designs to drag yet.</p>
            <p className="text-xs text-text-muted">
              First run a design-research capture (top cleaning-services sites worldwide) with the worker running, then load its
              sections here. Until then, dragging does nothing because no section has a captured design.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/admin/design-research"
              className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
            >
              Start a design capture →
            </a>
            <button
              type="button"
              onClick={handleLink}
              disabled={isLinking}
              title="Pull in sections from a capture that has already finished"
              className="rounded-md border border-accent/40 bg-surface px-4 py-2 text-xs font-medium text-accent transition hover:border-accent disabled:opacity-60"
            >
              {isLinking ? "Loading…" : "Load finished research"}
            </button>
          </div>
        </div>
      ) : null}

      {statusMsg ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-base text-success">{statusMsg}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[330px,1fr]">
        {/* ── LEFT · section composer rail ─────────────────────────────── */}
        <aside className="space-y-3">
          <section className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">{activeLabel} sections</span>
              <span className="tnum text-xs text-text-faint">{layout.filter((s) => s.enabled).length}/{layout.length} on · drag to reorder</span>
            </div>

            <ul className="max-h-[620px] space-y-1.5 overflow-y-auto p-2">
              {layout.map((sec, i) => {
                const spec = sMap.get(sec.type) as SectionSpec | undefined;
                const required = reqTypes.has(sec.type);
                const variantable = !!spec?.variantable;
                const variants = variantsFor(sec.type);
                const chosen = findVariant(effectiveVariantId(sec));
                const pickerOpen = openPickerFor === sec.type;
                const global = isGlobal(sec.type);
                const effId = effectiveVariantId(sec);
                // Only variantable sections that actually have a captured design
                // can be dragged onto the canvas. Without one, the handle must not
                // pretend to be grabbable (that read as "drag is broken").
                const canDrag = variantable && variants.length > 0;
                return (
                  <li
                    key={sec.type}
                    className={[
                      "rounded-lg border px-2.5 py-2 transition",
                      sec.enabled ? "border-border bg-surface-2" : "border-dashed border-border bg-surface opacity-60",
                      drag?.type === sec.type ? "ring-1 ring-accent/50" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        onPointerDown={(e) => beginDrag(e, canDrag ? bestPayload(sec.type, spec?.label ?? sec.type) : null)}
                        className={["touch-none select-none", canDrag ? "cursor-grab text-text-faint hover:text-accent active:cursor-grabbing" : "cursor-not-allowed text-text-faint/30"].join(" ")}
                        title={canDrag ? "Drag onto the preview → to place its best design" : variantable ? "No captured design yet — run a design capture, then Load finished research" : "Editorial section"}
                      >{Ic.drag}</span>
                      {variantable ? (
                        <div className="flex flex-col text-text-faint" title="Cycle the design shown in the preview (◀ prev / ▶ next)">
                          <button type="button" onClick={() => cycleVariant(sec.type, -1)} className="grid h-4 w-5 place-items-center rounded hover:text-accent" aria-label="Previous design">
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 10 4-4 4 4" /></svg>
                          </button>
                          <button type="button" onClick={() => cycleVariant(sec.type, 1)} className="grid h-4 w-5 place-items-center rounded hover:text-accent" aria-label="Next design">
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 6 4 4 4-4" /></svg>
                          </button>
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-base font-medium text-text">
                          {spec?.label ?? sec.type}
                          {required ? <span className="text-accent" title="Required section">{Ic.lock}</span> : null}
                          {global ? <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent" title="Global — this design shows on every page">{Ic.globe} Global</span> : null}
                        </p>
                        {chosen ? (
                          <p className="truncate text-xs text-accent">{global ? "Every page · " : "◆ "}{chosen.siteName ?? "variant"}{chosen.label ? ` · ${chosen.label}` : ""}</p>
                        ) : variantable && variants.find((v) => v.recommended) ? (
                          <p className="flex items-center gap-1 truncate text-xs text-text-faint">
                            <span className="text-accent">{Ic.star}</span>
                            <span className="truncate">Best: {variants.find((v) => v.recommended)?.siteName ?? "top source"}</span>
                          </p>
                        ) : (
                          <p className="truncate text-xs text-text-faint">{variantable ? "Default design" : "Editorial — generated copy"}</p>
                        )}
                      </div>
                      {variantable ? (
                        <button
                          type="button"
                          onClick={() => toggleGlobal(sec.type)}
                          aria-pressed={global}
                          title={global ? "Global ON — this design shows on every page. Click to make it per-page." : "Make this section global — the chosen design applies to this slot on every page (header, footer, hero, services, fleet, areas…)"}
                          className={["grid h-7 w-7 shrink-0 place-items-center rounded-md border transition", global ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface text-text-faint hover:border-accent hover:text-accent"].join(" ")}
                        >
                          {Ic.globe}
                        </button>
                      ) : null}
                      {variantable ? (
                        <button
                          type="button"
                          onClick={() => setOpenPickerFor(pickerOpen ? null : sec.type)}
                          className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-muted transition hover:border-accent hover:text-accent"
                        >
                          {pickerOpen ? "Close" : chosen ? "Change" : `Choose${variants.length ? ` (${variants.length})` : ""}`}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleEnabled(sec.type)}
                        disabled={required}
                        aria-pressed={sec.enabled}
                        className={["relative h-5 w-9 shrink-0 rounded-full border border-border transition", required ? "cursor-not-allowed bg-accent/40" : sec.enabled ? "bg-accent" : "bg-surface"].join(" ")}
                      >
                        <span className={["absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-all", sec.enabled ? "left-[18px]" : "left-[2px]"].join(" ")} />
                      </button>
                    </div>

                    {/* variant tile picker */}
                    {pickerOpen ? (
                      <div className="mt-2 border-t border-border pt-2">
                        {variants.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-text-faint">No researched variants captured for this section type yet.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {/* default tile */}
                            <button
                              type="button"
                              onClick={() => applyVariant(sec.type, null)}
                              disabled={global}
                              title={global ? "Global sections always keep a concrete design" : "Use our built-in template for this section"}
                              className={["group relative overflow-hidden rounded-md border bg-surface text-left transition disabled:opacity-40", !effId ? "border-accent ring-2 ring-accent-ring" : "border-border hover:border-border-strong"].join(" ")}
                            >
                              <div className="grid h-20 place-items-center bg-surface-2 text-text-faint">{Ic.image}</div>
                              <p className="px-1.5 py-1 text-xs text-text-muted">Default (our template)</p>
                              {!effId ? <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-accent-fg">{Ic.check}</span> : null}
                            </button>
                            {variants.map((v) => {
                              const sel = effId === v.selectionId;
                              return (
                                <button
                                  key={v.selectionId}
                                  type="button"
                                  onPointerDown={(e) => beginDrag(e, { type: sec.type, selectionId: v.selectionId, img: v.screenshotUrl, label: spec?.label ?? sec.type })}
                                  onClick={() => applyVariant(sec.type, v.selectionId)}
                                  className={["group relative cursor-grab touch-none select-none overflow-hidden rounded-md border bg-surface text-left transition active:cursor-grabbing", sel ? "border-accent ring-2 ring-accent-ring" : "border-border hover:border-border-strong"].join(" ")}
                                  title={`Drag onto the preview → or click · ${v.siteName ?? ""}`}
                                >
                                  {v.screenshotUrl ? (
                                    // draggable=false + pointer-events-none so the BUTTON is the drag
                                    // source, not the image (native image-drag would steal the gesture).
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.screenshotUrl} alt={v.label ?? v.sectionType} draggable={false} className="pointer-events-none h-20 w-full bg-white object-cover object-top" loading="lazy" />
                                  ) : (
                                    <div className="pointer-events-none grid h-20 place-items-center bg-surface-2 text-text-faint">{Ic.image}</div>
                                  )}
                                  <p className="flex items-center gap-1 truncate px-1.5 py-1 text-xs text-text-muted">
                                    {v.recommended ? <span className="text-accent" title="Best in class — highest-authority source">{Ic.star}</span> : null}
                                    <span className="truncate">{v.siteName ?? v.sectionType}</span>
                                  </p>
                                  {v.recommended ? (
                                    <span className="absolute left-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-fg shadow-xs">★ Best</span>
                                  ) : null}
                                  {sel ? <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-accent-fg">{Ic.check}</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* save / lock */}
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving || !dirty}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base font-medium text-text transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {isSaving ? "Saving…" : dirty ? `Save ${activeLabel} composition` : "Saved"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-base font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover disabled:opacity-60"
            >
              {Ic.shield}
              {isSaving ? "Locking…" : `Lock ${activeLabel} design → all ${activeLabel} pages`}
            </button>
            <p className="text-xs text-text-faint">Lock saves this composition and applies it to every {activeLabel.toLowerCase()} page the build generates.</p>
          </div>
        </aside>

        {/* ── RIGHT · live drag-and-drop composite canvas ──────────────── */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div>
              <p className="text-base font-medium text-text">{activeLabel} — live preview canvas</p>
              <p className="text-xs text-text-faint">Drag a section design from the left and drop it onto its slot — your page builds live.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {drag ? <span className="animate-pulse rounded-full bg-accent px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-accent-fg">Drop {drag.label} →</span> : null}
              <button
                type="button"
                onClick={() => setFullView(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted transition hover:border-accent hover:text-accent"
                title="Open this composed page full-screen"
              >
                {Ic.expand}
                View full page
              </button>
            </div>
          </div>
          <div
            data-canvas
            className={["max-h-[760px] space-y-2 overflow-y-auto p-3 transition-colors", overCanvas ? "bg-accent-tint ring-2 ring-inset ring-accent/40" : "bg-surface-2"].join(" ")}
          >
            {layout.filter((s) => s.enabled).length === 0 ? (
              <div className="grid h-40 place-items-center text-base text-text-faint">No sections enabled.</div>
            ) : (
              layout
                .filter((s) => s.enabled)
                .map((sec) => {
                  const spec = sMap.get(sec.type) as SectionSpec | undefined;
                  const chosen = findVariant(effectiveVariantId(sec));
                  const global = isGlobal(sec.type);
                  const isTarget = drag?.type === sec.type;            // matching slot for the in-flight drag
                  return (
                    <figure
                      key={sec.type}
                      data-slot={sec.type}
                      className={[
                        "group relative overflow-hidden rounded-lg border bg-white transition",
                        isTarget ? "border-accent ring-2 ring-accent shadow-glow" : "border-border",
                      ].join(" ")}
                    >
                      {chosen?.screenshotUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={chosen.screenshotUrl} alt={`${spec?.label ?? sec.type} — ${chosen.siteName ?? ""}`} className="block w-full" loading="lazy" />
                          <figcaption className="flex items-center justify-between gap-2 border-t border-border bg-surface px-2.5 py-1 text-xs text-text-faint">
                            <span className="flex items-center gap-1.5 font-medium text-text-muted">
                              {spec?.label ?? sec.type}
                              {global ? <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent" title="Global — shows on every page">{Ic.globe} Global</span> : null}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="truncate">from {chosen.siteName ?? chosen.siteUrl ?? "reference"}</span>
                              {global ? null : (
                                <button type="button" onClick={() => setVariant(sec.type, null)} className="grid h-5 w-5 place-items-center rounded text-text-faint hover:text-danger" title="Remove this design">{Ic.x}</button>
                              )}
                            </span>
                          </figcaption>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenPickerFor(sec.type)}
                          className={[
                            "flex w-full items-center justify-center gap-2 border-2 border-dashed px-3 py-8 text-center transition",
                            isTarget ? "border-accent bg-accent-tint" : "border-border-strong/60 bg-surface hover:border-accent/60",
                          ].join(" ")}
                        >
                          <span className={isTarget ? "text-accent" : "text-text-faint"}>{Ic.image}</span>
                          <span className="text-sm">
                            <span className="font-medium text-text">{spec?.label ?? sec.type}</span>
                            <span className="ml-1 text-xs text-text-faint">
                              {isTarget ? "— drop to place" : spec?.variantable ? "— drag a design here, or click to pick" : "— editorial, generated copy"}
                            </span>
                          </span>
                        </button>
                      )}
                    </figure>
                  );
                })
            )}
          </div>
        </section>
      </div>

      {/* ── keyword bank (condensed) ───────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-md font-medium text-text">Keyword bank</h3>
            <p className="text-xs text-text-muted">{liveKeywords.length} keyword{liveKeywords.length === 1 ? "" : "s"} for this project.</p>
          </div>
          <button
            type="button"
            onClick={() => startKw(async () => { await actions.finalizeKeywords(projectId); router.refresh(); })}
            disabled={isKw || queuedCount === 0}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-base font-medium text-text transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {isKw ? "Working…" : `Finalize keywords${queuedCount ? ` (${queuedCount})` : ""}`}
          </button>
        </div>
        {liveKeywords.length === 0 ? (
          <p className="mt-3 text-base text-text-faint">No keywords yet — run keyword research from the project workspace.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {liveKeywords.map((k) => (
              <span key={k.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-muted">
                {k.keyword}
                <button
                  type="button"
                  onClick={() => startKw(async () => { await actions.removeKeyword(k.id); router.refresh(); })}
                  disabled={isKw}
                  className="grid h-4 w-4 place-items-center rounded-full text-text-faint transition hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                  aria-label={`Remove ${k.keyword}`}
                >
                  {Ic.x}
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── full-screen composed-page preview ──────────────────────────── */}
      {fullView ? (
        <div className="fixed inset-0 z-[120] flex flex-col bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b1320] px-4 py-2.5 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{businessName} — {activeLabel} page</p>
              <p className="text-xs text-white/55">Composed from your chosen section designs · full-width preview</p>
            </div>
            <button
              type="button"
              onClick={() => setFullView(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
            >
              {Ic.x} Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#11161d] py-6">
            <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-lg bg-white shadow-2xl">
              {layout.filter((s) => s.enabled).length === 0 ? (
                <div className="grid h-60 place-items-center text-base text-text-faint">No sections enabled.</div>
              ) : (
                layout
                  .filter((s) => s.enabled)
                  .map((sec) => {
                    const spec = sMap.get(sec.type) as SectionSpec | undefined;
                    const chosen = findVariant(effectiveVariantId(sec));
                    return chosen?.screenshotUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={sec.type} src={chosen.screenshotUrl} alt={`${spec?.label ?? sec.type} — ${chosen.siteName ?? ""}`} className="block w-full" loading="lazy" />
                    ) : (
                      <div key={sec.type} className="flex items-center justify-center gap-2 border-y border-dashed border-border bg-surface-2 px-4 py-10 text-center text-text-faint">
                        <span>{Ic.image}</span>
                        <span className="text-sm font-medium text-text-muted">{spec?.label ?? sec.type}</span>
                        <span className="text-xs">— {spec?.variantable ? "no design chosen yet" : "editorial section (generated copy)"}</span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* floating drag ghost — follows the cursor during a pointer-drag */}
      {drag ? (
        <div
          className="pointer-events-none fixed z-[100] w-[220px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border-2 border-accent bg-white shadow-glow"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {drag.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={drag.img} alt="" className="block max-h-40 w-full object-cover object-top" />
          ) : (
            <div className="grid h-24 place-items-center bg-surface-2 text-text-faint">{Ic.image}</div>
          )}
          <p className="bg-accent px-2 py-1 text-xs font-semibold text-accent-fg">{drag.label} → drop on canvas</p>
        </div>
      ) : null}
    </div>
  );
}
