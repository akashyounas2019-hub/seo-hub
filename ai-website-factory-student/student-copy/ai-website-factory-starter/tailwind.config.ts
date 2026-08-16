import type { Config } from "tailwindcss";

/**
 * Operator design system v1.
 *
 * All colors resolve to CSS variables in globals.css. Swap the var to
 * re-skin the whole product. Type scale is anchored to a 4-px multiple
 * line-height grid. Radii cap at 12 — no bubbly chrome.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic surfaces
        bg:           "var(--bg)",
        surface:      "var(--surface)",
        "surface-2":  "var(--surface-2)",
        "surface-3":  "var(--surface-3)",
        border:       "var(--border)",
        "border-strong": "var(--border-strong)",

        // Text
        text:         "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-faint": "var(--text-faint)",

        // Accent (single confident blue in default theme)
        accent: {
          DEFAULT: "var(--accent)",
          hover:   "var(--accent-hover)",
          fg:      "var(--accent-fg)",
          tint:    "var(--accent-tint)",
          ring:    "var(--accent-ring)",
        },

        // Semantic
        success: { DEFAULT: "var(--success)", tint: "var(--success-tint)" },
        warning: { DEFAULT: "var(--warning)", tint: "var(--warning-tint)" },
        danger:  { DEFAULT: "var(--danger)",  tint: "var(--danger-tint)" },
        info:    { DEFAULT: "var(--info)",    tint: "var(--info-tint)" },

        // Customer-brand escape hatch (only for preview surfaces).
        brand: {
          navy:        "var(--brand-navy)",
          "navy-2":    "var(--brand-navy-2)",
          "navy-deep": "var(--brand-navy-deep)",
          champagne:   "var(--brand-champagne)",
          "champagne-2": "var(--brand-champagne-2)",
          ivory:       "var(--brand-ivory)",
          cream:       "var(--brand-cream)",
        },

        // Legacy aliases — kept so unmigrated pages still compile.
        // Sweep in a follow-up.
        ink: "var(--text)",
        paper: "var(--bg)",
        ivory: "var(--surface-2)",
        muted: "var(--text-muted)",
      },

      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        // `font-serif` now aliases to sans (Operator system retires serifs from chrome).
        // Pages using font-serif on H1s land on a sans heading style automatically.
        serif: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },

      // 7-step type scale anchored to 4px line-heights.
      // Default body is `text-base` = 15/22 — the workspace default, sized up
      // from the original 13/20 dense scale for readability across the board.
      // Use `text-md` (16/24) for prose-y settings descriptions, docs.
      fontSize: {
        xs:   ["13px", { lineHeight: "18px", letterSpacing: "0" }],
        sm:   ["14px", { lineHeight: "20px", letterSpacing: "0" }],
        base: ["15px", { lineHeight: "22px", letterSpacing: "0" }],
        md:   ["16px", { lineHeight: "24px", letterSpacing: "-0.003em" }],
        lg:   ["18px", { lineHeight: "26px", letterSpacing: "-0.006em" }],
        xl:   ["20px", { lineHeight: "28px", letterSpacing: "-0.008em" }],
        "2xl":["24px", { lineHeight: "30px", letterSpacing: "-0.011em" }],
        "3xl":["30px", { lineHeight: "36px", letterSpacing: "-0.014em" }],
      },

      // Radii cap at 12. Modal/drawer = 12, card = 8, button/input = 6, chip = 4.
      borderRadius: {
        DEFAULT: "6px",
        none: "0",
        xs: "4px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },

      boxShadow: {
        xs:  "var(--shadow-xs)",
        sm:  "var(--shadow-sm)",
        md:  "var(--shadow-md)",
        lg:  "var(--shadow-lg)",
        pop: "var(--shadow-md)",
      },

      transitionDuration: {
        DEFAULT: "160ms",
        fast: "120ms",
        slow: "220ms",
      },

      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
      },

      letterSpacing: {
        tightish: "-0.011em",
      },

      gridTemplateColumns: {
        24: "repeat(24, minmax(0, 1fr))",
      },
    },
  },
  plugins: [],
} satisfies Config;
