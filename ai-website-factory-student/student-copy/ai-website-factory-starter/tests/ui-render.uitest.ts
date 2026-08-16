/**
 * Render-level proof for the UI-audit fixes. No DB — pure component output via
 * renderToStaticMarkup, so it's safe to run alongside a live dev server.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "@/components/ui/Sparkline";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { markdownToHtml } from "@/lib/markdown";

const render = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const lastDashoffset = (svg: string): number | null => {
  const m = [...svg.matchAll(/stroke-dashoffset="([\d.]+)"/g)].map((x) => Number(x[1]));
  return m.length ? m[m.length - 1] : null;
};
const MD_CIRC = 2 * Math.PI * ((88 - 7) / 2); // md ring circumference

describe("Sparkline — no lone-spike / zero noise", () => {
  it("renders nothing for all-zero data", () => {
    expect(render(createElement(Sparkline, { data: [0, 0, 0, 0] }))).toBe("");
  });
  it("renders nothing for a single non-zero point (the lone triangle)", () => {
    expect(render(createElement(Sparkline, { data: [0, 0, 0, 1] }))).toBe("");
  });
  it("renders an svg for a real trend (>=2 non-zero)", () => {
    expect(render(createElement(Sparkline, { data: [0, 2, 5, 3] }))).toContain("<svg");
  });
});

describe("ScoreRing — inverse dimensions fill toward 'good'", () => {
  it("excellent inverse score (0 competitor) fills the ring, not empty", () => {
    const off = lastDashoffset(render(createElement(ScoreRing, { label: "Competitor", value: 0, inverse: true })));
    expect(off).not.toBeNull();
    expect(off!).toBeLessThan(1); // ~full ring (was a missing arc before)
  });
  it("low inverse score (3 decay) is a near-full ring, not a detached sliver", () => {
    const off = lastDashoffset(render(createElement(ScoreRing, { label: "Decay", value: 3, inverse: true })))!;
    expect(off / MD_CIRC).toBeLessThan(0.05); // ~97% filled
  });
  it("normal (non-inverse) score still fills proportionally", () => {
    const off = lastDashoffset(render(createElement(ScoreRing, { label: "SEO", value: 30, inverse: false })))!;
    expect(off / MD_CIRC).toBeGreaterThan(0.6);
    expect(off / MD_CIRC).toBeLessThan(0.8); // 30% fill => ~70% offset
  });
  it("track ring is visible (not the near-invisible /60)", () => {
    expect(render(createElement(ScoreRing, { label: "x", value: 0, inverse: true }))).toContain("stroke-border-strong");
  });
});

describe("Notification digest — Markdown renders (no raw ## / **)", () => {
  const html = markdownToHtml("## Needs attention\n\n**You've been offline** for 9 days.\n\n- one\n- two");
  it("renders a heading element", () => expect(html).toContain("<h2>"));
  it("renders bold", () => expect(html).toContain("<strong>"));
  it("renders a list", () => expect(html).toContain("<ul"));
  it("does not leak literal markdown markers", () => {
    expect(html).not.toContain("## ");
    expect(html).not.toContain("**You");
  });
});
