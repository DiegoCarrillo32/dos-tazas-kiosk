"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useOpenShift, useCloseShift } from "@/lib/hooks";
import type { CountedBreakdown, ShiftSummary } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { DenominationCounter, denominationTotal } from "@/components/DenominationCounter";
import { useT } from "@/lib/i18n/LanguageContext";
import { useOutbox } from "@/lib/offline/useOutbox";
import { useConnectionStatus } from "@/lib/offline/useConnectionStatus";
import { enqueueOpenShift } from "@/lib/offline/outbox";
import { isNetworkError } from "@/lib/offline/sync";
import { SyncQueueDialog } from "@/components/SyncQueueDialog";

/**
 * Opening and closing a shift is a floor-staff action, not an admin one —
 * the person who counts the drawer is the person working the till. These
 * dialogs are shared so the Counter and the admin Cash Drawer page drive
 * the exact same flow; the RPCs behind them (`open_shift` / `close_shift`)
 * are granted to every authenticated user and stamp `opened_by`/`closed_by`,
 * so the audit trail stands on its own without a role gate.
 */

export function OpenShiftDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const openMut = useOpenShift();
  const [openingFloat, setOpeningFloat] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);
  const conn = useConnectionStatus();

  // One id per dialog open (not per tap) — a double-tap or a
  // dropped-response retry on the SAME attempt reuses it, so open_shift's
  // idempotency check (migration 00019) turns a retry into a clean no-op
  // instead of "a shift is already open".
  const [clientUuid] = useState(() => crypto.randomUUID());

  const queueOffline = (value: number) => {
    setIsQueueing(true);
    // No matching idempotency key on the offline path — enqueueOpenShift
    // mints its own outbox id (the client_uuid the RPC will see once this
    // drains), independent of the one guarding the online attempt above.
    enqueueOpenShift(value)
      .then(() => onClose())
      .finally(() => setIsQueueing(false));
  };

  const handleOpenShift = () => {
    const value = Math.max(0, parseFloat(openingFloat) || 0);

    if (conn === "offline") {
      queueOffline(value);
      return;
    }

    openMut.mutate(
      { openingFloat: value, clientUuid },
      {
        onSuccess: onClose,
        onError: (err) => {
          // navigator.onLine said "online" but the request itself
          // couldn't reach Supabase — queue it rather than stranding the
          // cashier with no way to open a drawer at all.
          if (isNetworkError(err)) {
            queueOffline(value);
            return;
          }
          toast(t("cash.errorGeneric"));
        },
      }
    );
  };

  return (
    <Modal onClose={onClose} title={t("cash.openShift")}>
      <div className="space-y-4">
        <div>
          <Label className="mb-1 block">{t("cash.openingFloat")}</Label>
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            autoFocus
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            placeholder="0"
          />
        </div>
        <Button
          size="lg"
          className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          isLoading={openMut.isPending || isQueueing}
          onClick={handleOpenShift}
        >
          {t("cash.openShiftButton")}
        </Button>
      </div>
    </Modal>
  );
}

export function CloseShiftDialog({
  shift,
  onClose,
}: {
  shift: ShiftSummary;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const closeMut = useCloseShift();
  const [breakdown, setBreakdown] = useState<CountedBreakdown>({});
  const [closingNote, setClosingNote] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  // close_shift computes the Z-report from what the SERVER already knows —
  // it has no idea a device still has unsent sales in its own outbox. This
  // guard lives here (not at the counter/admin call sites) so every path
  // to this dialog inherits it: closing early would understate the
  // drawer's expected cash by exactly what's still queued.
  const { pendingCount, failedCount } = useOutbox();
  const blockedByOutbox = pendingCount + failedCount;

  const countedTotal = denominationTotal(breakdown);
  const variance = countedTotal - shift.expected_cash;
  // A numeric(10,2) column can round-trip through JS as e.g.
  // 1234.0000000002 — strict equality would paint a genuinely balanced
  // drawer red over a floating-point artifact, not a real variance.
  const balanced = Math.abs(variance) < 0.005;

  const handleCloseShift = async () => {
    if (!(await confirmDialog(t("cash.confirmClose")))) return;
    closeMut.mutate(
      { countedCash: countedTotal, countedBreakdown: breakdown, note: closingNote.trim() || null },
      {
        onSuccess: onClose,
        onError: () => toast(t("cash.errorGeneric")),
      }
    );
  };

  return (
    <Modal onClose={onClose} title={t("cash.closeShiftTitle")} size="lg">
      <div className="space-y-5">
        {blockedByOutbox > 0 && (
          <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 space-y-3">
            <p className="flex items-start gap-2 text-sm font-medium text-red-800 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {t("cash.cannotCloseWithPending", { n: blockedByOutbox })}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setShowQueue(true)}>
              {t("cash.viewPendingOrders")}
            </Button>
          </div>
        )}
        {showQueue && <SyncQueueDialog onClose={() => setShowQueue(false)} />}
        <p className="text-sm text-expresso/60">{t("cash.countTheDrawer")}</p>
        <DenominationCounter breakdown={breakdown} onChange={setBreakdown} />

        <div className="flex justify-between items-center p-4 rounded-xl bg-warm-roast/5 border border-warm-roast/10">
          <span className="text-sm font-medium text-expresso/70">{t("cash.expectedCash")}</span>
          <span className="font-bold text-expresso">{formatMoney(shift.expected_cash, "CRC")}</span>
        </div>

        <div
          className={cn(
            "flex items-center justify-between p-4 rounded-xl border",
            balanced
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/40"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40"
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-expresso">
            {balanced ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
            {t("cash.variance")}
          </span>
          <span
            className={cn(
              "font-bold tabular-nums",
              balanced ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
            )}
          >
            {variance > 0 ? "+" : ""}
            {formatMoney(variance, "CRC")}
          </span>
        </div>

        <div>
          <Label className="mb-1 block">{t("cash.closingNote")}</Label>
          <Input
            type="text"
            value={closingNote}
            onChange={(e) => setClosingNote(e.target.value)}
            placeholder={t("cash.closingNotePlaceholder")}
          />
        </div>

        <Button
          size="lg"
          className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          isLoading={closeMut.isPending}
          disabled={blockedByOutbox > 0}
          onClick={handleCloseShift}
        >
          {t("cash.closeShiftButton")}
        </Button>
      </div>
    </Modal>
  );
}
