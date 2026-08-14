import { cn } from "@/lib/utils";

/**
 * The one base loading block, used to compose every admin skeleton (see
 * app/admin/_components/Skeletons.tsx). Deliberately has no "use client" and
 * no hooks — it's imported both by server-component route loading.tsx files
 * and by the client pages' own isLoading branches, so it must stay
 * server-safe. Pass width/height via className (e.g. "h-4 w-32").
 *
 * Uses warm-roast at low opacity for the base fill so it's visible against
 * bg-card/bg-background in both themes without a `dark:` override — same
 * convention as the rest of the brand tokens (see dos-tazas-styling skill).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-warm-roast/10", className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-warm-roast/10 to-transparent" />
    </div>
  );
}
