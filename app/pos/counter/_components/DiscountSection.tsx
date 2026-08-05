"use client";

import type { DiscountType } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/** One-tap discount reasons, covering what actually recurs at the counter. */
const DISCOUNT_REASON_KEYS = [
  "discountReasonStaff",
  "discountReasonFriends",
  "discountReasonLoyalty",
  "discountReasonServiceIssue",
  "discountReasonComp",
] as const;

export function DiscountSection({
  discountType,
  discountValue,
  discountReason,
  discountExceedsTotal,
  discountAmount,
  currencySymbol,
  onTypeChange,
  onValueChange,
  onReasonChange,
  onClear,
}: {
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
  discountExceedsTotal: boolean;
  discountAmount: number;
  currencySymbol: string;
  onTypeChange: (type: DiscountType) => void;
  onValueChange: (value: string) => void;
  onReasonChange: (reason: string) => void;
  onClear: () => void;
}) {
  const t = useT();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-expresso/70 uppercase tracking-wider">
        {t("counter.discount")}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {[10, 15, 20].map((pct) => {
          const active = discountType === "percent" && discountValue === String(pct);
          return (
            <button
              key={pct}
              type="button"
              onClick={() => {
                onTypeChange("percent");
                onValueChange(String(pct));
              }}
              className={cn(
                "px-4 min-h-[44px] text-sm rounded-lg transition-colors",
                active
                  ? "bg-coffee-fruit text-white"
                  : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
              )}
            >
              {pct}%
            </button>
          );
        })}
        <button
          type="button"
          onClick={onClear}
          className="px-4 min-h-[44px] text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
        >
          {t("counter.discountNone")}
        </button>
        <div className="inline-flex rounded-lg border border-warm-roast/20 overflow-hidden">
          {(["percent", "amount"] as DiscountType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onTypeChange(type)}
              title={type === "percent" ? t("counter.discountPercent") : t("counter.discountCustom")}
              className={cn(
                "px-4 min-h-[44px] text-sm font-medium transition-colors",
                discountType === type
                  ? "bg-warm-roast text-white"
                  : "bg-card text-expresso/70 hover:bg-warm-roast/10"
              )}
            >
              {type === "percent" ? "%" : currencySymbol}
            </button>
          ))}
        </div>
        <Input
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          value={discountValue}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={discountType === "percent" ? t("counter.discountPercent") : t("counter.discountCustom")}
          className="w-32"
        />
      </div>

      {discountExceedsTotal && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {t("counter.alertDiscountTooLarge")}
        </p>
      )}

      {/* A discount without an attributable reason is indistinguishable
          from money walking out the door, so the reason is required here
          and again server-side. */}
      {discountAmount > 0 && (
        <div className="bg-card p-4 rounded-xl border border-warm-roast/10 space-y-3">
          <Label className="block">{t("counter.discountReason")}</Label>
          <div className="flex flex-wrap gap-2">
            {DISCOUNT_REASON_KEYS.map((key) => {
              const label = t(`counter.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onReasonChange(label)}
                  className={cn(
                    "px-3 min-h-[44px] text-sm rounded-lg transition-colors",
                    discountReason.trim() === label
                      ? "bg-coffee-fruit text-white"
                      : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Input
            type="text"
            value={discountReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={t("counter.discountReasonPlaceholder")}
          />
        </div>
      )}
    </div>
  );
}
