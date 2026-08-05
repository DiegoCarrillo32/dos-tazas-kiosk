"use client";

import { CRC_DENOMINATIONS, type CountedBreakdown } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { Input } from "@/components/ui/Input";

const NOTES = CRC_DENOMINATIONS.filter((d) => d >= 1000);
const COINS = CRC_DENOMINATIONS.filter((d) => d < 1000);

/**
 * Denomination counter for closing the cash drawer.
 *
 * Rather than asking staff to key one total (error-prone mental
 * arithmetic), this counts every CRC note and coin and sums them — faster
 * at close, and a variance afterwards points at a real discrepancy
 * instead of a typo. The breakdown is stored on the shift so a short
 * drawer can be investigated later.
 */
export function DenominationCounter({
  breakdown,
  onChange,
}: {
  breakdown: CountedBreakdown;
  onChange: (next: CountedBreakdown) => void;
}) {
  const t = useT();

  const setCount = (denom: number, qty: string) => {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    onChange({ ...breakdown, [denom]: n });
  };

  const total = CRC_DENOMINATIONS.reduce(
    (sum, d) => sum + d * (breakdown[String(d)] ?? 0),
    0
  );

  const row = (denom: number) => {
    const qty = breakdown[String(denom)] ?? 0;
    return (
      <div key={denom} className="flex items-center gap-3">
        <span className="w-16 md:w-20 shrink-0 text-sm font-medium text-expresso tabular-nums">
          {formatMoney(denom, "CRC")}
        </span>
        <span className="text-expresso/40">×</span>
        <div className="w-20 shrink-0">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={qty || ""}
            onChange={(e) => setCount(denom, e.target.value)}
            placeholder="0"
            className="text-center px-2"
          />
        </div>
        <span className="flex-1 text-right text-sm text-expresso/60 tabular-nums">
          {qty > 0 ? formatMoney(denom * qty, "CRC") : ""}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Notes and coins sit side by side from `md` — halves the scroll
          inside CloseShiftDialog's now-wider (`size="xl"`) panel. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <h4 className="text-xs font-semibold text-expresso/60 uppercase tracking-wider mb-2">
            {t("cash.denominationNotes")}
          </h4>
          <div className="space-y-2">{NOTES.map(row)}</div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-expresso/60 uppercase tracking-wider mb-2">
            {t("cash.denominationCoins")}
          </h4>
          <div className="space-y-2">{COINS.map(row)}</div>
        </div>
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-warm-roast/10 font-bold text-expresso">
        <span>{t("cash.countedTotal")}</span>
        <span className="text-lg tabular-nums">{formatMoney(total, "CRC")}</span>
      </div>
    </div>
  );
}

export function denominationTotal(breakdown: CountedBreakdown): number {
  return CRC_DENOMINATIONS.reduce(
    (sum, d) => sum + d * (breakdown[String(d)] ?? 0),
    0
  );
}
