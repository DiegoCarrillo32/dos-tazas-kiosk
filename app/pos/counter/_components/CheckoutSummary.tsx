"use client";

import type { OrderItem } from "@/lib/types";
import type { QueueOrder } from "@/lib/offline/useMergedParkedOrders";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/** The order's line items and the money breakdown (discount/subtotal/IVA/tip/total). */
export function CheckoutSummary({
  order,
  totalDue,
  discountAmount,
  discountReason,
  discountedItems,
  grossBeforeDiscount,
  netDue,
  taxDue,
  taxRatePct,
  tipAmount,
  currency,
}: {
  order: QueueOrder;
  totalDue: number;
  discountAmount: number;
  discountReason: string;
  /** order_item id → units covered, when the discount targets named lines. */
  discountedItems: Record<string, number>;
  grossBeforeDiscount: number;
  netDue: number;
  taxDue: number;
  taxRatePct: number;
  tipAmount: number;
  currency: string;
}) {
  const t = useT();
  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-expresso">
            {t("counter.order")}{" "}
            {order.__local
              ? order.__local.offlineRef
              : order.order_number
                ? `#${order.order_number}`
                : `#${order.id.slice(0, 8)}`}
          </h2>
          <p className="text-expresso/60 text-sm">
            {order.table?.name ?? t("common.takeaway")} · {formatTime(order.created_at)}
            {order.__payPending && (
              <span className="ml-2 text-amber-700 dark:text-amber-400 font-medium">
                · {t("offline.statePending")}
              </span>
            )}
          </p>
        </div>
        <div className="text-3xl font-black text-expresso">
          {formatMoney(totalDue, currency)}
        </div>
      </div>
      <div className="space-y-2 border-t border-warm-roast/10 pt-4">
        {(order.order_items ?? []).map((item: OrderItem) => (
          <div key={item.id} className="flex justify-between items-start text-sm">
            <div>
              <span className="text-expresso font-medium">
                {item.quantity}× {item.menu_item?.name ?? "Item"}
              </span>
              {/* Which lines the discount is actually coming off — without
                  this the breakdown shows a figure with no explanation of
                  where it landed. */}
              {discountedItems[item.id] != null && (
                <span className="ml-2 align-middle text-[11px] font-medium text-coffee-fruit bg-coffee-fruit/10 rounded px-1.5 py-0.5">
                  {t("counter.discountLineBadge", { count: discountedItems[item.id] })}
                </span>
              )}
              {(item.modifiers ?? []).length > 0 && (
                <p className="text-xs text-expresso/40 mt-0.5">
                  {(item.modifiers ?? []).map((m) => m.name).join(", ")}
                </p>
              )}
              {item.notes && (
                <p className="text-xs font-medium text-coffee-fruit mt-0.5">{item.notes}</p>
              )}
            </div>
            <span className="text-expresso/80">{formatMoney(Number(item.total_price), currency)}</span>
          </div>
        ))}
      </div>
      {/* Money breakdown */}
      <div className="space-y-1.5 border-t border-warm-roast/10 mt-4 pt-4 text-sm">
        {discountAmount > 0 && (
          <>
            {/* With a discount the breakdown starts from the list price of
                the lines above, so the customer can see what came off
                before IVA is restated. */}
            <div className="flex justify-between text-expresso/70">
              <span>{t("counter.itemsTotal")}</span>
              <span>{formatMoney(grossBeforeDiscount, currency)}</span>
            </div>
            <div className="flex justify-between text-coffee-fruit font-medium">
              <span>
                {t("counter.discount")}
                {discountReason.trim() && (
                  <span className="text-expresso/50 font-normal">
                    {" "}· {discountReason.trim()}
                  </span>
                )}
              </span>
              <span>-{formatMoney(discountAmount, currency)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-expresso/70">
          <span>{t("counter.subtotal")}</span>
          <span>{formatMoney(netDue, currency)}</span>
        </div>
        <div className="flex justify-between text-expresso/70">
          <span>IVA ({taxRatePct}%)</span>
          <span>{formatMoney(taxDue, currency)}</span>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between text-expresso/70">
            <span>{t("counter.tip")}</span>
            <span>{formatMoney(tipAmount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-expresso pt-1.5 border-t border-warm-roast/10 mt-1.5">
          <span>{t("floor.total")}</span>
          <span>{formatMoney(totalDue, currency)}</span>
        </div>
      </div>
    </div>
  );
}
