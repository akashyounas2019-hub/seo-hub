/**
 * Skeleton loaders. Use in <Suspense fallback={…}>.
 *
 * Three variants tuned for the admin's common layouts:
 *   <SkeletonRows count={5} />     — list-page rows
 *   <SkeletonStat />               — stat-strip cell
 *   <SkeletonText lines={3} />     — body text placeholder
 */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
        >
          <Bar w="1.5rem" h="1.5rem" rounded />
          <Bar w="40%" h="0.65rem" />
          <Bar w="20%" h="0.5rem" className="ml-auto" />
          <Bar w="3rem" h="0.5rem" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <Bar w="3rem" h="1.75rem" />
      <Bar w="60%" h="0.55rem" className="mt-2" />
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Bar
          key={i}
          w={i === lines - 1 ? "60%" : "100%"}
          h="0.6rem"
        />
      ))}
    </div>
  );
}

function Bar({ w, h, rounded, className }: { w: string; h: string; rounded?: boolean; className?: string }) {
  return (
    <span
      className={`block animate-pulse bg-surface-2 ${rounded ? "rounded-full" : "rounded-sm"} ${className ?? ""}`}
      style={{ width: w, height: h }}
      aria-hidden
    />
  );
}
