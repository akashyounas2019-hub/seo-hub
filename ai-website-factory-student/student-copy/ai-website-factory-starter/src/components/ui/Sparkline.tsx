import { cn } from "@/lib/utils";

/**
 * Inline SVG sparkline. Minimal — no axes, no labels, just the line + a soft fill.
 * Renders inside Stat's footer slot (32px tall by default). Auto-scales to the
 * provided width/height; data is normalized to 0..1 against the series min/max.
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className,
  /** Color override. Defaults to currentColor of parent (which is the accent tint when used in a colored Stat). */
  stroke,
  /** Soft fill under the line; pass false to disable */
  fill = true,
  /** Highlight the last point as a small dot */
  dot = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
  fill?: boolean;
  dot?: boolean;
}) {
  if (data.length === 0) {
    return null;
  }
  // A sparkline needs at least two non-zero points to read as a trend. With
  // zero or one it renders as a flat baseline or a lone spike that looks like a
  // glitch beside a "0" stat — hide it in that case.
  if (data.filter((v) => v !== 0).length < 2) {
    return null;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid /0 when flat
  const pad = 2; // visual padding to keep stroke + dot inside the box
  const w = width - pad * 2;
  const h = height - pad * 2;
  const step = data.length > 1 ? w / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + h - ((v - min) / range) * h;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(pad + h).toFixed(2)} L ${points[0].x.toFixed(2)} ${(pad + h).toFixed(2)} Z`;

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block", className)}
      aria-hidden="true"
      style={{ color: stroke }}
    >
      {fill ? (
        <path d={fillPath} fill="currentColor" opacity={0.12} />
      ) : null}
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {dot ? <circle cx={last.x} cy={last.y} r={2} fill="currentColor" /> : null}
    </svg>
  );
}
