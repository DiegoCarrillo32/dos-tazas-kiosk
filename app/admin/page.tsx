"use client";

import { DollarSign, ShoppingBag, Coffee, Loader2 } from "lucide-react";
import { useTodayAnalytics } from "@/lib/hooks";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

export default function AdminDashboard() {
  const t = useT();
  const { data: analytics, isLoading } = useTodayAnalytics();

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  const metrics = [
    // Net sales (ex-IVA), not gross — gross includes tax and tips, which
    // aren't shop revenue. All figures render in colones, matching the
    // Counter and Receipt rather than the stray "$" this page used to show.
    { label: t("analytics.netSales"), value: formatMoney(analytics.netSales, "CRC"), icon: DollarSign },
    { label: t("dashboard.totalOrders"), value: analytics.totalOrders.toString(), icon: ShoppingBag },
    { label: t("dashboard.itemsSold"), value: analytics.totalItemsSold.toString(), icon: Coffee },
    { label: t("dashboard.avgOrderValue"), value: formatMoney(analytics.averageOrderValue, "CRC"), icon: DollarSign },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("dashboard.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("dashboard.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-expresso/60 text-sm">{metric.label}</h3>
                <div className="bg-warm-roast/10 p-2 rounded-lg">
                  <Icon className="w-5 h-5 text-expresso" />
                </div>
              </div>
              <p className="text-3xl font-bold text-expresso">{metric.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
