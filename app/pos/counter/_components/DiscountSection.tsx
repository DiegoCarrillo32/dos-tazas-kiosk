"use client";

import { Minus, Plus } from "lucide-react";
import type { DiscountType, OrderItem } from "@/lib/types";
import type { DiscountScope } from "../_hooks/useCheckoutState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * One-tap discount reasons, covering what actually recurs at the counter.
 * `discountReasonLoyaltyClub` leads because a redeemed club reward is the
 * one discount that arrives with paperwork behind it (the loyalty app's
 * ledger); `discountReasonLoyalty` — "regular customer" — stays separate
 * so reporting can tell a redeemed reward from barista goodwill.
 */
const DISCOUNT_REASON_KEYS = [
  "discountReasonLoyaltyClub",
  "discountReasonStaff",
  "discountReasonFriends",
  "discountReasonLoyalty",
  "discountReasonServiceIssue",
  "discountReasonComp",
] as const;

const chipClass = (active: boolean) =>
  cn(
    "px-4 min-h-[44px] text-sm rounded-lg transition-colors",
    active
      ? "bg-coffee-fruit text-white"
      : "bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20"
  );

export function DiscountSection({
  discountType,
  discountValue,
  discountReason,
  discountExceedsTotal,
  discountAmount,
  discountScope,
  discountItems,
  items,
  itemPickerDisabled,
  noItemsSelected,
  baseGross,
  baseUnits,
  currency,
  currencySymbol,
  onTypeChange,
  onValueChange,
  onReasonChange,
  onScopeChange,
  onToggleItem,
  onItemQtyChange,
  onClear,
}: {
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
  discountExceedsTotal: boolean;
  discountAmount: number;
  discountScope: DiscountScope;
  discountItems: Record<string, number>;
  items: OrderItem[];
  /** Offline, or an order that has not reached the server: no line to point at. */
  itemPickerDisabled: boolean;
  noItemsSelected: boolean;
  baseGross: number;
  baseUnits: number;
  currency: string;
  currencySymbol: string;
  onTypeChange: (type: DiscountType) => void;
  onValueChange: (value: string) => void;
  onReasonChange: (reason: string) => void;
  onScopeChange: (scope: DiscountScope) => void;
  onToggleItem: (orderItemId: string, quantity: number) => void;
  onItemQtyChange: (orderItemId: string, quantity: number) => void;
  onClear: () => void;
}) {
  const t = useT();
  const itemsMode = discountScope === "items";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-expresso/70 uppercase tracking-wider">
        {t("counter.discount")}
      </h3>

      {/* What the discount comes off: the whole tab, or named lines. A
          loyalty club free coffee is the second — comping a drink must not
          take money off the sandwich beside it. */}
      <div className="inline-flex rounded-lg border border-warm-roast/20 overflow-hidden">
        {(["order", "items"] as DiscountScope[]).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => onScopeChange(scope)}
            disabled={scope === "items" && itemPickerDisabled}
            className={cn(
              "px-4 min-h-[44px] text-sm font-medium transition-colors disabled:opacity-40",
              discountScope === scope
                ? "bg-warm-roast text-white"
                : "bg-card text-expresso/70 hover:bg-warm-roast/10"
            )}
          >
            {scope === "order" ? t("counter.discountScopeOrder") : t("counter.discountScopeItems")}
          </button>
        ))}
      </div>

      {itemPickerDisabled && (
        <p className="text-xs text-expresso/50">{t("counter.discountItemsOffline")}</p>
      )}

      {itemsMode && (
        <div className="bg-card p-3 rounded-xl border border-warm-roast/10 space-y-2">
          <Label className="block">{t("counter.discountPickItems")}</Label>
          {items.map((item) => {
            const selectedQty = discountItems[item.id];
            const selected = selectedQty != null;
            const lineQty = Math.max(1, item.quantity);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2 transition-colors",
                  selected
                    ? "border-coffee-fruit bg-coffee-fruit/5"
                    : "border-warm-roast/10 bg-transparent"
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleItem(item.id, lineQty)}
                  className="flex-1 min-w-0 text-left min-h-[44px] flex flex-col justify-center"
                >
                  <span
                    className={cn(
                      "text-sm truncate",
                      selected ? "text-expresso font-medium" : "text-expresso/70"
                    )}
                  >
                    {item.quantity}× {item.menu_item?.name ?? "Item"}
                  </span>
                  {(item.modifiers ?? []).length > 0 && (
                    <span className="text-xs text-expresso/40 truncate">
                      {(item.modifiers ?? []).map((m) => m.name).join(", ")}
                    </span>
                  )}
                </button>

                {/* Only a multi-unit line needs a stepper: one free coffee
                    out of two on the same line is the common club case. */}
                {selected && lineQty > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="-1"
                      onClick={() => onItemQtyChange(item.id, Math.max(1, selectedQty - 1))}
                      disabled={selectedQty <= 1}
                      className="h-10 w-10 rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 disabled:opacity-30 flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-expresso tabular-nums">
                      {selectedQty}
                    </span>
                    <button
                      type="button"
                      aria-label="+1"
                      onClick={() => onItemQtyChange(item.id, Math.min(lineQty, selectedQty + 1))}
                      disabled={selectedQty >= lineQty}
                      className="h-10 w-10 rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 disabled:opacity-30 flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <span className="text-sm text-expresso/80 shrink-0 tabular-nums">
                  {formatMoney(Number(item.total_price), currency)}
                </span>
              </div>
            );
          })}

          {baseUnits > 0 && (
            <p className="text-sm text-expresso/70 pt-1">
              {t("counter.discountBaseLabel", { amount: formatMoney(baseGross, currency) })}
              {" · "}
              {t("counter.discountBaseUnits", { count: baseUnits })}
            </p>
          )}
        </div>
      )}

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
              className={chipClass(active)}
            >
              {pct}%
            </button>
          );
        })}
        {/* The redeemed-reward case: pick the drink, tap Gratis, done. */}
        <button
          type="button"
          onClick={() => {
            onTypeChange("percent");
            onValueChange("100");
          }}
          className={chipClass(discountType === "percent" && discountValue === "100")}
        >
          {t("counter.discountFree")}
        </button>
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

      {/* With nothing selected the base is zero, so an over-base warning
          would fire alongside the more useful "pick an item" one. */}
      {discountExceedsTotal && !noItemsSelected && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {itemsMode ? t("counter.alertDiscountTooLargeItems") : t("counter.alertDiscountTooLarge")}
        </p>
      )}

      {noItemsSelected && (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          {t("counter.alertDiscountNoItems")}
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
