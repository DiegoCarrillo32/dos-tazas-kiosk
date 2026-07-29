"use client";

import { useState } from "react";
import {
  RefreshCw,
  Search,
  CreditCard,
  BanknoteIcon as Banknote,
  Smartphone,
  Receipt,
  CheckCircle2,
  Loader2,
  Ban,
  Wallet,
  AlertTriangle,
  Lock,
} from "lucide-react";
import type { DiscountType, Order, OrderItem, PaymentMethod } from "@/lib/types";
import {
  useCompleteOrder,
  useVoidOrder,
  useLocationSettings,
  useOrdersRealtime,
  useCurrentShift,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Receipt as ReceiptView } from "@/components/Receipt";
import { OpenShiftDialog, CloseShiftDialog } from "@/components/ShiftDialogs";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { priceCheckout, changeDue as computeChangeDue, toClientCharge } from "@/lib/pricing";
import { useConnectionStatus } from "@/lib/offline/useConnectionStatus";
import { useMergedParkedOrders, type QueueOrder } from "@/lib/offline/useMergedParkedOrders";
import { attachPayment, discardLocalEntry, enqueuePaymentForServerOrder } from "@/lib/offline/outbox";
import { isNetworkError } from "@/lib/offline/sync";
import type { OfflineOrderSnapshot, OfflinePaymentPayload } from "@/lib/offline/types";

/**
 * One-tap discount reasons, covering what actually recurs at the counter.
 * The free-text field below them stays editable for anything else.
 */
const DISCOUNT_REASON_KEYS = [
  "discountReasonStaff",
  "discountReasonFriends",
  "discountReasonLoyalty",
  "discountReasonServiceIssue",
  "discountReasonComp",
] as const;

export default function CounterView() {
  const t = useT();
  const { orders, isLoading, refetch, isRefetching, pendingCount, failedCount } = useMergedParkedOrders();
  const { data: settings } = useLocationSettings();
  const { data: shift } = useCurrentShift();
  const live = useOrdersRealtime();
  const conn = useConnectionStatus();
  const completeOrderMut = useCompleteOrder();
  const voidOrderMut = useVoidOrder();

  const [selectedOrder, setSelectedOrder] = useState<QueueOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [sinpeRef, setSinpeRef] = useState("");
  const [tip, setTip] = useState("");
  const [tendered, setTendered] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptProvisional, setReceiptProvisional] = useState<{ offlineRef: string } | null>(null);
  const [isQueueingPayment, setIsQueueingPayment] = useState(false);

  // Shift open/close is a till action, so staff drive it from here rather
  // than the admin-only Cash Drawer page.
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);

  // Invoice form
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const orderNumberMatch =
      o.order_number != null &&
      (String(o.order_number).includes(q) || `#${o.order_number}`.includes(q));
    return orderNumberMatch || o.id.toLowerCase().includes(q);
  });

  const currentSelected = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  const subtotal =
    Number(currentSelected?.subtotal ?? 0) ||
    Number(currentSelected?.total_amount ?? 0);
  const taxAmount = Number(currentSelected?.tax_amount ?? 0);
  const taxRatePct = Math.round(
    Number(currentSelected?.tax_rate ?? settings?.tax_rate ?? 0.13) * 100
  );
  const currency = settings?.currency ?? "CRC";
  const currencySymbol = currency === "CRC" ? "₡" : "$";
  const tipEnabled = settings?.tip_enabled ?? false;
  const tipAmount = Math.max(0, parseFloat(tip) || 0);

  // The math below mirrors complete_order's arithmetic exactly (see
  // lib/pricing.ts for the shared implementation and the SQL line
  // references) — the server is what actually charges, so any drift here
  // would quote the customer a total the till never takes.
  const discountInput = Math.max(0, parseFloat(discountValue) || 0);
  const grossBeforeDiscount = subtotal + taxAmount;
  const math = priceCheckout({
    gross: grossBeforeDiscount,
    tax: taxAmount,
    discountType,
    discountValue: discountInput,
    tip: tipAmount,
  });
  const {
    discountAmount,
    subtotal: netDue,
    taxAmount: taxDue,
    preTipTotal,
    totalAmount: totalDue,
    discountExceedsGross: discountExceedsTotal,
  } = math;
  const discountReasonMissing = discountAmount > 0 && !discountReason.trim();
  const tenderedAmount = parseFloat(tendered) || 0;
  const changeDue = computeChangeDue(totalDue, tenderedAmount);

  // complete_order refuses payment outside an open shift, so without the
  // `shift` guard the cashier taps Complete and gets a raw, untranslated
  // Postgres error. The banner above already offers the one-tap fix.
  // A __payPending order already has a queued payment (another device, or
  // this one before reconnecting) — paying it again would double-charge.
  const canCompleteCheckout =
    !!shift &&
    !!paymentMethod &&
    !discountExceedsTotal &&
    !discountReasonMissing &&
    !currentSelected?.__payPending &&
    !(paymentMethod === "cash" && tenderedAmount < totalDue);

  const clearDiscount = () => {
    setDiscountValue("");
    setDiscountReason("");
  };

  const resetCheckout = () => {
    setSelectedOrder(null);
    setPaymentMethod(null);
    setSinpeRef("");
    setTip("");
    setTendered("");
    setVoidReason("");
    clearDiscount();
    setNeedsInvoice(false);
    setInvoiceName("");
    setInvoiceId("");
    setInvoiceEmail("");
  };

  function buildOfflinePayment(): OfflinePaymentPayload {
    return {
      payment_method: paymentMethod as PaymentMethod,
      payment_reference: paymentMethod === "sinpe" ? sinpeRef : null,
      tip_amount: tipAmount,
      amount_tendered: paymentMethod === "cash" ? tenderedAmount : null,
      customer_name: needsInvoice ? invoiceName : null,
      customer_id: needsInvoice ? invoiceId : null,
      customer_email: needsInvoice ? invoiceEmail : null,
      // Send what was keyed, not the computed figure — the same reasoning
      // as the online path below: the server derives the amount itself.
      discount_type: discountAmount > 0 ? discountType : null,
      discount_value:
        discountAmount > 0
          ? discountType === "percent"
            ? Math.min(discountInput, 100)
            : discountInput
          : 0,
      discount_reason: discountAmount > 0 ? discountReason.trim() : null,
    };
  }

  function buildSnapshotFromOrder(order: QueueOrder): OfflineOrderSnapshot {
    return {
      offlineRef: "", // overwritten by enqueuePaymentForServerOrder with this entry's own ref
      tableName: order.table?.name ?? null,
      itemCount: (order.order_items ?? []).reduce((s, i) => s + i.quantity, 0),
      lines: (order.order_items ?? []).map((i) => ({
        name: i.menu_item?.name ?? "Item",
        quantity: i.quantity,
        modifiers: (i.modifiers ?? []).map((m) => m.name),
      })),
      totalAmount: Number(order.total_amount),
      currency,
    };
  }

  const handleCompleteOrder = () => {
    if (!currentSelected || !paymentMethod) return;
    if (paymentMethod === "sinpe" && !sinpeRef) {
      alert(t("counter.alertSinpeRef"));
      return;
    }
    if (paymentMethod === "cash" && tenderedAmount < totalDue) {
      alert(t("counter.alertInsufficientTendered"));
      return;
    }
    if (needsInvoice && (!invoiceName || !invoiceId || !invoiceEmail)) {
      alert(t("counter.alertInvoiceRequired"));
      return;
    }
    if (discountExceedsTotal) {
      alert(t("counter.alertDiscountTooLarge"));
      return;
    }
    if (discountReasonMissing) {
      alert(t("counter.alertDiscountReason"));
      return;
    }
    if (currentSelected.__payPending) return; // button is disabled; belt & braces

    const completed: Order = {
      ...currentSelected,
      status: "completed",
      payment_method: paymentMethod,
      payment_reference: paymentMethod === "sinpe" ? sinpeRef : null,
      subtotal: netDue,
      tax_amount: taxDue,
      discount_amount: discountAmount,
      discount_reason: discountAmount > 0 ? discountReason.trim() : null,
      tip_amount: tipAmount,
      total_amount: totalDue,
      amount_tendered: paymentMethod === "cash" ? tenderedAmount : null,
      change_due: paymentMethod === "cash" ? changeDue : null,
      customer_name: needsInvoice ? invoiceName : null,
      customer_id: needsInvoice ? invoiceId : null,
      customer_email: needsInvoice ? invoiceEmail : null,
    };

    // A not-yet-synced local order (parked while offline): promote its
    // existing outbox entry in place rather than queuing a second one —
    // same client_uuid, so it's still exactly one eventual server order.
    if (currentSelected.__local) {
      const payment = buildOfflinePayment();
      const clientCharge = toClientCharge(math, paymentMethod === "cash" ? tenderedAmount : null);
      setIsQueueingPayment(true);
      attachPayment(currentSelected.__local.entryId, payment, clientCharge, shift?.shift_id ?? null)
        .then((updated) => {
          if (!updated) {
            alert(t("counter.alertFailedComplete"));
            return;
          }
          resetCheckout();
          setReceiptOrder(completed);
          setReceiptProvisional({ offlineRef: updated.offlineRef });
        })
        .finally(() => setIsQueueingPayment(false));
      return;
    }

    // A real server order, but there's no connection right now — queue
    // the payment rather than blocking the sale.
    if (conn === "offline") {
      const payment = buildOfflinePayment();
      const clientCharge = toClientCharge(math, paymentMethod === "cash" ? tenderedAmount : null);
      const snapshot = buildSnapshotFromOrder(currentSelected);
      setIsQueueingPayment(true);
      enqueuePaymentForServerOrder(currentSelected.id, payment, clientCharge, snapshot, shift?.shift_id ?? null)
        .then((entry) => {
          resetCheckout();
          setReceiptOrder(completed);
          setReceiptProvisional({ offlineRef: entry.offlineRef });
        })
        .finally(() => setIsQueueingPayment(false));
      return;
    }

    completeOrderMut.mutate(
      {
        orderId: currentSelected.id,
        paymentMethod,
        paymentReference: paymentMethod === "sinpe" ? sinpeRef : null,
        tipAmount,
        amountTendered: paymentMethod === "cash" ? tenderedAmount : null,
        customerName: needsInvoice ? invoiceName : null,
        customerId: needsInvoice ? invoiceId : null,
        customerEmail: needsInvoice ? invoiceEmail : null,
        // Send what was keyed, not the computed figure — the server derives
        // the amount itself and rejects a discount with no reason.
        discountType: discountAmount > 0 ? discountType : null,
        // Capped the same way the displayed figure is, so a fat-fingered
        // "150%" charges what the screen quoted instead of erroring out.
        discountValue:
          discountAmount > 0
            ? discountType === "percent"
              ? Math.min(discountInput, 100)
              : discountInput
            : 0,
        discountReason: discountAmount > 0 ? discountReason.trim() : null,
      },
      {
        onSuccess: () => {
          resetCheckout();
          setReceiptOrder(completed);
          setReceiptProvisional(null);
        },
        onError: (err: unknown) => {
          // navigator.onLine said "online" but the request itself couldn't
          // reach Supabase — queue the payment instead of losing it.
          if (isNetworkError(err)) {
            const payment = buildOfflinePayment();
            const clientCharge = toClientCharge(math, paymentMethod === "cash" ? tenderedAmount : null);
            const snapshot = buildSnapshotFromOrder(currentSelected);
            setIsQueueingPayment(true);
            enqueuePaymentForServerOrder(currentSelected.id, payment, clientCharge, snapshot, shift?.shift_id ?? null)
              .then((entry) => {
                resetCheckout();
                setReceiptOrder(completed);
                setReceiptProvisional({ offlineRef: entry.offlineRef });
              })
              .finally(() => setIsQueueingPayment(false));
            return;
          }
          alert(err instanceof Error ? err.message : t("counter.alertFailedComplete"));
        },
      }
    );
  };

  const handleVoidOrder = () => {
    if (!currentSelected) return;

    // Nothing was ever sent for a purely local order — discard, don't void.
    if (currentSelected.__local) {
      if (!confirm(t("offline.confirmDiscardLocal"))) return;
      discardLocalEntry(currentSelected.__local.entryId).then(() => resetCheckout());
      return;
    }
    if (conn === "offline") {
      alert(t("offline.needsConnection"));
      return;
    }

    if (!confirm(t("counter.confirmVoid", { id: currentSelected.id.slice(0, 8) }))) return;
    voidOrderMut.mutate(
      { orderId: currentSelected.id, reason: voidReason.trim() || null },
      {
        onSuccess: resetCheckout,
        onError: () => alert(t("counter.alertFailedVoid")),
      }
    );
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const itemLabel = (count: number) => count === 1 ? t("common.item") : t("common.items");

  return (
    <div className="flex flex-col h-full">
      {/* Shift status banner — checkout needs an open shift so cash sales
          land on the right drawer; a closed shift here would otherwise be
          a silent dead end at the "Complete Checkout" button. */}
      {!shift ? (
        <div className="shrink-0 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t("counter.noShiftWarning")}
          </span>
          <button
            onClick={() => setShowOpenShift(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-coffee-fruit text-white hover:bg-fruit-light transition-colors"
          >
            <Wallet className="w-4 h-4" />
            {t("counter.openShiftCta")}
          </button>
        </div>
      ) : (
        <div className="shrink-0 px-4 py-1.5 bg-warm-roast/5 border-b border-warm-roast/10 flex items-center justify-between gap-3 text-xs text-expresso/60">
          <span className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            {t("counter.shiftExpectedCash")}: <span className="font-semibold text-expresso">{formatMoney(shift.expected_cash, "CRC")}</span>
          </span>
          <button
            onClick={() => setShowCloseShift(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 font-medium rounded-lg hover:bg-warm-roast/10 hover:text-expresso transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            {t("cash.closeShift")}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {receiptOrder && (
        <ReceiptView
          order={receiptOrder}
          settings={settings ?? null}
          onClose={() => {
            setReceiptOrder(null);
            setReceiptProvisional(null);
          }}
          provisional={receiptProvisional ?? undefined}
        />
      )}

      {showOpenShift && <OpenShiftDialog onClose={() => setShowOpenShift(false)} />}
      {showCloseShift && shift && (
        <CloseShiftDialog shift={shift} onClose={() => setShowCloseShift(false)} />
      )}

      {/* Left: Order Queue */}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
              const itemCount = (order.order_items ?? []).reduce((s, i) => s + i.quantity, 0);
              return (
                <button
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setPaymentMethod(null);
                    setSinpeRef("");
                    setTip("");
                    setTendered("");
                    setNeedsInvoice(false);
                    // A discount belongs to the order it was keyed against;
                    // carrying it to the next one would quietly comp a sale.
                    clearDiscount();
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    currentSelected?.id === order.id
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

      {/* Right: Checkout */}
      <div className="flex-1 flex flex-col bg-background h-[60vh] lg:h-full overflow-hidden">
        {!currentSelected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-expresso/40">
            <Receipt className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-expresso/70">{t("counter.selectOrder")}</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
              {/* Order Summary */}
              <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-expresso">
                      {t("counter.order")}{" "}
                      {currentSelected.__local
                        ? currentSelected.__local.offlineRef
                        : currentSelected.order_number
                          ? `#${currentSelected.order_number}`
                          : `#${currentSelected.id.slice(0, 8)}`}
                    </h2>
                    <p className="text-expresso/60 text-sm">
                      {currentSelected.table?.name ?? t("common.takeaway")} · {formatTime(currentSelected.created_at)}
                      {currentSelected.__payPending && (
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
                  {(currentSelected.order_items ?? []).map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between items-start text-sm">
                      <div>
                        <span className="text-expresso font-medium">
                          {item.quantity}× {item.menu_item?.name ?? "Item"}
                        </span>
                        {(item.modifiers ?? []).length > 0 && (
                          <p className="text-xs text-expresso/40 mt-0.5">
                            {(item.modifiers ?? []).map((m) => m.name).join(", ")}
                          </p>
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
                      {/* With a discount the breakdown starts from the list
                          price of the lines above, so the customer can see
                          what came off before IVA is restated. */}
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

              {/* Discount — sits above Tip so the tip percentages are taken
                  on what the customer actually owes. */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">
                  {t("counter.discount")}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[10, 15, 20].map((pct) => {
                    const active =
                      discountType === "percent" && discountValue === String(pct);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setDiscountType("percent");
                          setDiscountValue(String(pct));
                        }}
                        className={cn(
                          "px-4 py-2.5 text-sm rounded-lg transition-colors",
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
                    onClick={clearDiscount}
                    className="px-4 py-2.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                  >
                    {t("counter.discountNone")}
                  </button>
                  <div className="inline-flex rounded-lg border border-warm-roast/20 overflow-hidden">
                    {(["percent", "amount"] as DiscountType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDiscountType(type)}
                        title={
                          type === "percent"
                            ? t("counter.discountPercent")
                            : t("counter.discountCustom")
                        }
                        className={cn(
                          "px-4 py-2.5 text-sm font-medium transition-colors",
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
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={
                      discountType === "percent"
                        ? t("counter.discountPercent")
                        : t("counter.discountCustom")
                    }
                    className="w-32"
                  />
                </div>

                {discountExceedsTotal && (
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    {t("counter.alertDiscountTooLarge")}
                  </p>
                )}

                {/* A discount without an attributable reason is
                    indistinguishable from money walking out the door, so the
                    reason is required here and again server-side. */}
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
                            onClick={() => setDiscountReason(label)}
                            className={cn(
                              "px-3 py-2.5 text-sm rounded-lg transition-colors",
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
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder={t("counter.discountReasonPlaceholder")}
                    />
                  </div>
                )}
              </div>

              {/* Tip */}
              {tipEnabled && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.tip")}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {[10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTip(String(Math.round(preTipTotal * (pct / 100))))}
                        className="px-4 py-2 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTip("")}
                      className="px-4 py-2 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                    >
                      {t("counter.tipNone")}
                    </button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={0}
                      value={tip}
                      onChange={(e) => setTip(e.target.value)}
                      placeholder={t("counter.tipCustom")}
                      className="w-32"
                    />
                  </div>
                </div>
              )}

              {/* Payment Methods */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.paymentMethod")}</h3>
                <div className="grid grid-cols-3 gap-4">
                  {(["card", "cash", "sinpe"] as PaymentMethod[]).map((method) => {
                    const Icon = method === "card" ? CreditCard : method === "cash" ? Banknote : Smartphone;
                    const label =
                      method === "card" ? t("counter.card") :
                      method === "cash" ? t("counter.cash") :
                      "SINPE";
                    return (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                          paymentMethod === method
                            ? "bg-coffee-fruit text-white border-transparent shadow-md"
                            : "bg-card text-expresso/80 border-warm-roast/10 hover:border-warm-roast/40"
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="font-medium text-sm">{label}</span>
                      </button>
                    );
                  })}
                </div>
                {paymentMethod === "sinpe" && (
                  <div className="mt-4 bg-card p-4 rounded-xl border border-warm-roast/10">
                    <Label className="mb-2 block">{t("counter.referenceNumber")}</Label>
                    <Input type="text" value={sinpeRef} onChange={(e) => setSinpeRef(e.target.value)} placeholder={t("counter.enterSinpeRef")} />
                  </div>
                )}
                {paymentMethod === "cash" && (
                  <div className="mt-4 bg-card p-4 rounded-xl border border-warm-roast/10 space-y-3">
                    <Label className="block">{t("counter.amountTendered")}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={0}
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder={String(Math.round(totalDue))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTendered(String(Math.round(totalDue)))}
                        className="px-3 py-1.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                      >
                        {t("counter.exact")}
                      </button>
                      {[1000, 2000, 5000, 10000]
                        .filter((amt) => amt >= totalDue)
                        .slice(0, 3)
                        .map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setTendered(String(amt))}
                            className="px-3 py-1.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                          >
                            {formatMoney(amt, currency)}
                          </button>
                        ))}
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-warm-roast/10">
                      <span className="text-sm font-medium text-expresso/60">{t("counter.changeDue")}</span>
                      <span className={`text-lg font-bold ${changeDue < 0 ? "text-red-500" : "text-expresso"}`}>
                        {formatMoney(changeDue < 0 ? 0 : changeDue, currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Invoice */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.electronicInvoice")}</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={needsInvoice} onChange={(e) => setNeedsInvoice(e.target.checked)} />
                    <span className="text-sm font-medium text-expresso/80">{t("counter.requestInvoice")}</span>
                  </label>
                </div>
                {needsInvoice && (
                  <div className="bg-card p-5 rounded-xl border border-warm-roast/10 space-y-4">
                    <div>
                      <Label className="mb-1 block">{t("counter.fullName")}</Label>
                      <Input type="text" value={invoiceName} onChange={(e) => setInvoiceName(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1 block">{t("counter.idNumber")}</Label>
                      <Input type="text" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1 block">{t("counter.email")}</Label>
                      <Input type="email" value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Complete */}
            <div className="p-6 lg:p-8 pt-4 border-t border-warm-roast/10 bg-card shrink-0 space-y-3">
              <Input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t("counter.voidReasonPlaceholder")}
                className="text-sm"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={handleVoidOrder}
                  disabled={completeOrderMut.isPending || isQueueingPayment || (conn === "offline" && !currentSelected.__local)}
                  isLoading={voidOrderMut.isPending}
                  leftIcon={!voidOrderMut.isPending && <Ban className="w-5 h-5" />}
                  className="w-full sm:w-auto text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  {currentSelected.__local ? t("offline.discardLocal") : t("counter.void")}
                </Button>
                <Button
                  size="lg"
                  onClick={handleCompleteOrder}
                  disabled={!canCompleteCheckout || voidOrderMut.isPending || isQueueingPayment}
                  isLoading={completeOrderMut.isPending || isQueueingPayment}
                  leftIcon={!completeOrderMut.isPending && <CheckCircle2 className="w-5 h-5" />}
                  className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
                >
                  {t("counter.completeCheckout")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
