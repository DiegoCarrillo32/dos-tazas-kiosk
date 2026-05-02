"use client";

import { useState } from "react";
import { Search, Filter, Eye } from "lucide-react";

const MOCK_HISTORY = [
  { id: "ORD-003", date: "2026-05-01 10:51 AM", items: 1, total: 4.50, payment: "Card", status: "Completed" },
  { id: "ORD-002", date: "2026-05-01 10:48 AM", items: 2, total: 8.00, payment: "SINPE", status: "Completed" },
  { id: "ORD-001", date: "2026-05-01 10:45 AM", items: 3, total: 12.50, payment: "Cash", status: "Completed" },
];

export default function TransactionHistory() {
  const [history] = useState(MOCK_HISTORY);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Transaction History</h1>
        <p className="text-zinc-500 mt-1">View past orders and receipts</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by Order ID..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 shadow-sm"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

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
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {history.map((order) => (
                <tr key={order.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{order.id}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{order.date}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{order.items}</td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">${order.total.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{order.payment}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
