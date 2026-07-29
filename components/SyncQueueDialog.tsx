"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useOutbox } from "@/lib/offline/useOutbox";
import type { OutboxEntry } from "@/lib/offline/types";
import { useT } from "@/lib/i18n/LanguageContext";
import { cn, formatMoney } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

/**
 * The queue panel for orders taken offline — what's still pending, what
 * synced (and as which real order number, so it can be matched against
 * paper), and what failed and needs a human. Reuses Modal, the same
 * primitive the shift open/close dialogs use.
 */
export function SyncQueueDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { entries, retryEntry, retryAll, kick } = useOutbox();

  // Newest first — staff scanning the panel care most about what just
  // happened, not the oldest thing still stuck in backoff.
  const sorted = [...entries].sort((a, b) => b.seq - a.seq);

  return (
    <Modal onClose={onClose} title={t("offline.queueTitle")} size="lg">
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-expresso/60 text-center py-6">{t("offline.queueEmpty")}</p>
        ) : (
          sorted.map((entry) => <QueueRow key={entry.id} entry={entry} onRetry={retryEntry} />)
        )}
      </div>
      <div className="flex gap-3 mt-5 pt-4 border-t border-warm-roast/10">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => kick()}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          {t("offline.refresh")}
        </Button>
        <Button
          className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          onClick={() => retryAll()}
        >
          {t("offline.retryAll")}
        </Button>
      </div>
    </Modal>
  );
}

function QueueRow({
  entry,
  onRetry,
}: {
  entry: OutboxEntry;
  onRetry: (id: string) => void;
}) {
  const t = useT();
  const { snapshot } = entry;

  const stateLabel =
    entry.status === "failed"
      ? t("offline.stateFailed")
      : entry.status === "done"
        ? entry.result?.orderNumber != null
          ? t("offline.syncedAs", { n: entry.result.orderNumber })
          : t("offline.stateSynced")
        : entry.status === "inflight"
          ? t("offline.stateSending")
          : t("offline.statePending");

  const stateClass =
    entry.status === "failed"
      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      : entry.status === "done"
        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";

  const itemLabel = snapshot.itemCount === 1 ? t("common.item") : t("common.items");
  const discrepancy = entry.result?.discrepancy ?? 0;

  return (
    <div className="p-3 rounded-xl border border-warm-roast/10 bg-warm-roast/5 space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="font-mono font-semibold text-sm text-expresso">{entry.offlineRef}</span>
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", stateClass)}>
          {stateLabel}
        </span>
      </div>
      <div className="flex justify-between text-xs text-expresso/60">
        <span>
          {snapshot.tableName ?? t("common.takeaway")} · {snapshot.itemCount} {itemLabel}
        </span>
        <span className="font-medium text-expresso/80">
          {formatMoney(snapshot.totalAmount, snapshot.currency)}
        </span>
      </div>
      {discrepancy !== 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          {t("offline.discrepancy", {
            server: formatMoney(snapshot.totalAmount + discrepancy, snapshot.currency),
            charged: formatMoney(snapshot.totalAmount, snapshot.currency),
          })}
        </div>
      )}
      {entry.status === "failed" && (
        <div className="space-y-2 pt-1">
          {entry.lastError && (
            <p className="text-xs text-red-700 dark:text-red-400">
              {t("offline.lastError")}: {entry.lastError}
            </p>
          )}
          <Button size="sm" variant="secondary" onClick={() => onRetry(entry.id)}>
            {t("offline.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
