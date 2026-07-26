"use client";

import { useState } from "react";
import { X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useOpenShift, useCloseShift } from "@/lib/hooks";
import type { CountedBreakdown, ShiftSummary } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DenominationCounter, denominationTotal } from "@/components/DenominationCounter";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * Opening and closing a shift is a floor-staff action, not an admin one —
 * the person who counts the drawer is the person working the till. These
 * dialogs are shared so the Counter and the admin Cash Drawer page drive
 * the exact same flow; the RPCs behind them (`open_shift` / `close_shift`)
 * are granted to every authenticated user and stamp `opened_by`/`closed_by`,
 * so the audit trail stands on its own without a role gate.
 */

export function ShiftModal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full bg-card rounded-2xl border border-warm-roast/10 shadow-xl p-6 max-h-[85vh] overflow-y-auto",
          wide ? "max-w-lg" : "max-w-sm"
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-expresso">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-expresso/40 hover:text-expresso">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function OpenShiftDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const openMut = useOpenShift();
  const [openingFloat, setOpeningFloat] = useState("");

  const handleOpenShift = () => {
    const value = Math.max(0, parseFloat(openingFloat) || 0);
    openMut.mutate(value, {
      onSuccess: onClose,
      onError: () => alert(t("cash.errorGeneric")),
    });
  };

  return (
    <ShiftModal onClose={onClose} title={t("cash.openShift")}>
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
          isLoading={openMut.isPending}
          onClick={handleOpenShift}
        >
          {t("cash.openShiftButton")}
        </Button>
      </div>
    </ShiftModal>
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
  const closeMut = useCloseShift();
  const [breakdown, setBreakdown] = useState<CountedBreakdown>({});
  const [closingNote, setClosingNote] = useState("");

  const countedTotal = denominationTotal(breakdown);
  const balanced = countedTotal === shift.expected_cash;

  const handleCloseShift = () => {
    if (!confirm(t("cash.confirmClose"))) return;
    closeMut.mutate(
      { countedCash: countedTotal, countedBreakdown: breakdown, note: closingNote.trim() || null },
      {
        onSuccess: onClose,
        onError: () => alert(t("cash.errorGeneric")),
      }
    );
  };

  return (
    <ShiftModal onClose={onClose} title={t("cash.closeShiftTitle")} wide>
      <div className="space-y-5">
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
            {countedTotal - shift.expected_cash > 0 ? "+" : ""}
            {formatMoney(countedTotal - shift.expected_cash, "CRC")}
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
          onClick={handleCloseShift}
        >
          {t("cash.closeShiftButton")}
        </Button>
      </div>
    </ShiftModal>
  );
}
