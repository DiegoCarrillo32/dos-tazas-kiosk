"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState } from "react";

const ONE_DAY = 1000 * 60 * 60 * 24;

// Named explicitly (rather than relying on the persister's own default)
// so logout can remove exactly this key from localStorage — clearing the
// in-memory QueryClient alone leaves the previous cashier's cached data
// sitting in storage for the next login to rehydrate.
export const PERSISTED_QUERY_CACHE_KEY = "dostazas.reactQueryCache";

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't refetch on window focus for a POS kiosk
            refetchOnWindowFocus: false,
            // Retry once on failure
            retry: 1,
            // Keep warmed caches (menu, modifiers) alive between interactions and
            // page switches — v5's default gcTime (5 min) is shorter than our
            // 10-min staleTime, which would evict idle data too soon.
            gcTime: ONE_DAY,
          },
        },
      })
  );

  // Persist the cache to localStorage so menu/modifier data survives full page
  // reloads (kiosk wifi can be flaky). On the server `storage` is undefined and
  // the persister no-ops, keeping the provider tree identical across hydration.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: PERSISTED_QUERY_CACHE_KEY,
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY,
        // Bump this whenever a persisted query's return SHAPE changes (not
        // just its data). Without a buster, a kiosk that was open before a
        // deploy rehydrates yesterday's cached payload under today's query
        // key and crashes on the new fields it doesn't have — this is
        // exactly what happened to the old `analytics` key when it went
        // from the client-aggregated shape to `sales_summary`'s richer one.
        buster: "2026-07-26-shift-cash-reconciliation",
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
