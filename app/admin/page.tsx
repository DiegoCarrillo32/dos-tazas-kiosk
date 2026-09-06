"use client";

import { DollarSign, ShoppingBag, Coffee, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTodayAnalytics } from "@/lib/hooks";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";
import { StatCardsSkeleton } from "./_components/Skeletons";

export default function AdminDashboard() {
  const t = useT();
  const { data: analytics, isLoading } = useTodayAnalytics();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("dashboard.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {isLoading || !analytics ? (
        <StatCardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in-0 duration-200">
          {[
            // Net sales (ex-IVA), not gross — gross includes tax and tips, which
            // aren't shop revenue. All figures render in colones, matching the
            // Counter and Receipt rather than the stray "$" this page used to show.
            // Each is compared against yesterday, the previous window of equal
            // length that sales_summary returns alongside today's figures.
            {
              label: t("analytics.netSales"),
              value: formatMoney(analytics.netSales, "CRC"),
              delta: pctDelta(analytics.netSales, analytics.previous.netSales),
              icon: DollarSign,
            },
            {
              label: t("dashboard.totalOrders"),
              value: analytics.totalOrders.toString(),
              delta: pctDelta(analytics.totalOrders, analytics.previous.totalOrders),
              icon: ShoppingBag,
            },
            {
              label: t("dashboard.itemsSold"),
              value: analytics.totalItemsSold.toString(),
              delta: pctDelta(analytics.totalItemsSold, analytics.previous.totalItemsSold),
              icon: Coffee,
            },
            {
              label: t("dashboard.avgOrderValue"),
              value: formatMoney(analytics.averageOrderValue, "CRC"),
              delta: pctDelta(analytics.averageOrderValue, analytics.previous.averageOrderValue),
              icon: DollarSign,
            },
          ].map((metric) => {
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
                {metric.delta != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium",
                      metric.delta > 0 && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                      metric.delta < 0 && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                      metric.delta === 0 && "bg-warm-roast/10 text-expresso/60"
                    )}
                    title={t("dashboard.vsYesterday")}
                  >
                    {metric.delta > 0 ? <TrendingUp className="w-3 h-3" /> : metric.delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {metric.delta > 0 ? "+" : ""}{metric.delta}% {t("dashboard.vsYesterdayShort")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Percent change, or null when yesterday gives nothing to compare against. */
function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
