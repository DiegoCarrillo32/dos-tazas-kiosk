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
} from "lucide-react";
import type { Order, OrderItem, PaymentMethod } from "@/lib/types";
import { useParkedOrders, useCompleteOrder } from "@/lib/hooks";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";

export default function CounterView() {
  const { data: orders = [], isLoading, refetch, isRefetching } = useParkedOrders();
  const completeOrderMut = useCompleteOrder();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [sinpeRef, setSinpeRef] = useState("");
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

  const resetCheckout = () => {
    setSelectedOrder(null);
    setPaymentMethod(null);
    setSinpeRef("");
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
    if (needsInvoice && (!invoiceName || !invoiceId || !invoiceEmail)) {
      alert("Please fill in all invoice details.");
      return;
    }

    completeOrderMut.mutate(
      {
        orderId: currentSelected.id,
        paymentMethod,
        paymentReference: paymentMethod === "sinpe" ? sinpeRef : null,
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

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left: Order Queue */}
      <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-[40vh] lg:h-full shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">
            Parked Orders
            {orders.length > 0 && <span className="ml-2 text-sm font-normal text-zinc-500">({orders.length})</span>}
          </h2>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-zinc-950/50">
          {isLoading && orders.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">
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
                    setNeedsInvoice(false);
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    currentSelected?.id === order.id
                      ? "bg-white dark:bg-zinc-900 border-zinc-900 dark:border-zinc-50 shadow-md ring-1 ring-zinc-900 dark:ring-zinc-50"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {order.id.slice(0, 8)}…
                    </span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      ${Number(order.total_amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500">
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
      <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 h-[60vh] lg:h-full">
        {!currentSelected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Receipt className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-zinc-600 dark:text-zinc-400">Select an order to checkout</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-6 lg:p-8 space-y-8 overflow-y-auto">
            {/* Order Summary */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Order #{currentSelected.id.slice(0, 8)}</h2>
                  <p className="text-zinc-500 text-sm">{formatTime(currentSelected.created_at)}</p>
                </div>
                <div className="text-3xl font-black text-zinc-900 dark:text-zinc-50">
                  ${Number(currentSelected.total_amount).toFixed(2)}
                </div>
              </div>
              <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                {(currentSelected.order_items ?? []).map((item: OrderItem) => (
                  <div key={item.id} className="flex justify-between items-start text-sm">
                    <div>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                        {item.quantity}× {(item as any).menu_item?.name ?? "Item"}
                      </span>
                      {(item.modifiers ?? []).length > 0 && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {(item.modifiers ?? []).map((m: any) => m.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300">${Number(item.total_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Payment Method</h3>
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
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 border-transparent shadow-md"
                          : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="font-medium text-sm">{label}</span>
                    </button>
                  );
                })}
              </div>
              {paymentMethod === "sinpe" && (
                <div className="mt-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <Label className="mb-2 block">Reference Number</Label>
                  <Input type="text" value={sinpeRef} onChange={(e) => setSinpeRef(e.target.value)} placeholder="Enter SINPE reference" />
                </div>
              )}
            </div>

            {/* Invoice */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Electronic Invoice</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={needsInvoice} onChange={(e) => setNeedsInvoice(e.target.checked)} />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Request Invoice</span>
                </label>
              </div>
              {needsInvoice && (
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
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

            {/* Complete */}
            <div className="pt-4 mt-auto">
              <Button
                size="lg"
                onClick={handleCompleteOrder}
                disabled={!paymentMethod}
                isLoading={completeOrderMut.isPending}
                leftIcon={!completeOrderMut.isPending && <CheckCircle2 className="w-5 h-5" />}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white border-transparent"
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
