"use client";

import { useState } from "react";
import { WifiOff, CloudUpload, AlertTriangle } from "lucide-react";
import { useConnectionStatus } from "@/lib/offline/useConnectionStatus";
import { useOutbox } from "@/lib/offline/useOutbox";
import { useT } from "@/lib/i18n/LanguageContext";
import { SyncQueueDialog } from "@/components/SyncQueueDialog";

/**
 * The one place staff learn "no connection, but you can keep selling" —
 * mounted in POSNav below the header so it shifts the layout (rather than
 * floating over the cart) and appears on both Floor and Counter.
 *
 * A `failed` entry keeps this red and visible even once the connection is
 * back — that's deliberate: it needs a human, not a retry timer.
 */
export function OfflineBanner() {
  const t = useT();
  const conn = useConnectionStatus();
  const { entries, pendingCount, failedCount } = useOutbox();
  const [showQueue, setShowQueue] = useState(false);

  if (conn === "online" && pendingCount === 0 && failedCount === 0) return null;

  const isFailed = failedCount > 0;
  const isSending = entries.some((e) => e.status === "inflight");

  const message = isFailed
    ? t("offline.bannerFailed", { n: failedCount })
    : isSending
      ? t("offline.bannerSending", { n: pendingCount })
      : pendingCount > 0
        ? t("offline.bannerPending", { n: pendingCount })
        : t("offline.bannerOffline");

  const colorClasses = isFailed
    ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300"
    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300";

  return (
    <>
      <div
        className={`shrink-0 min-h-[44px] px-4 py-2 border-b flex items-center justify-between gap-3 ${colorClasses}`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {isFailed ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : isSending ? (
            <CloudUpload className="w-4 h-4 shrink-0 animate-pulse" />
          ) : (
            <WifiOff className="w-4 h-4 shrink-0" />
          )}
          {message}
        </span>
        <button
          onClick={() => setShowQueue(true)}
          className="shrink-0 inline-flex items-center px-3 min-h-[44px] text-sm font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {t("offline.viewQueue")}
        </button>
      </div>
      {showQueue && <SyncQueueDialog onClose={() => setShowQueue(false)} />}
    </>
  );
}
