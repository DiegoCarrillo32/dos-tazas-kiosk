"use client";

import { useState } from "react";
import { Search, Eye, Loader2, X } from "lucide-react";
import type { Order, OrderItem } from "@/lib/types";
import { useCompletedOrders } from "@/lib/hooks";

export default function TransactionHistory() {
  const { data: history = [], isLoading } = useCompletedOrders();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const filtered = history.filter((o) =>
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString([], {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Transaction History</h1>
        <p className="text-zinc-500 mt-1">View past orders and receipts</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by Order ID..." className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 shadow-sm" />
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Order #{selectedOrder.id.slice(0, 8)}</h3>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Date</span><span className="font-medium text-zinc-900 dark:text-zinc-100">{formatDate(selectedOrder.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Total</span><span className="font-bold text-zinc-900 dark:text-zinc-100">${Number(selectedOrder.total_amount).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Payment</span><span className="text-zinc-900 dark:text-zinc-100">{selectedOrder.payment_method?.toUpperCase() ?? "—"}</span></div>
              {selectedOrder.payment_reference && (<div className="flex justify-between"><span className="text-zinc-500">Reference</span><span className="text-zinc-900 dark:text-zinc-100">{selectedOrder.payment_reference}</span></div>)}
              {selectedOrder.customer_name && (
                <>
                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 mt-3"><h4 className="font-semibold text-zinc-500 uppercase tracking-wider text-xs mb-2">Invoice Info</h4></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Name</span><span>{selectedOrder.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Cédula</span><span>{selectedOrder.customer_id}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Email</span><span>{selectedOrder.customer_email}</span></div>
                </>
              )}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 mt-3">
                <h4 className="font-semibold text-zinc-500 uppercase tracking-wider text-xs mb-2">Items</h4>
                <div className="space-y-2">
                  {(selectedOrder.order_items ?? []).map((item: OrderItem) => (
                    <div key={item.id} className="flex justify-between">
                      <span>{item.quantity}× {(item as any).menu_item?.name ?? "Item"}</span>
                      <span>${Number(item.total_price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Order ID</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Date & Time</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Items</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Total</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payment</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-zinc-400 text-sm">{searchQuery ? "No matching orders." : "No completed orders yet."}</td></tr>
              ) : (
                filtered.map((order) => {
                  const itemCount = (order.order_items ?? []).reduce((s: number, i: OrderItem) => s + i.quantity, 0);
                  return (
                    <tr key={order.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-zinc-900 dark:text-zinc-100">{order.id.slice(0, 8)}…</td>
                      <td className="px-6 py-4 text-sm text-zinc-500">{formatDate(order.created_at)}</td>
                      <td className="px-6 py-4 text-sm text-zinc-500">{itemCount}</td>
                      <td className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">${Number(order.total_amount).toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-zinc-500">{order.payment_method?.toUpperCase() ?? "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedOrder(order)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"><Eye className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
