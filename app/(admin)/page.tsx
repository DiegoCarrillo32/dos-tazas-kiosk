"use client";

import { DollarSign, ShoppingBag, Coffee, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Daily Analytics</h1>
        <p className="text-zinc-500 mt-1">Overview of today's performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Cards */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-500 text-sm">Gross Revenue</h3>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-zinc-900 dark:text-zinc-50" />
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">$1,245.00</p>
          <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>+12% from yesterday</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-500 text-sm">Total Orders</h3>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-zinc-900 dark:text-zinc-50" />
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">142</p>
          <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>+5% from yesterday</span>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-500 text-sm">Items Sold</h3>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
              <Coffee className="w-5 h-5 text-zinc-900 dark:text-zinc-50" />
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">312</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-500 text-sm">Average Order Value</h3>
            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
              <DollarSign className="w-5 h-5 text-zinc-900 dark:text-zinc-50" />
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">$8.76</p>
        </div>
      </div>
    </div>
  );
}
