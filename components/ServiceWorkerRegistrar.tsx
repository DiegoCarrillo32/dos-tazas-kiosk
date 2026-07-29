"use client";

import { useEffect, useRef } from "react";
import { useOutbox } from "@/lib/offline/useOutbox";

// A service worker fights Next's HMR in dev, so it's prod-only unless
// explicitly opted into for local testing.
const ENABLE_SW =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

// How long an installed update waits for an idle moment before it's
// allowed to take over — see the "never swap mid-sale" reasoning below.
const IDLE_ACTIVATE_MS = 5 * 60 * 1000;

export function warmOfflineShell() {
  navigator.serviceWorker?.controller?.postMessage({ type: "WARM_SHELL" });
}

/** Call on logout — /pos/floor and /pos/counter render THAT user's data
 * server-side, so a shared kiosk's next cashier must not cold-start into
 * the previous one's cached shell. */
export function clearOfflineShell() {
  navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_SHELL" });
}

/**
 * Registers public/sw.js and drives its update lifecycle. Mounted once
 * from POSNav — not the root layout, so /login and /admin's CSV downloads
 * stay untouched by it. Registration failing (or being disabled in dev)
 * is silently fine: the app works fully online without it, it just won't
 * survive a reload while genuinely offline.
 */
export default function ServiceWorkerRegistrar() {
  const { pendingCount, failedCount } = useOutbox();
  const blockedRef = useRef(0);

  useEffect(() => {
    blockedRef.current = pendingCount + failedCount;
  }, [pendingCount, failedCount]);

  useEffect(() => {
    if (!ENABLE_SW || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const onControllerChange = () => {
      // A new SW just took over. Reload once so the page runs under it
      // consistently — guarded so a second controllerchange (shouldn't
      // happen, but browsers have surprised people here before) can't
      // loop.
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const activateIfSafe = (worker: ServiceWorker) => {
      // Never swap the code running a checkout out from under it, and
      // never take over while a sale is still sitting in the outbox —
      // simplest possible proxy for "nothing is mid-flight" without
      // threading a global "checkout in progress" flag through the app.
      if (blockedRef.current > 0) return;
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        warmOfflineShell();

        const scheduleActivate = () => {
          const waiting = registration.waiting;
          if (!waiting) return;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => activateIfSafe(waiting), IDLE_ACTIVATE_MS);
        };

        if (registration.waiting) scheduleActivate();
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && registration.waiting) {
              scheduleActivate();
            }
          });
        });
      })
      .catch(() => {
        // No offline shell this session — not fatal, see comment above.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  return null;
}
