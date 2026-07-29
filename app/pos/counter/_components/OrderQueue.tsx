"use client";

import { Loader2, RefreshCw, Search } from "lucide-react";
import type { OrderItem } from "@/lib/types";
import type { QueueOrder } from "@/lib/offline/useMergedParkedOrders";
import { Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/** The left-hand parked-orders list: search, live/pending badges, order cards. */
export function OrderQueue({
  orders,
  filteredOrders,
  isLoading,
  isRefetching,
  refetch,
  live,
  pendingCount,
  failedCount,
  searchQuery,
  onSearchChange,
  selectedOrderId,
  onSelectOrder,
  currency,
}: {
  orders: QueueOrder[];
  filteredOrders: QueueOrder[];
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => void;
  live: boolean;
  pendingCount: number;
  failedCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedOrderId: string | null;
  onSelectOrder: (order: QueueOrder) => void;
  currency: string;
}) {
  const t = useT();

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const itemLabel = (count: number) => (count === 1 ? t("common.item") : t("common.items"));

  return (
    <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-warm-roast/10 bg-card flex flex-col h-[40vh] lg:h-full shrink-0">
      <div className="p-4 border-b border-warm-roast/10 flex items-center justify-between shrink-0">
        <h2 className="font-bold text-lg text-expresso flex items-center gap-2">
          {t("counter.parkedOrders")}
          {orders.length > 0 && <span className="text-sm font-normal text-expresso/60">({orders.length})</span>}
          <span
            title={live ? t("counter.live") : t("counter.reconnecting")}
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${live ? "text-green-600 dark:text-green-400" : "text-expresso/40"}`}
          >
            <span className={`w-2 h-2 rounded-full ${live ? "bg-green-500 animate-pulse" : "bg-expresso/30"}`} />
            {live ? t("counter.live") : "…"}
          </span>
          {(pendingCount > 0 || failedCount > 0) && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                failedCount > 0
                  ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              }`}
            >
              {failedCount > 0 ? failedCount : pendingCount}
            </span>
          )}
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          title={t("counter.refresh")}
          className="p-2 text-expresso/60 hover:text-expresso bg-warm-roast/10 hover:bg-warm-roast/20 rounded-md transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-4 border-b border-warm-roast/10 shrink-0">
        <div className="relative">
          <Input
            type="text"
            icon={<Search className="w-4 h-4" />}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("counter.searchPlaceholder")}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/40">
        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-expresso/40" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center text-expresso/60 py-8">
            {searchQuery ? t("counter.noMatchingOrders") : t("counter.noParkedOrders")}
          </div>
        ) : (
          filteredOrders.map((order) => {
            const itemCount = (order.order_items ?? []).reduce((s, i: OrderItem) => s + i.quantity, 0);
            return (
              <button
                key={order.id}
                onClick={() => onSelectOrder(order)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedOrderId === order.id
                    ? "bg-card border-coffee-fruit shadow-md ring-1 ring-coffee-fruit"
                    : "bg-card border-warm-roast/10 hover:border-warm-roast/40 shadow-sm"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono font-semibold text-sm text-expresso flex items-center gap-1.5">
                    {order.__local
                      ? order.__local.offlineRef
                      : order.order_number
                        ? `#${order.order_number}`
                        : `${order.id.slice(0, 8)}…`}
                    {order.__local && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                          order.__local.status === "failed"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {order.__local.status === "failed" ? t("offline.stateFailed") : t("offline.statePending")}
                      </span>
                    )}
                    {order.__payPending && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {t("offline.statePending")}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-expresso">
                    {formatMoney(Number(order.total_amount), currency)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-expresso/60">
                  <span>
                    {order.table?.name ?? t("common.takeaway")} · {itemCount} {itemLabel(itemCount)}
                  </span>
                  <span>{formatTime(order.created_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
