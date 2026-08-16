"use client";

/**
 * Clips a stored FULL-PAGE screenshot to a single section's vertical band
 * ([yStartPct, yEndPct] of the full image height) — so vision-detected sections
 * render as clean section thumbnails without any server-side cropping.
 *
 * Pure CSS can't size a box to a % of an image's intrinsic rendered height, so we
 * read naturalWidth/naturalHeight on load (and on resize) and compute the band.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function SectionClip({
  src,
  alt,
  yStartPct,
  yEndPct,
  maxBandPx = 420,
}: {
  src: string;
  alt: string;
  yStartPct: number;
  yEndPct: number;
  maxBandPx?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [style, setStyle] = useState<{ h: number; top: number; renderedH: number } | null>(null);

  const recompute = useCallback(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || !img.naturalWidth || !img.naturalHeight) return;
    const renderedH = wrap.clientWidth * (img.naturalHeight / img.naturalWidth);
    const y0 = Math.max(0, Math.min(100, yStartPct)) / 100;
    const y1 = Math.max(0, Math.min(100, yEndPct)) / 100;
    const band = Math.max(0, y1 - y0) * renderedH;
    setStyle({ h: band, top: -(y0 * renderedH), renderedH });
  }, [yStartPct, yEndPct]);

  useEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  const cappedH = style ? Math.min(style.h, maxBandPx) : undefined;

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden bg-surface-2"
      style={{ height: cappedH ? `${cappedH}px` : "180px" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={recompute}
        className="absolute left-0 w-full max-w-none"
        style={style ? { top: `${style.top}px` } : { top: 0 }}
      />
    </div>
  );
}
