import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Admin-route skeleton composites, built on the shared `Skeleton` block.
 * Each of these mirrors the actual layout of the page it stands in for
 * (same padding, grid, card recipe) so there's no shape-shift when real
 * content swaps in. Deliberately hook-free / no "use client": every one of
 * these is used both by a route's server-component `loading.tsx` and by
 * that same page's client-side `isLoading` branch, so it must stay
 * server-safe. No copy either — bars only, so nothing here depends on
 * useT() (which is client-only).
 */

/**
 * Just the title + subtitle block (matches every page's `<h1 className="text-2xl
 * font-bold">` + `<p className="mt-1">`). Callers that also render an action
 * button or filters beside it compose their own `flex justify-between` row
 * around this, rather than this component guessing at that shape.
 */
export function PageHeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64 mt-3" />
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardsSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
            <Skeleton className="h-5 w-40 mb-6" />
            <Skeleton className="h-[240px] sm:h-[300px] w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-max whitespace-nowrap text-left">
          <thead className="bg-muted/40">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 sm:px-6 py-3 sm:py-4">
                  <Skeleton className="h-3.5 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-roast/10">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-4 sm:px-6 py-3 sm:py-4">
                    <Skeleton className={c === 0 ? "h-4 w-32" : "h-4 w-20"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
      <ul className="divide-y divide-warm-roast/10">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-3">
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
            <Skeleton className="h-4 flex-1 max-w-48" />
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm space-y-5 max-w-lg">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3.5 w-24 mb-2" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-md" />
    </div>
  );
}
