"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, TrendingUp, ShoppingBag, Receipt } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { useAnalytics } from "@/lib/hooks";
import { useT } from "@/lib/i18n/LanguageContext";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AnalyticsPage() {
  const t = useT();
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;

  const { data, isLoading } = useAnalytics(startStr, endStr);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("analytics.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <DatePicker date={startDate} setDate={setStartDate} placeholder={t("analytics.startDate")} className="w-40" />
          <span className="text-expresso/40">{t("common.to")}</span>
          <DatePicker date={endDate} setDate={setEndDate} placeholder={t("analytics.endDate")} className="w-40" />
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
        </div>
      ) : !data ? (
        <div className="h-64 flex items-center justify-center text-expresso/60">
          {t("analytics.noData")}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-expresso/60">{t("analytics.totalRevenue")}</p>
                  <h3 className="text-3xl font-bold text-expresso mt-2">${data.totalRevenue.toFixed(2)}</h3>
                </div>
                <div className="bg-coffee-fruit/10 p-3 rounded-xl text-coffee-fruit">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-expresso/60">{t("analytics.totalOrders")}</p>
                  <h3 className="text-3xl font-bold text-expresso mt-2">{data.totalOrders}</h3>
                </div>
                <div className="bg-warm-roast/10 p-3 rounded-xl text-warm-roast">
                  <ShoppingBag className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-expresso/60">{t("analytics.avgOrderValue")}</p>
                  <h3 className="text-3xl font-bold text-expresso mt-2">${data.averageOrderValue.toFixed(2)}</h3>
                </div>
                <div className="bg-expresso/10 p-3 rounded-xl text-expresso">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <h3 className="text-lg font-bold text-expresso mb-6">{t("analytics.revenueTrend")}</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.revenueByDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                      dx={-10}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#f4f4f5' }}
                      formatter={(value: number | string | readonly (number | string)[] | null | undefined) => {
                        if (value === null || value === undefined) return ["$0.00", "Revenue"];
                        return [`$${Number(value).toFixed(2)}`, "Revenue"];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#b92323"
                      strokeWidth={3}
                      dot={{ fill: '#b92323', strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Orders by Hour */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <h3 className="text-lg font-bold text-expresso mb-6">{t("analytics.productiveHours")}</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.ordersByHour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b" opacity={0.2} />
                    <XAxis
                      dataKey="hour"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      dx={-10}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#f4f4f5' }}
                      cursor={{ fill: '#27272a', opacity: 0.4 }}
                    />
                    <Bar
                      dataKey="orders"
                      fill="#7a1318"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Selling Items */}
          <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-warm-roast/10">
              <h3 className="text-lg font-bold text-expresso">{t("analytics.topSellingItems")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-expresso/60">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t("analytics.itemName")}</th>
                    <th className="px-6 py-4 font-medium">{t("analytics.quantitySold")}</th>
                    <th className="px-6 py-4 font-medium">{t("analytics.revenueGenerated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-roast/10">
                  {data.topItems.map((item, i) => (
                    <tr key={i} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-expresso">{item.name}</td>
                      <td className="px-6 py-4 text-expresso/60">{item.quantity} {t("analytics.units")}</td>
                      <td className="px-6 py-4 text-expresso/60">${item.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                  {data.topItems.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-expresso/60">{t("analytics.noItems")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
