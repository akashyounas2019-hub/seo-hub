/**
 * ScoreRing — SVG circular score widget used in /admin overview, site
 * detail pages, and the weekly report. Tonal palette tied to the brand
 * (champagne for great, warning for middling, danger for poor). When a
 * WoW delta is provided we render a tiny trend arrow + delta number.
 */
import Link from "next/link";
import type { ScoreKey } from "@/lib/scoring";
import { cn } from "@/lib/utils";

interface ScoreRingProps {
  label: string;
  value: number | null;
  delta?: number | null;
  size?: "sm" | "md" | "lg";
  href?: string;
  scoreKey?: ScoreKey;
  inverse?: boolean; // For "pressure" / "decay": low values are good
}

const SIZES = {
  sm: { box: 56, stroke: 5, font: 13, sub: 8 },
  md: { box: 88, stroke: 7, font: 22, sub: 9 },
  lg: { box: 120, stroke: 9, font: 30, sub: 10 },
} as const;

function tone(v: number, inverse: boolean): { ring: string; text: string } {
  // For inverse scores, low = good.
  const score = inverse ? 100 - v : v;
  if (score >= 75) return { ring: "stroke-success", text: "text-success" };
  if (score >= 50) return { ring: "stroke-accent", text: "text-accent" };
  if (score >= 25) return { ring: "stroke-warning", text: "text-warning" };
  return { ring: "stroke-danger", text: "text-danger" };
}

export function ScoreRing({
  label,
  value,
  delta = null,
  size = "md",
  href,
  inverse = false,
}: ScoreRingProps) {
  const dims = SIZES[size];
  const radius = (dims.box - dims.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Ring fill mirrors the tone. For inverse dimensions (content decay /
  // competitor pressure) a LOW value is good, so the ring fills toward "good".
  // Without this, an excellent inverse score (0 competitor pressure) rendered
  // as a missing arc and a low one (3 decay) as a detached round-cap sliver —
  // even though the number was coloured green.
  const pct =
    value === null ? 0 : Math.max(0, Math.min(100, inverse ? 100 - value : value));
  const offset = circumference - (pct / 100) * circumference;
  const { ring, text } = value === null
    ? { ring: "stroke-border", text: "text-text-faint" }
    : tone(value, inverse);

  const inner = (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg width={dims.box} height={dims.box} className="-rotate-90">
          <circle
            cx={dims.box / 2}
            cy={dims.box / 2}
            r={radius}
            fill="none"
            strokeWidth={dims.stroke}
            className="stroke-border-strong"
          />
          {value !== null && (
            <circle
              cx={dims.box / 2}
              cy={dims.box / 2}
              r={radius}
              fill="none"
              strokeWidth={dims.stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={cn(ring, "transition-[stroke-dashoffset]")}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-serif font-semibold tnum", text)} style={{ fontSize: dims.font }}>
            {value === null ? "—" : value}
          </span>
          {delta !== null && delta !== undefined && value !== null && (
            <span
              className={cn(
                "tnum",
                delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-text-faint",
              )}
              style={{ fontSize: dims.sub }}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {Math.abs(delta)}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-center text-text-faint uppercase tracking-[0.06em]"
        style={{ fontSize: size === "sm" ? 9 : 10 }}
      >
        {label}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-md px-1 py-1 transition hover:bg-surface-soft">
        {inner}
      </Link>
    );
  }
  return inner;
}

/** Pretty label for a score key. */
export const SCORE_LABELS: Record<ScoreKey, string> = {
  site_health: "Site health",
  seo: "SEO",
  design_freshness: "Design",
  competitor_pressure: "Competitor",
  content_decay: "Decay",
  local_seo_completeness: "Local SEO",
};

export const SCORE_INVERSE: Partial<Record<ScoreKey, boolean>> = {
  competitor_pressure: true,
  content_decay: true,
};

interface ScoreGridProps {
  scores: Array<{ key: ScoreKey; current: number | null; delta: number | null }>;
  siteSlug?: string;
  size?: "sm" | "md" | "lg";
}

export function ScoreGrid({ scores, siteSlug, size = "md" }: ScoreGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {scores.map((s) => (
        <ScoreRing
          key={s.key}
          label={SCORE_LABELS[s.key]}
          value={s.current}
          delta={s.delta ?? null}
          size={size}
          inverse={!!SCORE_INVERSE[s.key]}
          href={siteSlug ? `/admin/sites/${siteSlug}/scores/${s.key}` : undefined}
        />
      ))}
    </div>
  );
}
