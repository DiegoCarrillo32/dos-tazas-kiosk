"use client";

import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";

const MOCK_MENU = [
  { id: "1", name: "Espresso", category: "Hot Coffee", price: 2.50, available: 100, active: true },
  { id: "2", name: "Americano", category: "Hot Coffee", price: 3.00, available: 100, active: true },
  { id: "3", name: "Iced Latte", category: "Iced Coffee", price: 5.00, available: 50, active: true },
];

export default function MenuManagement() {
  const [items, setItems] = useState(MOCK_MENU);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Menu & Inventory</h1>
          <p className="text-zinc-500 mt-1">Manage your products and stock</p>
        </div>
        <button className="flex items-center gap-2 bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 px-4 py-2 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Category</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Price</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stock</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{item.category}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">${item.price.toFixed(2)}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{item.available}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                    <button className="p-2 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
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
