"use client";

import { useEffect, useState } from "react";

/**
 * Plain browser online/offline — the "degraded" case (browser says online
 * but Supabase isn't actually reachable, e.g. a captive portal) is
 * layered on top of this by the caller, combining it with whether the
 * outbox has a pending entry that just failed transiently (see
 * OfflineBanner). Keeping that composition at the call site instead of
 * baking it in here means this hook stays reusable anywhere a plain
 * online/offline signal is enough (e.g. disabling refund/void buttons).
 */
export function useConnectionStatus(): "online" | "offline" {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online ? "online" : "offline";
}
