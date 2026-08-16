"use client";

/**
 * RobotAvatar — renders the mascot robot inside a self-contained rounded
 * tile with a dark background. Used across every agent card on the Agent
 * Jobs hierarchy screen (leader, experts, sub-agents).
 *
 * The component owns:
 *   - the outer tile background (dark slate + subtle inner ring)
 *   - the sized wrapper (so the robot never overflows the tile)
 *   - the PNG-first loading (with a graceful SVG fallback if the PNG file
 *     hasn't been dropped into /public/agents/ yet)
 *
 * Preferred PNGs (drop them at these paths):
 *   /public/agents/robot-normal.png   — used by experts + sub-agents
 *   /public/agents/robot-leader.png   — used by the AKS SEO Leader (crowned)
 */
import { useState, type CSSProperties } from "react";

export interface RobotAvatarProps {
  /** Which mascot to load. */
  variant?: "normal" | "leader";
  /** Pixel size — width AND height of the outer tile. */
  size?: number;
  /** Cyan-family colour used by the SVG fallback for accent lines + eyes. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
}

const SRC: Record<NonNullable<RobotAvatarProps["variant"]>, string> = {
  normal: "/agents/robot-normal.png",
  leader: "/agents/robot-leader.png",
};

export function RobotAvatar({
  variant = "normal",
  size = 64,
  accent = "#22d3ee",
  className,
  style,
}: RobotAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = SRC[variant];
  // Robot fills ~72% of the tile so it never crops or overflows.
  const inner = Math.round(size * 0.72);

  return (
    <div
      className={
        "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-950/70 ring-1 ring-slate-700/50 " +
        (className ?? "")
      }
      style={{ width: size, height: size, ...style }}
    >
      {/* Subtle radial glow tinted with the accent so the tile reads as
          the same visual language as the reference. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${accent}22, transparent 70%)`,
        }}
      />
      {failed ? (
        <RobotSvgFallback variant={variant} size={inner} accent={accent} />
      ) : (
        <img
          src={src}
          alt=""
          width={inner}
          height={inner}
          onError={() => setFailed(true)}
          className="relative block object-contain"
          style={{ width: inner, height: inner }}
          draggable={false}
        />
      )}
    </div>
  );
}

/* ─────────── SVG fallback ─────────── */

function RobotSvgFallback({
  variant,
  size,
  accent,
}: {
  variant: "normal" | "leader";
  size: number;
  accent: string;
}) {
  const idBase = `rob-${variant}-${accent.replace("#", "")}`;
  const isLeader = variant === "leader";

  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className="relative block"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${idBase}-body`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#101827" />
          <stop offset="55%"  stopColor="#060a12" />
          <stop offset="100%" stopColor="#020306" />
        </linearGradient>
        <radialGradient id={`${idBase}-eye`} cx="50%" cy="50%" r="55%">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor={accent}  stopOpacity="1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.15" />
        </radialGradient>
        <radialGradient id={`${idBase}-chest`} cx="50%" cy="50%" r="55%">
          <stop offset="0%"   stopColor={accent} stopOpacity="0.9" />
          <stop offset="60%"  stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${idBase}-crown`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* Antennae — nubs on top */}
      {!isLeader ? (
        <>
          <line x1="46" y1="10" x2="42" y2="22" stroke="#0a0f1a" strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="10" r="3" fill="#0a0f1a" />
          <line x1="82" y1="10" x2="86" y2="22" stroke="#0a0f1a" strokeWidth="3" strokeLinecap="round" />
          <circle cx="82" cy="10" r="3" fill="#0a0f1a" />
        </>
      ) : null}

      {/* Crown (leader only) */}
      {isLeader ? (
        <g>
          <path
            d="M40 22 L48 12 L54 22 L64 8 L74 22 L80 12 L88 22 L84 34 L44 34 Z"
            fill={`url(#${idBase}-crown)`}
            stroke="#78350f"
            strokeWidth="1"
          />
          <rect x="60" y="24" width="8" height="8" rx="1.5" fill={accent} opacity="0.9" />
          <circle cx="48" cy="12" r="1.6" fill="#fef3c7" />
          <circle cx="64" cy="8" r="1.6" fill="#fef3c7" />
          <circle cx="80" cy="12" r="1.6" fill="#fef3c7" />
        </g>
      ) : null}

      {/* Ear pods */}
      <path
        d="M18 44 Q14 44 14 50 L14 68 Q14 74 20 74 L28 74 L28 44 Z"
        fill={`url(#${idBase}-body)`}
        stroke="#1e293b"
        strokeWidth="0.5"
      />
      <path
        d="M110 44 Q114 44 114 50 L114 68 Q114 74 108 74 L100 74 L100 44 Z"
        fill={`url(#${idBase}-body)`}
        stroke="#1e293b"
        strokeWidth="0.5"
      />
      <rect x="18" y="52" width="4" height="14" rx="2" fill={accent} opacity="0.9" />
      <rect x="106" y="52" width="4" height="14" rx="2" fill={accent} opacity="0.9" />

      {/* Head dome */}
      <path
        d="M28 34 Q28 20 46 20 L82 20 Q100 20 100 34 L100 66 Q100 76 90 76 L38 76 Q28 76 28 66 Z"
        fill={`url(#${idBase}-body)`}
        stroke="#1e293b"
        strokeWidth="1"
      />

      {/* Visor recess */}
      <path
        d="M36 42 Q36 34 46 34 L82 34 Q92 34 92 42 L92 58 Q92 66 82 66 L46 66 Q36 66 36 58 Z"
        fill="#020408"
      />

      {/* Eyes */}
      {!isLeader ? (
        <>
          <circle cx="50" cy="50" r="7.5" fill="none" stroke={accent} strokeWidth="2.5" />
          <circle cx="50" cy="50" r="3.5" fill={`url(#${idBase}-eye)`} />
          <circle cx="78" cy="50" r="7.5" fill="none" stroke={accent} strokeWidth="2.5" />
          <circle cx="78" cy="50" r="3.5" fill={`url(#${idBase}-eye)`} />
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="3.5" fill={accent} />
          <circle cx="78" cy="50" r="3.5" fill={accent} />
        </>
      )}

      {/* Neck / gap */}
      <rect x="50" y="76" width="28" height="3" fill="#0a0f1a" />

      {/* Torso */}
      <path
        d="M32 82 Q32 80 36 80 L92 80 Q96 80 96 84 L96 108 Q96 114 90 114 L38 114 Q32 114 32 108 Z"
        fill={`url(#${idBase}-body)`}
        stroke="#1e293b"
        strokeWidth="1"
      />

      {/* Chest cyan trim outline */}
      <path
        d="M48 84 L64 92 L80 84 M48 84 L48 106 M80 84 L80 106"
        fill="none"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      {/* Chest emblem bars */}
      <rect x="55" y="98" width="18" height="2.5" rx="1" fill={accent} opacity="0.9" />
      <rect x="55" y="102" width="18" height="2.5" rx="1" fill={accent} opacity="0.75" />
      <rect x="55" y="106" width="18" height="2.5" rx="1" fill={accent} opacity="0.6" />
      <circle cx="64" cy="103" r="12" fill={`url(#${idBase}-chest)`} opacity="0.5" />
    </svg>
  );
}
