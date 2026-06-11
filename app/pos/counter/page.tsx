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
} from "lucide-react";
import type { Order, OrderItem, PaymentMethod } from "@/lib/types";
import {
  useParkedOrders,
  useCompleteOrder,
  useCancelOrder,
  useLocationSettings,
} from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";

export default function CounterView() {
  const { data: orders = [], isLoading, refetch, isRefetching } = useParkedOrders();
  const { data: settings } = useLocationSettings();
  const completeOrderMut = useCompleteOrder();
  const cancelOrderMut = useCancelOrder();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [sinpeRef, setSinpeRef] = useState("");
  const [tip, setTip] = useState("");
  const [tendered, setTendered] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Invoice form
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  const filteredOrders = orders.filter((o) =>
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Keep selectedOrder in sync with data
  const currentSelected = selectedOrder
    ? orders.find((o) => o.id === selectedOrder.id) ?? null
    : null;

  // Server already computed subtotal + tax at park time; tip is added here.
  const subtotal = Number(currentSelected?.subtotal ?? 0);
  const taxAmount = Number(currentSelected?.tax_amount ?? 0);
  const taxRatePct = Math.round(
    Number(currentSelected?.tax_rate ?? settings?.tax_rate ?? 0.13) * 100
  );
  const tipEnabled = settings?.tip_enabled ?? false;
  const tipAmount = Math.max(0, parseFloat(tip) || 0);
  const totalDue = subtotal + taxAmount + tipAmount;
  const tenderedAmount = parseFloat(tendered) || 0;
  const changeDue = tenderedAmount - totalDue;

  const resetCheckout = () => {
    setSelectedOrder(null);
    setPaymentMethod(null);
    setSinpeRef("");
    setTip("");
    setTendered("");
    setNeedsInvoice(false);
    setInvoiceName("");
    setInvoiceId("");
    setInvoiceEmail("");
  };

  const handleCompleteOrder = () => {
    if (!currentSelected || !paymentMethod) return;
    if (paymentMethod === "sinpe" && !sinpeRef) {
      alert("Please enter the SINPE reference number.");
      return;
    }
    if (paymentMethod === "cash" && tenderedAmount < totalDue) {
      alert("Amount tendered is less than the total due.");
      return;
    }
    if (needsInvoice && (!invoiceName || !invoiceId || !invoiceEmail)) {
      alert("Please fill in all invoice details.");
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
      },
      {
        onSuccess: resetCheckout,
        onError: () => alert("Failed to complete order. Please try again."),
      }
    );
  };

  const handleVoidOrder = () => {
    if (!currentSelected) return;
    if (!confirm(`Void order #${currentSelected.id.slice(0, 8)}? This cannot be undone.`)) return;
    cancelOrderMut.mutate(currentSelected.id, {
      onSuccess: resetCheckout,
      onError: () => alert("Failed to void order. Please try again."),
    });
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left: Order Queue */}
      <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-warm-roast/10 bg-card flex flex-col h-[40vh] lg:h-full shrink-0">
        <div className="p-4 border-b border-warm-roast/10 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg text-expresso">
            Parked Orders
            {orders.length > 0 && <span className="ml-2 text-sm font-normal text-expresso/60">({orders.length})</span>}
          </h2>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
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
              placeholder="Search order ID..."
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
              {searchQuery ? "No matching orders." : "No parked orders."}
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
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    currentSelected?.id === order.id
                      ? "bg-card border-coffee-fruit shadow-md ring-1 ring-coffee-fruit"
                      : "bg-card border-warm-roast/10 hover:border-warm-roast/40 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-semibold text-sm text-expresso">
                      {order.order_number ? `#${order.order_number}` : `${order.id.slice(0, 8)}…`}
                    </span>
                    <span className="text-sm font-bold text-expresso">
                      ${Number(order.total_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-expresso/60">
                    <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
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
            <h3 className="text-lg font-medium text-expresso/70">Select an order to checkout</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
              {/* Order Summary */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-bold text-expresso">
                    Order {currentSelected.order_number ? `#${currentSelected.order_number}` : `#${currentSelected.id.slice(0, 8)}`}
                  </h2>
                  <p className="text-expresso/60 text-sm">{formatTime(currentSelected.created_at)}</p>
                </div>
                <div className="text-3xl font-black text-expresso">
                  ${totalDue.toFixed(2)}
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
                    <span className="text-expresso/80">${Number(item.total_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {/* Money breakdown */}
              <div className="space-y-1.5 border-t border-warm-roast/10 mt-4 pt-4 text-sm">
                <div className="flex justify-between text-expresso/70">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-expresso/70">
                  <span>IVA ({taxRatePct}%)</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                {tipAmount > 0 && (
                  <div className="flex justify-between text-expresso/70">
                    <span>Tip</span>
                    <span>${tipAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-expresso pt-1.5 border-t border-warm-roast/10 mt-1.5">
                  <span>Total</span>
                  <span>${totalDue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Tip */}
            {tipEnabled && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">Tip</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTip((subtotal * (pct / 100)).toFixed(2))}
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
                    None
                  </button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={tip}
                    onChange={(e) => setTip(e.target.value)}
                    placeholder="Custom"
                    className="w-32"
                  />
                </div>
              </div>
            )}

            {/* Payment Methods */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">Payment Method</h3>
              <div className="grid grid-cols-3 gap-4">
                {(["card", "cash", "sinpe"] as PaymentMethod[]).map((method) => {
                  const Icon = method === "card" ? CreditCard : method === "cash" ? Banknote : Smartphone;
                  const label = method === "sinpe" ? "SINPE" : method.charAt(0).toUpperCase() + method.slice(1);
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
                  <Label className="mb-2 block">Reference Number</Label>
                  <Input type="text" value={sinpeRef} onChange={(e) => setSinpeRef(e.target.value)} placeholder="Enter SINPE reference" />
                </div>
              )}
              {paymentMethod === "cash" && (
                <div className="mt-4 bg-card p-4 rounded-xl border border-warm-roast/10 space-y-3">
                  <Label className="block">Amount Tendered</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={totalDue.toFixed(2)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTendered(totalDue.toFixed(2))}
                      className="px-3 py-1.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                    >
                      Exact
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
                          ${amt.toLocaleString()}
                        </button>
                      ))}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-warm-roast/10">
                    <span className="text-sm font-medium text-expresso/60">Change Due</span>
                    <span className={`text-lg font-bold ${changeDue < 0 ? "text-red-500" : "text-expresso"}`}>
                      ${(changeDue < 0 ? 0 : changeDue).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Invoice */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">Electronic Invoice</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={needsInvoice} onChange={(e) => setNeedsInvoice(e.target.checked)} />
                  <span className="text-sm font-medium text-expresso/80">Request Invoice</span>
                </label>
              </div>
              {needsInvoice && (
                <div className="bg-card p-5 rounded-xl border border-warm-roast/10 space-y-4">
                  <div>
                    <Label className="mb-1 block">Full Name</Label>
                    <Input type="text" value={invoiceName} onChange={(e) => setInvoiceName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-1 block">ID Number (Cédula)</Label>
                    <Input type="text" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-1 block">Email</Label>
                    <Input type="email" value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            </div>

            {/* Complete */}
            <div className="p-6 lg:p-8 pt-4 border-t border-warm-roast/10 bg-card shrink-0 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                variant="secondary"
                onClick={handleVoidOrder}
                disabled={completeOrderMut.isPending}
                isLoading={cancelOrderMut.isPending}
                leftIcon={!cancelOrderMut.isPending && <Ban className="w-5 h-5" />}
                className="w-full sm:w-auto text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                Void
              </Button>
              <Button
                size="lg"
                onClick={handleCompleteOrder}
                disabled={!paymentMethod || cancelOrderMut.isPending || (paymentMethod === "cash" && tenderedAmount < totalDue)}
                isLoading={completeOrderMut.isPending}
                leftIcon={!completeOrderMut.isPending && <CheckCircle2 className="w-5 h-5" />}
                className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
              >
                Complete Checkout
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
