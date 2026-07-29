import { WifiOff } from "lucide-react";

/**
 * The service worker's navigation fallback (public/sw.js) — served from
 * cache when a page the SW never precached is requested with no network
 * reachable at all. Deliberately static: no cookies(), no Supabase calls,
 * nothing that needs a real request to succeed, so it can be precached
 * once and serve forever offline. If the shell for /pos/floor or
 * /pos/counter was already warmed, staff land there directly instead —
 * this is only the backstop for an unvisited route.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center p-6">
      <div className="bg-warm-roast/10 p-4 rounded-full">
        <WifiOff className="w-10 h-10 text-expresso/50" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-expresso">Sin conexión</h1>
        <p className="text-expresso/60 max-w-sm">
          Esta página no se guardó para uso sin conexión. Vuelve a{" "}
          <a href="/pos/floor" className="text-coffee-fruit underline">
            Piso
          </a>{" "}
          o{" "}
          <a href="/pos/counter" className="text-coffee-fruit underline">
            Caja
          </a>{" "}
          si ya las visitaste antes.
        </p>
      </div>
      <div className="space-y-1 pt-2 border-t border-warm-roast/10 mt-2">
        <h2 className="text-sm font-semibold text-expresso/70">No connection</h2>
        <p className="text-expresso/50 text-sm max-w-sm">
          This page wasn&apos;t saved for offline use. Go back to Floor or Counter if you&apos;ve
          already visited them.
        </p>
      </div>
    </div>
  );
}
