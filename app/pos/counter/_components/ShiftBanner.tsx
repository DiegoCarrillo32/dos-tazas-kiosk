"use client";

import { AlertTriangle, Lock, Wallet } from "lucide-react";
import type { ShiftSummary } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * The strip at the top of the Counter — checkout needs an open shift so
 * cash sales land on the right drawer; a closed shift here would
 * otherwise be a silent dead end at the "Complete Checkout" button.
 */
export function ShiftBanner({
  shift,
  shiftOpening,
  onOpenShift,
  onCloseShift,
}: {
  shift: ShiftSummary | null | undefined;
  /** A queued (not yet synced) shift-open — see OpenShiftDialog. */
  shiftOpening: boolean;
  onOpenShift: () => void;
  onCloseShift: () => void;
}) {
  const t = useT();

  if (!shift) {
    if (shiftOpening) {
      return (
        <div className="shrink-0 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <Wallet className="w-4 h-4 shrink-0" />
            {t("counter.shiftOpeningQueued")}
          </span>
        </div>
      );
    }
    return (
      <div className="shrink-0 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {t("counter.noShiftWarning")}
        </span>
        <button
          onClick={onOpenShift}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-coffee-fruit text-white hover:bg-fruit-light transition-colors"
        >
          <Wallet className="w-4 h-4" />
          {t("counter.openShiftCta")}
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-4 py-1.5 bg-warm-roast/5 border-b border-warm-roast/10 flex items-center justify-between gap-3 text-xs text-expresso/60">
      <span className="flex items-center gap-1.5">
        <Wallet className="w-3.5 h-3.5" />
        {t("counter.shiftExpectedCash")}: <span className="font-semibold text-expresso">{formatMoney(shift.expected_cash, "CRC")}</span>
      </span>
      <button
        onClick={onCloseShift}
        className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 font-medium rounded-lg hover:bg-warm-roast/10 hover:text-expresso transition-colors"
      >
        <Lock className="w-3.5 h-3.5" />
        {t("cash.closeShift")}
      </button>
    </div>
  );
}
