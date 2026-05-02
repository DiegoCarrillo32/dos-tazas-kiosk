"use client";

import { useState } from "react";
import { RefreshCw, Search, CreditCard, BanknoteIcon as Banknote, Smartphone, Receipt, CheckCircle2 } from "lucide-react";

// Mock parked orders
const MOCK_ORDERS = [
  { id: "ORD-001", total: 12.50, items: 3, time: "10:45 AM", status: "parked" },
  { id: "ORD-002", total: 8.00, items: 2, time: "10:48 AM", status: "parked" },
  { id: "ORD-003", total: 4.50, items: 1, time: "10:51 AM", status: "parked" },
];

export default function CounterView() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<typeof MOCK_ORDERS[0] | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "sinpe" | null>(null);
  const [sinpeRef, setSinpeRef] = useState("");
  
  // Invoice form state
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);

  const handleRefresh = async () => {
    // Simulate network delay
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 500));
    // In real app, fetch from Supabase
    setIsProcessing(false);
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder || !paymentMethod) return;
    if (paymentMethod === "sinpe" && !sinpeRef) {
      alert("Please enter the SINPE reference number.");
      return;
    }
    if (needsInvoice && (!invoiceName || !invoiceId || !invoiceEmail)) {
      alert("Please fill in all invoice details.");
      return;
    }

    setIsProcessing(true);
    // Simulate API call to complete order
    await new Promise((r) => setTimeout(r, 1000));
    
    setOrders((prev) => prev.filter((o) => o.id !== selectedOrder.id));
    setSelectedOrder(null);
    setPaymentMethod(null);
    setSinpeRef("");
    setNeedsInvoice(false);
    setInvoiceName("");
    setInvoiceId("");
    setInvoiceEmail("");
    setIsProcessing(false);
    
    alert("Order completed successfully!");
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left Area: Order Queue */}
      <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-[40vh] lg:h-full shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Parked Orders</h2>
          <button
            onClick={handleRefresh}
            disabled={isProcessing}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search order ID..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-zinc-950/50">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedOrder?.id === order.id
                  ? "bg-white dark:bg-zinc-900 border-zinc-900 dark:border-zinc-50 shadow-md ring-1 ring-zinc-900 dark:ring-zinc-50"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 shadow-sm"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{order.id}</span>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">${order.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{order.items} items</span>
                <span>{order.time}</span>
              </div>
            </button>
          ))}
          {orders.length === 0 && (
            <div className="text-center text-zinc-500 py-8">
              No parked orders.
            </div>
          )}
        </div>
      </div>

      {/* Right Area: Checkout Panel */}
      <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 h-[60vh] lg:h-full">
        {!selectedOrder ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Receipt className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-zinc-600 dark:text-zinc-400">Select an order to checkout</h3>
          </div>
        ) : (
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-6 lg:p-8 space-y-8 overflow-y-auto">
            
            {/* Order Summary Header */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{selectedOrder.id}</h2>
                <p className="text-zinc-500">{selectedOrder.items} items • {selectedOrder.time}</p>
              </div>
              <div className="text-3xl font-black text-zinc-900 dark:text-zinc-50">
                ${selectedOrder.total.toFixed(2)}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Payment Method</h3>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                    paymentMethod === "card"
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 border-transparent shadow-md"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                  }`}
                >
                  <CreditCard className="w-6 h-6" />
                  <span className="font-medium text-sm">Card</span>
                </button>
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                    paymentMethod === "cash"
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 border-transparent shadow-md"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                  }`}
                >
                  <Banknote className="w-6 h-6" />
                  <span className="font-medium text-sm">Cash</span>
                </button>
                <button
                  onClick={() => setPaymentMethod("sinpe")}
                  className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                    paymentMethod === "sinpe"
                      ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 border-transparent shadow-md"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                  }`}
                >
                  <Smartphone className="w-6 h-6" />
                  <span className="font-medium text-sm">SINPE</span>
                </button>
              </div>

              {/* SINPE Reference Input */}
              {paymentMethod === "sinpe" && (
                <div className="animate-in fade-in slide-in-from-top-4 mt-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={sinpeRef}
                    onChange={(e) => setSinpeRef(e.target.value)}
                    placeholder="Enter SINPE reference"
                    className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                  />
                </div>
              )}
            </div>

            {/* Invoicing (Facturación) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Electronic Invoice</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={needsInvoice}
                    onChange={(e) => setNeedsInvoice(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Request Invoice</span>
                </label>
              </div>

              {needsInvoice && (
                <div className="animate-in fade-in slide-in-from-top-4 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={invoiceName}
                      onChange={(e) => setInvoiceName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">ID Number (Cédula)</label>
                    <input
                      type="text"
                      value={invoiceId}
                      onChange={(e) => setInvoiceId(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={invoiceEmail}
                      onChange={(e) => setInvoiceEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Complete Button */}
            <div className="pt-4 mt-auto">
              <button
                onClick={handleCompleteOrder}
                disabled={!paymentMethod || isProcessing}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-blue-600 active:scale-[0.98]"
              >
                {isProcessing ? "Processing..." : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Complete Checkout
                  </>
                )}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
