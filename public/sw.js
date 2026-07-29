// Dos Tazas POS — offline shell service worker.
//
// Everything that actually matters for offline order-taking (the outbox,
// the pricing mirror, dedup) lives in the app itself — see lib/offline/*.
// This file's only job is keeping the app SHELL reachable when the device
// has no network at all, so a reload or cold start doesn't strand staff
// on a blank tab. It intentionally knows nothing about orders, auth, or
// Supabase beyond "never touch that traffic" (rule 1 below).
//
// Bump CACHE_VERSION on every deploy that changes what should be
// precached. There's no build-hash-driven precache manifest here (no
// bundler step for this file), so a stale cached shell after a deploy is
// an accepted, bounded cost — see the network-first navigation strategy,
// which always prefers a live response when one is reachable.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `dostazas-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `dostazas-static-${CACHE_VERSION}`;

const SHELL_URLS = ["/pos/floor", "/pos/counter", "/offline"];
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // A cold install before login (no session cookie yet) may 307 to
        // /login for /pos/*; addAll then fails on the redirected response.
        // Not fatal — the registrar's post-login shell warm-up covers it.
      })
  );
  // Deliberately no self.skipWaiting() here — see the "activate" comment
  // below and ServiceWorkerRegistrar.tsx for why an update waits for an
  // explicit signal instead of taking over mid-sale.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// The registrar posts this only when the outbox is empty and no checkout
// is in progress — see components/ServiceWorkerRegistrar.tsx. Taking over
// mid-sale would swap the code running a payment out from under it.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "WARM_SHELL") {
    event.waitUntil(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.addAll(SHELL_URLS).catch(() => {})
      )
    );
  }
  if (event.data?.type === "CLEAR_SHELL") {
    // /pos/floor and /pos/counter render THIS user's data server-side
    // (their layout reads cookies()); a shared kiosk logging out must not
    // let the next person's cold start see the previous cashier's cached
    // shell.
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
});

function isSupabaseRequest(url) {
  return (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/v1/") ||
    url.pathname.startsWith("/realtime/v1/") ||
    url.pathname.startsWith("/storage/v1/")
  );
}

function isCacheableResponse(res) {
  // res.type === "opaque" (cross-origin, no-cors) is deliberately excluded
  // too — we only ever want to cache responses we can actually inspect.
  return res && res.ok && res.type === "basic";
}

async function networkFirstNav(request) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline");
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Rule 1, and it has to be first: never cache anything that talks to
  // Supabase. A cached /rest/v1/orders would show a stale parked queue a
  // cashier could try to charge, and a cached auth response could
  // silently outlive a real sign-out. This is an allowlist of what MAY be
  // cached below, never a denylist — anything not explicitly matched
  // falls through to "don't touch it."
  if (isSupabaseRequest(url)) return;

  if (request.method !== "GET") return;

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNav(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/assets/fonts/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (
    url.pathname === "/favicon.svg" ||
    url.pathname === "/icons.svg" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Everything else same-origin (menu/API data goes through Supabase and
  // never reaches here — this is leftover same-origin GETs like _next/data
  // or other static files): network-first, cache as a fallback only.
  event.respondWith(networkFirst(request, SHELL_CACHE));
});
