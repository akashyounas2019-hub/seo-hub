"use client";

import { useState } from "react";

/**
 * Image rendered inside a chat message. Competitor screenshot thumbnails the
 * agent surfaces (e.g. from list_build_projects) 404 fairly often, leaving a
 * broken-image glyph. This quietly removes itself if the source fails to load.
 */
export function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="my-1 max-h-48 rounded-md border border-border"
    />
  );
}
