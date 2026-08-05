"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Receipt } from "lucide-react";
import type { Order } from "@/lib/types";
import {
  useCompleteOrder,
  useVoidOrder,
  useLocationSettings,
  useOrdersRealtime,
  useCurrentShift,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { Receipt as ReceiptView } from "@/components/Receipt";
import { OpenShiftDialog, CloseShiftDialog } from "@/components/ShiftDialogs";
import { useT } from "@/lib/i18n/LanguageContext";
import { priceCheckout, changeDue as computeChangeDue, toClientCharge } from "@/lib/pricing";
import { useConnectionStatus } from "@/lib/offline/useConnectionStatus";
import { useMergedParkedOrders, type QueueOrder } from "@/lib/offline/useMergedParkedOrders";
import { useOutbox } from "@/lib/offline/useOutbox";
import { attachPayment, discardLocalEntry, enqueuePaymentForServerOrder } from "@/lib/offline/outbox";
import { isNetworkError } from "@/lib/offline/sync";
import type { OfflineOrderSnapshot, OfflinePaymentPayload } from "@/lib/offline/types";
import { useCheckoutState } from "./_hooks/useCheckoutState";
import { ShiftBanner } from "./_components/ShiftBanner";
import { OrderQueue } from "./_components/OrderQueue";
import { CheckoutSummary } from "./_components/CheckoutSummary";
import { DiscountSection } from "./_components/DiscountSection";
import { TipSection } from "./_components/TipSection";
import { PaymentSection } from "./_components/PaymentSection";
import { InvoiceSection } from "./_components/InvoiceSection";

export default function CounterView() {
  const t = useT();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { orders, isLoading, refetch, isRefetching, pendingCount, failedCount } = useMergedParkedOrders();
  const { data: settings } = useLocationSettings();
  const { data: shift } = useCurrentShift();
  const live = useOrdersRealtime();
  const conn = useConnectionStatus();
  const completeOrderMut = useCompleteOrder();
  const voidOrderMut = useVoidOrder();
  const { entries: outboxEntries } = useOutbox();
  // A queued (not yet synced) shift-open — see OpenShiftDialog. Treated as
  // "a shift is opening" so checkout isn't blocked for the entire outage:
  // sync_offline_order/sync_offline_payment resolve the real shift_id
  // server-side once this drains, and the outbox's strict FIFO order
  // guarantees it drains before any sale queued behind it.
  const shiftOpening = outboxEntries.some(
    (e) => e.kind === "open_shift" && (e.status === "pending" || e.status === "inflight")
  );

  const checkout = useCheckoutState();
  const [selectedOrder, setSelectedOrder] = useState<QueueOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptProvisional, setReceiptProvisional] = useState<{ offlineRef: string } | null>(null);
  const [isQueueingPayment, setIsQueueingPayment] = useState(false);

  // Shift open/close is a till action, so staff drive it from here rather
  // than the admin-only Cash Drawer page.
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);

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

  // Read subtotal/tax straight from the order — no `|| total_amount`
  // fallback. That fallback meant a legitimately-zero subtotal (a fully
  // comped or free item) silently substituted the GROSS total_amount,
  // which grossBeforeDiscount below then re-added IVA on top of, double
  // counting tax on the checkout screen.
  const subtotal = Number(currentSelected?.subtotal ?? 0);
  const taxAmount = Number(currentSelected?.tax_amount ?? 0);
  const taxRatePct = Math.round(
    Number(currentSelected?.tax_rate ?? settings?.tax_rate ?? 0.13) * 100
  );
  const currency = settings?.currency ?? "CRC";
  const currencySymbol = currency === "CRC" ? "₡" : "$";
  const tipEnabled = settings?.tip_enabled ?? false;
  const tipAmount = Math.max(0, parseFloat(checkout.tip) || 0);

  // The math below mirrors complete_order's arithmetic exactly (see
  // lib/pricing.ts for the shared implementation and the SQL line
  // references) — the server is what actually charges, so any drift here
  // would quote the customer a total the till never takes.
  const discountInput = Math.max(0, parseFloat(checkout.discountValue) || 0);
  const grossBeforeDiscount = subtotal + taxAmount;
  const math = priceCheckout({
    gross: grossBeforeDiscount,
    tax: taxAmount,
    discountType: checkout.discountType,
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
  const discountReasonMissing = discountAmount > 0 && !checkout.discountReason.trim();
  const tenderedAmount = parseFloat(checkout.tendered) || 0;
  const changeDue = computeChangeDue(totalDue, tenderedAmount);

  // complete_order refuses payment outside an open shift, so without the
  // `shift` guard the cashier taps Complete and gets a raw, untranslated
  // Postgres error. The banner above already offers the one-tap fix.
  // A queued-but-not-yet-synced shift open (shiftOpening) counts too —
  // otherwise a connection dropped before the first "Open Shift" tap of
  // the day is a total dead end for offline selling.
  // A __payPending order already has a queued payment (another device, or
  // this one before reconnecting) — paying it again would double-charge.
  const canCompleteCheckout =
    (!!shift || shiftOpening) &&
    !!checkout.paymentMethod &&
    !discountExceedsTotal &&
    !discountReasonMissing &&
    !currentSelected?.__payPending &&
    !(checkout.paymentMethod === "cash" && tenderedAmount < totalDue);

  function buildOfflinePayment(): OfflinePaymentPayload {
    return {
      payment_method: checkout.paymentMethod as NonNullable<typeof checkout.paymentMethod>,
      payment_reference: checkout.paymentMethod === "sinpe" ? checkout.sinpeRef : null,
      tip_amount: tipAmount,
      amount_tendered: checkout.paymentMethod === "cash" ? tenderedAmount : null,
      customer_name: checkout.needsInvoice ? checkout.invoiceName : null,
      customer_id: checkout.needsInvoice ? checkout.invoiceId : null,
      customer_email: checkout.needsInvoice ? checkout.invoiceEmail : null,
      // Send what was keyed, not the computed figure — the same reasoning
      // as the online path below: the server derives the amount itself.
      discount_type: discountAmount > 0 ? checkout.discountType : null,
      discount_value:
        discountAmount > 0
          ? checkout.discountType === "percent"
            ? Math.min(discountInput, 100)
            : discountInput
          : 0,
      discount_reason: discountAmount > 0 ? checkout.discountReason.trim() : null,
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

  /**
   * Shared by all three "can't reach the server right now" cases below —
   * a not-yet-synced local order (attachPayment promotes its outbox entry
   * in place), a real server order with no connection, and a real server
   * order whose online attempt just failed on a network error. Each used
   * to hand-roll this same build-payment/queue/reset sequence.
   */
  async function queueOfflinePayment(order: QueueOrder, completed: Order) {
    const payment = buildOfflinePayment();
    const clientCharge = toClientCharge(math, checkout.paymentMethod === "cash" ? tenderedAmount : null);
    setIsQueueingPayment(true);
    try {
      if (order.__local) {
        const updated = await attachPayment(order.__local.entryId, payment, clientCharge, shift?.shift_id ?? null);
        if (!updated) {
          toast(t("counter.alertFailedComplete"));
          return;
        }
        checkout.resetAll();
        setSelectedOrder(null);
        setReceiptOrder(completed);
        setReceiptProvisional({ offlineRef: updated.offlineRef });
        return;
      }

      const snapshot = buildSnapshotFromOrder(order);
      const entry = await enqueuePaymentForServerOrder(order.id, payment, clientCharge, snapshot, shift?.shift_id ?? null);
      checkout.resetAll();
      setSelectedOrder(null);
      setReceiptOrder(completed);
      setReceiptProvisional({ offlineRef: entry.offlineRef });
    } finally {
      setIsQueueingPayment(false);
    }
  }

  const handleCompleteOrder = () => {
    if (!currentSelected || !checkout.paymentMethod) return;
    if (checkout.paymentMethod === "sinpe" && !checkout.sinpeRef) {
      toast(t("counter.alertSinpeRef"));
      return;
    }
    if (checkout.paymentMethod === "cash" && tenderedAmount < totalDue) {
      toast(t("counter.alertInsufficientTendered"));
      return;
    }
    if (checkout.needsInvoice && (!checkout.invoiceName || !checkout.invoiceId || !checkout.invoiceEmail)) {
      toast(t("counter.alertInvoiceRequired"));
      return;
    }
    if (discountExceedsTotal) {
      toast(t("counter.alertDiscountTooLarge"));
      return;
    }
    if (discountReasonMissing) {
      toast(t("counter.alertDiscountReason"));
      return;
    }
    if (currentSelected.__payPending) return; // button is disabled; belt & braces

    const completed: Order = {
      ...currentSelected,
      status: "completed",
      payment_method: checkout.paymentMethod,
      payment_reference: checkout.paymentMethod === "sinpe" ? checkout.sinpeRef : null,
      subtotal: netDue,
      tax_amount: taxDue,
      discount_amount: discountAmount,
      discount_reason: discountAmount > 0 ? checkout.discountReason.trim() : null,
      tip_amount: tipAmount,
      total_amount: totalDue,
      amount_tendered: checkout.paymentMethod === "cash" ? tenderedAmount : null,
      change_due: checkout.paymentMethod === "cash" ? changeDue : null,
      customer_name: checkout.needsInvoice ? checkout.invoiceName : null,
      customer_id: checkout.needsInvoice ? checkout.invoiceId : null,
      customer_email: checkout.needsInvoice ? checkout.invoiceEmail : null,
    };

    // A not-yet-synced local order (parked while offline): promote its
    // existing outbox entry in place rather than queuing a second one —
    // same client_uuid, so it's still exactly one eventual server order.
    if (currentSelected.__local) {
      void queueOfflinePayment(currentSelected, completed);
      return;
    }

    // A real server order, but there's no connection right now — queue
    // the payment rather than blocking the sale.
    if (conn === "offline") {
      void queueOfflinePayment(currentSelected, completed);
      return;
    }

    completeOrderMut.mutate(
      {
        orderId: currentSelected.id,
        paymentMethod: checkout.paymentMethod,
        paymentReference: checkout.paymentMethod === "sinpe" ? checkout.sinpeRef : null,
        tipAmount,
        amountTendered: checkout.paymentMethod === "cash" ? tenderedAmount : null,
        customerName: checkout.needsInvoice ? checkout.invoiceName : null,
        customerId: checkout.needsInvoice ? checkout.invoiceId : null,
        customerEmail: checkout.needsInvoice ? checkout.invoiceEmail : null,
        // Send what was keyed, not the computed figure — the server derives
        // the amount itself and rejects a discount with no reason.
        discountType: discountAmount > 0 ? checkout.discountType : null,
        // Capped the same way the displayed figure is, so a fat-fingered
        // "150%" charges what the screen quoted instead of erroring out.
        discountValue:
          discountAmount > 0
            ? checkout.discountType === "percent"
              ? Math.min(discountInput, 100)
              : discountInput
            : 0,
        discountReason: discountAmount > 0 ? checkout.discountReason.trim() : null,
      },
      {
        onSuccess: () => {
          checkout.resetAll();
          setSelectedOrder(null);
          setReceiptOrder(completed);
          setReceiptProvisional(null);
        },
        onError: (err: unknown) => {
          // navigator.onLine said "online" but the request itself couldn't
          // reach Supabase — queue the payment instead of losing it.
          if (isNetworkError(err)) {
            void queueOfflinePayment(currentSelected, completed);
            return;
          }
          toast(err instanceof Error ? err.message : t("counter.alertFailedComplete"));
        },
      }
    );
  };

  const handleVoidOrder = async () => {
    if (!currentSelected) return;

    // Nothing was ever sent for a purely local order — discard, don't void.
    if (currentSelected.__local) {
      if (!(await confirmDialog(t("offline.confirmDiscardLocal")))) return;
      discardLocalEntry(currentSelected.__local.entryId).then(() => {
        checkout.resetAll();
        setSelectedOrder(null);
      });
      return;
    }
    if (conn === "offline") {
      toast(t("offline.needsConnection"));
      return;
    }

    if (!(await confirmDialog(t("counter.confirmVoid", { id: currentSelected.id.slice(0, 8) })))) return;
    voidOrderMut.mutate(
      { orderId: currentSelected.id, reason: checkout.voidReason.trim() || null },
      {
        onSuccess: () => {
          checkout.resetAll();
          setSelectedOrder(null);
        },
        onError: () => toast(t("counter.alertFailedVoid")),
      }
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ShiftBanner
        shift={shift}
        shiftOpening={shiftOpening}
        onOpenShift={() => setShowOpenShift(true)}
        onCloseShift={() => setShowCloseShift(true)}
      />

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
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

        <OrderQueue
          orders={orders}
          filteredOrders={filteredOrders}
          isLoading={isLoading}
          isRefetching={isRefetching}
          refetch={refetch}
          live={live}
          pendingCount={pendingCount}
          failedCount={failedCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedOrderId={currentSelected?.id ?? null}
          onSelectOrder={(order) => {
            setSelectedOrder(order);
            checkout.selectOrder();
          }}
          currency={currency}
        />

        {/* Right: Checkout */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background overflow-hidden">
          {!currentSelected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-expresso/40">
              <Receipt className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-expresso/70">{t("counter.selectOrder")}</h3>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 md:p-5 lg:p-8 space-y-5 md:space-y-6 lg:space-y-8">
                <CheckoutSummary
                  order={currentSelected}
                  totalDue={totalDue}
                  discountAmount={discountAmount}
                  discountReason={checkout.discountReason}
                  grossBeforeDiscount={grossBeforeDiscount}
                  netDue={netDue}
                  taxDue={taxDue}
                  taxRatePct={taxRatePct}
                  tipAmount={tipAmount}
                  currency={currency}
                />

                {/* Discount — sits above Tip so the tip percentages are
                    taken on what the customer actually owes. */}
                <DiscountSection
                  discountType={checkout.discountType}
                  discountValue={checkout.discountValue}
                  discountReason={checkout.discountReason}
                  discountExceedsTotal={discountExceedsTotal}
                  discountAmount={discountAmount}
                  currencySymbol={currencySymbol}
                  onTypeChange={(v) => checkout.setField("discountType", v)}
                  onValueChange={(v) => checkout.setField("discountValue", v)}
                  onReasonChange={(v) => checkout.setField("discountReason", v)}
                  onClear={checkout.clearDiscount}
                />

                {tipEnabled && (
                  <TipSection
                    tip={checkout.tip}
                    preTipTotal={preTipTotal}
                    onChange={(v) => checkout.setField("tip", v)}
                  />
                )}

                <PaymentSection
                  paymentMethod={checkout.paymentMethod}
                  onSelectMethod={(m) => checkout.setField("paymentMethod", m)}
                  sinpeRef={checkout.sinpeRef}
                  onSinpeRefChange={(v) => checkout.setField("sinpeRef", v)}
                  tendered={checkout.tendered}
                  onTenderedChange={(v) => checkout.setField("tendered", v)}
                  totalDue={totalDue}
                  changeDue={changeDue}
                  currency={currency}
                />

                <InvoiceSection
                  needsInvoice={checkout.needsInvoice}
                  onNeedsInvoiceChange={(v) => checkout.setField("needsInvoice", v)}
                  invoiceName={checkout.invoiceName}
                  onInvoiceNameChange={(v) => checkout.setField("invoiceName", v)}
                  invoiceId={checkout.invoiceId}
                  onInvoiceIdChange={(v) => checkout.setField("invoiceId", v)}
                  invoiceEmail={checkout.invoiceEmail}
                  onInvoiceEmailChange={(v) => checkout.setField("invoiceEmail", v)}
                />
              </div>

              {/* Complete */}
              <div className="p-4 md:p-5 lg:p-8 pt-3 lg:pt-4 border-t border-warm-roast/10 bg-card shrink-0 space-y-3">
                <Input
                  type="text"
                  value={checkout.voidReason}
                  onChange={(e) => checkout.setField("voidReason", e.target.value)}
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
