"use client";

import { useEffect, useRef } from "react";
import { useOutbox } from "@/lib/offline/useOutbox";

// A service worker fights Next's HMR in dev, so it's prod-only unless
// explicitly opted into for local testing.
const ENABLE_SW =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

// How long an installed update waits before it's allowed to take over on
// the POS — see the "never swap mid-sale" reasoning below. The outbox
// guard is the real safety check; this delay just keeps the reload away
// from a cashier's hands during a busy stretch.
const POS_IDLE_ACTIVATE_MS = 5 * 60 * 1000;

/**
 * The build this bundle belongs to (next.config.js bakes it from the
 * commit SHA). It keys the service worker's caches, so registering at a
 * new URL per build is what makes a deploy evict the previous build's
 * cached shell instead of shadowing it.
 */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

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
 * Registers public/sw.js and drives its update lifecycle.
 *
 * Mounted from BOTH the POS shell and the admin shell. It used to be POS-
 * only, on the belief that this left /admin "untouched" — but the worker
 * registers with `scope: "/"`, and scope is what decides which pages a
 * worker controls, not where `register()` happens to be called. /admin was
 * always controlled by it; it just had no code that could ever *update*
 * it, so a new worker installed and then sat in `waiting` forever while
 * the old one kept serving a stale shell.
 *
 * `activateDelayMs` is why the two mounts differ: the POS waits for a
 * quiet moment because a reload mid-checkout is disruptive, while /admin
 * has no sale to interrupt and wants the fresh build immediately. The
 * outbox guard in `activateIfSafe` applies to both regardless — that, not
 * the delay, is what makes this safe.
 *
 * Registration failing (or being disabled in dev) is silently fine: the
 * app works fully online without it, it just won't survive a reload while
 * genuinely offline.
 */
export default function ServiceWorkerRegistrar({
  activateDelayMs = POS_IDLE_ACTIVATE_MS,
}: {
  activateDelayMs?: number;
} = {}) {
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
      // The ?v= is load-bearing, not cosmetic: it is both what makes the
      // browser see a new script to install on each deploy and what the
      // worker reads to name its caches.
      .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, { scope: "/" })
      .then((registration) => {
        warmOfflineShell();

        const scheduleActivate = () => {
          const waiting = registration.waiting;
          if (!waiting) return;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => activateIfSafe(waiting), activateDelayMs);
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
  }, [activateDelayMs]);

  return null;
}
