import { readFileSync } from "node:fs";
import { createContext, runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Why this test exists: public/sw.js keyed its caches on a hardcoded
// `CACHE_VERSION = "v1"` with a comment asking whoever deployed to bump
// it by hand. Nobody ever did. Because `activate` only evicts caches
// whose name differs from the current one, nothing was EVER evicted, and
// a device that had used the POS kept booting /admin against an older
// build's cached document and chunks. It took production down.
//
// So: assert the two properties that failure violated — cache names must
// change between builds, and activating a build must drop every other
// build's caches.

// public/ is served verbatim at the site root, so this test deliberately
// lives here rather than beside the file it exercises.
const SW_SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

type Listeners = Record<string, ((event: unknown) => void)[]>;

/** A throwaway CacheStorage that just records which cache names exist. */
function fakeCaches(initialNames: string[]) {
  const names = new Set(initialNames);
  return {
    store: names,
    keys: async () => [...names],
    open: async (name: string) => {
      names.add(name);
      return { match: async () => undefined, put: async () => {}, addAll: async () => {} };
    },
    delete: async (name: string) => names.delete(name),
    match: async () => undefined,
  };
}

/** Boot sw.js as if the browser had registered it at `/sw.js?v=<build>`. */
function bootWorker(build: string, existingCacheNames: string[] = []) {
  const listeners: Listeners = {};
  const caches = fakeCaches(existingCacheNames);
  const self = {
    location: { href: `https://pos.example/sw.js?v=${build}`, origin: "https://pos.example" },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (listeners[type] ??= []).push(fn);
    },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
  };
  const context = createContext({ self, caches, URL, Response, fetch: async () => {}, setTimeout, clearTimeout, AbortController, Promise, console });
  runInNewContext(SW_SOURCE, context);

  const drain = async (type: string, event: Record<string, unknown>) => {
    const pending: Promise<unknown>[] = [];
    for (const fn of listeners[type] ?? []) {
      fn({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    }
    await Promise.all(pending);
  };

  return {
    caches,
    /** Run the activate handler and wait on whatever it passed to waitUntil. */
    activate: () => drain("activate", {}),
    /** WARM_SHELL opens the shell cache, which is how we observe its name. */
    warmShell: () => drain("message", { data: { type: "WARM_SHELL" } }),
  };
}

describe("service worker cache versioning", () => {
  it("names its caches after the build it was registered for", async () => {
    const worker = bootWorker("buildA");
    await worker.warmShell();
    expect([...worker.caches.store]).toContain("dostazas-shell-buildA");
  });

  it("gives two different builds two different cache names", async () => {
    // The regression, stated directly: with a hardcoded version these were
    // the same string, so a new build silently adopted the old build's
    // stale entries instead of starting clean.
    const a = bootWorker("buildA");
    const b = bootWorker("buildB");
    await a.warmShell();
    await b.warmShell();

    expect([...a.caches.store]).toContain("dostazas-shell-buildA");
    expect([...b.caches.store]).toContain("dostazas-shell-buildB");
    expect([...b.caches.store]).not.toContain("dostazas-shell-buildA");
  });

  it("evicts every other build's caches when it activates", async () => {
    const stale = ["dostazas-shell-oldbuild", "dostazas-static-oldbuild", "dostazas-shell-v1"];
    const worker = bootWorker("newbuild", stale);
    await worker.activate();

    for (const name of stale) {
      expect(worker.caches.store.has(name)).toBe(false);
    }
  });

  it("keeps its own caches across an activate", async () => {
    const mine = ["dostazas-shell-newbuild", "dostazas-static-newbuild"];
    const worker = bootWorker("newbuild", mine);
    await worker.activate();

    for (const name of mine) {
      expect(worker.caches.store.has(name)).toBe(true);
    }
  });

  it("never serves a lookup from the whole origin's caches", () => {
    // `caches.match(request)` with no cacheName searches EVERY cache in the
    // origin, which hands back another build's response and defeats the
    // versioning above. Every lookup must go through an opened cache.
    // Comments are stripped first so this checks the code, not the prose
    // explaining the rule.
    const code = SW_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bcaches\.match\(/);
  });
});
