"use client";

/**
 * Wraps the admin main content. Keyed by pathname so React remounts the
 * subtree on every route change — which re-fires the `.gyl-page-enter`
 * staggered fade-up animation (defined in globals.css). The children are
 * server-rendered and passed straight through; this island only supplies
 * the animation key. prefers-reduced-motion silences the motion globally.
 */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="gyl-page-enter mx-auto max-w-[1200px]">
      {children}
    </div>
  );
}
