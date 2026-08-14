"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { Search, Eye, Printer, RotateCcw } from "lucide-react";
import type { Order, OrderItem } from "@/lib/types";
import {
  useCompletedOrders,
  useLocationSettings,
  useCurrentProfile,
  useRefundOrder,
  useOfflineSyncFlags,
} from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Feedback";
import { Receipt } from "@/components/Receipt";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { usePagination } from "@/lib/usePagination";
import { Skeleton } from "@/components/ui/Skeleton";

export default function TransactionHistory() {
  const t = useT();
  const toast = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  const { data: history = [], isLoading } = useCompletedOrders(startStr, endStr);
  const { data: syncFlags = [] } = useOfflineSyncFlags();
  const { data: settings } = useLocationSettings();
  const { data: currentUser } = useCurrentProfile();
  const isAdmin = currentUser?.role === "admin";
  const refundMut = useRefundOrder();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const filtered = history.filter((o) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const orderNumberMatch = o.order_number != null && String(o.order_number).includes(q);
    return orderNumberMatch || o.id.toLowerCase().includes(q);
  });

  const pg = usePagination(filtered, { resetKey: `${searchQuery}|${startStr}|${endStr}` });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const handleRefund = (order: Order) => {
    setRefundReason("");
    setRefundingOrder(order);
  };

  const submitRefund = () => {
    if (!refundingOrder) return;
    refundMut.mutate(
      { orderId: refundingOrder.id, reason: refundReason.trim() || null },
      {
        onSuccess: () => {
          setRefundingOrder(null);
          setSelectedOrder(null);
        },
        onError: () => toast(t("history.alertFailedRefund")),
      }
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("history.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("history.subtitle")}</p>
      </div>

      {syncFlags.length > 0 && (
        <div className="bg-card rounded-2xl border border-amber-200 dark:border-amber-900/40 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-4 border-b border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30">
            <h2 className="font-bold text-expresso">{t("history.offlineSyncTitle")}</h2>
            <p className="text-sm text-expresso/60 mt-0.5">{t("history.offlineSyncSubtitle")}</p>
          </div>
          <div className="divide-y divide-warm-roast/10">
            {syncFlags.map((order) => {
              const discrepancy = Number(order.sync_discrepancy ?? 0);
              const warningCount = order.sync_warnings?.length ?? 0;
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left px-4 sm:px-6 min-h-[44px] py-3 flex items-center justify-between gap-4 hover:bg-warm-roast/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-semibold text-sm text-expresso shrink-0">
                      {order.order_number ? `#${order.order_number}` : order.offline_ref}
                    </span>
                    <span className="text-sm text-expresso/60 truncate">
                      {discrepancy !== 0 &&
                        t("history.offlineSyncDiscrepancy", {
                          charged: formatMoney(order.total_amount, "CRC"),
                          server: formatMoney(order.server_total_amount ?? order.total_amount, "CRC"),
                        })}
                      {discrepancy !== 0 && warningCount > 0 && " · "}
                      {warningCount > 0 && t("history.offlineSyncWarnings", { n: warningCount })}
                    </span>
                  </div>
                  <span className="text-xs text-expresso/40 shrink-0">{formatDate(order.created_at)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-expresso/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("history.searchByOrderNumber")}
            className="w-full h-11 pl-9 pr-4 bg-card border border-warm-roast/10 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-coffee-fruit shadow-sm"
          />
        </div>
        <DatePicker date={startDate} setDate={setStartDate} placeholder={t("history.startDate")} className="w-full sm:w-44" />
        <DatePicker date={endDate} setDate={setEndDate} placeholder={t("history.endDate")} className="w-full sm:w-44" />
      </div>

      {selectedOrder && (
        <Modal
          onClose={() => setSelectedOrder(null)}
          title={`${t("history.orderDetail")}${selectedOrder.order_number ?? selectedOrder.id.slice(0, 8)}`}
          size="lg"
        >
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-expresso/60">{t("history.date")}</span><span className="font-medium text-expresso">{formatDate(selectedOrder.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-expresso/60">{t("history.table")}</span><span className="text-expresso">{selectedOrder.table?.name ?? t("common.takeaway")}</span></div>
              <div className="flex justify-between">
                <span className="text-expresso/60">{t("history.colStatus")}</span>
                <span className={selectedOrder.status === "refunded" ? "text-red-600 dark:text-red-400 font-medium" : "text-expresso"}>
                  {selectedOrder.status === "refunded" ? t("history.statusRefunded") : t("history.statusCompleted")}
                </span>
              </div>
              {Number(selectedOrder.discount_amount) > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-expresso/60">{t("history.discount")}</span>
                  <span className="text-right text-coffee-fruit font-medium">
                    -{formatMoney(selectedOrder.discount_amount, "CRC")}
                    {selectedOrder.discount_reason && (
                      <span className="block text-xs font-normal text-expresso/60">
                        {selectedOrder.discount_reason}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3"><span className="text-expresso/60">{t("history.total")}</span><span className="font-bold text-expresso">{formatMoney(selectedOrder.total_amount, "CRC")}</span></div>
              <div className="flex justify-between gap-3"><span className="text-expresso/60">{t("history.payment")}</span><span className="text-expresso">{selectedOrder.payment_method?.toUpperCase() ?? "—"}</span></div>
              {selectedOrder.payment_reference && (<div className="flex justify-between gap-3"><span className="text-expresso/60 shrink-0">{t("history.reference")}</span><span className="text-expresso text-right break-all">{selectedOrder.payment_reference}</span></div>)}
              {selectedOrder.customer_name && (
                <>
                  <div className="border-t border-warm-roast/10 pt-3 mt-3"><h4 className="font-semibold text-expresso/60 uppercase tracking-wider text-xs mb-2">{t("history.invoiceInfo")}</h4></div>
                  <div className="flex justify-between gap-3"><span className="text-expresso/60 shrink-0">{t("history.name")}</span><span className="text-right">{selectedOrder.customer_name}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-expresso/60 shrink-0">{t("history.cedula")}</span><span className="text-right">{selectedOrder.customer_id}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-expresso/60 shrink-0">{t("history.email")}</span><span className="text-right break-all">{selectedOrder.customer_email}</span></div>
                </>
              )}
              <div className="border-t border-warm-roast/10 pt-3 mt-3">
                <h4 className="font-semibold text-expresso/60 uppercase tracking-wider text-xs mb-2">{t("history.items")}</h4>
                <div className="space-y-2">
                  {(selectedOrder.order_items ?? []).map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between">
                      <span>{item.quantity}× {item.menu_item?.name ?? "Item"}</span>
                      <span>{formatMoney(item.total_price, "CRC")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-warm-roast/10 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setReceiptOrder(selectedOrder)}
                leftIcon={<Printer className="w-4 h-4" />}
                className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
              >
                {t("history.printReceipt")}
              </Button>
              {isAdmin && selectedOrder.status === "completed" && (
                <Button
                  variant="secondary"
                  onClick={() => handleRefund(selectedOrder)}
                  isLoading={refundMut.isPending}
                  leftIcon={!refundMut.isPending && <RotateCcw className="w-4 h-4" />}
                  className="flex-1 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  {t("history.refund")}
                </Button>
              )}
            </div>
        </Modal>
      )}

      {refundingOrder && (
        <Modal onClose={() => setRefundingOrder(null)} title={t("history.refund")}>
          <div className="space-y-4">
            <p className="text-sm text-expresso/70">
              {t("history.confirmRefund", {
                id: String(refundingOrder.order_number ?? refundingOrder.id.slice(0, 8)),
              })}
            </p>
            <div>
              <Label className="mb-1 block">{t("history.refundReason")}</Label>
              <Input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRefundingOrder(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
                onClick={submitRefund}
                isLoading={refundMut.isPending}
              >
                {t("history.refund")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {receiptOrder && (
        <Receipt
          order={receiptOrder}
          settings={settings ?? null}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      <div className="bg-card rounded-2xl border border-warm-roast/10 overflow-hidden shadow-sm">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-max whitespace-nowrap text-left border-collapse">
            <thead>
              <tr className="border-b border-warm-roast/10 bg-muted/40">
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colOrderId")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colDateTime")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colItems")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colTotal")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colPayment")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso">{t("history.colStatus")}</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-semibold text-expresso text-right">{t("history.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, r) => (
                  <tr key={r}>
                    {Array.from({ length: 7 }).map((_, c) => (
                      <td key={c} className="px-4 sm:px-6 py-4">
                        <Skeleton className={c === 0 ? "h-4 w-24" : "h-4 w-16"} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pg.pageRows.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center whitespace-normal text-expresso/40 text-sm">{searchQuery ? t("history.noMatching") : t("history.noOrders")}</td></tr>
              ) : (
                pg.pageRows.map((order) => {
                  const itemCount = (order.order_items ?? []).reduce((s: number, i: OrderItem) => s + i.quantity, 0);
                  return (
                    <tr key={order.id} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-mono font-medium text-expresso">
                        {order.order_number ? `#${order.order_number}` : `${order.id.slice(0, 8)}…`}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">{formatDate(order.created_at)}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">{itemCount}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium text-expresso">{formatMoney(order.total_amount, "CRC")}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm text-expresso/60">{order.payment_method?.toUpperCase() ?? "—"}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-sm">
                        {order.status === "refunded" ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">{t("history.statusRefunded")}</span>
                        ) : (
                          <span className="text-expresso/60">{t("history.statusCompleted")}</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                        <button onClick={() => setSelectedOrder(order)} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/40 hover:text-expresso transition-colors"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg} />
      </div>
    </div>
  );
}
