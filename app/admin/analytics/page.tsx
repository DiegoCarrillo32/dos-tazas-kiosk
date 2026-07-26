"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { Loader2, TrendingUp, ShoppingBag, Receipt, Wallet } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { useSalesSummary, useBusinessDate } from "@/lib/hooks";
import { formatMoney } from "@/lib/utils";
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

// Brand tokens as CSS-var color strings (see app/globals.css /
// tailwind.config.ts) so charts stay on-brand and flip with dark mode
// automatically, instead of the hardcoded zinc hexes this page used before.
const COLOR_GRID = "rgb(var(--warm-roast) / 0.15)";
const COLOR_AXIS = "rgb(var(--expresso) / 0.5)";
const COLOR_TOOLTIP_BG = "rgb(var(--card))";
const COLOR_TOOLTIP_BORDER = "rgb(var(--warm-roast) / 0.2)";
const COLOR_TOOLTIP_TEXT = "rgb(var(--card-foreground))";
const COLOR_LINE = "rgb(var(--coffee-fruit))";
const COLOR_BAR = "rgb(var(--warm-roast))";
const COLOR_BAR_HOVER = "rgb(var(--warm-roast) / 0.2)";

export default function AnalyticsPage() {
  const t = useT();
  const { data: today } = useBusinessDate();
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : today;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : today;

  const { data, isLoading } = useSalesSummary(startStr, endStr);
  const money = (n: number) => formatMoney(n, "CRC");

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label={t("analytics.netSales")}
              value={money(data.net_sales)}
              icon={<TrendingUp className="w-6 h-6" />}
              iconClass="bg-coffee-fruit/10 text-coffee-fruit"
            />
            <KpiCard
              label={t("analytics.totalOrders")}
              value={String(data.order_count)}
              icon={<ShoppingBag className="w-6 h-6" />}
              iconClass="bg-warm-roast/10 text-warm-roast"
            />
            <KpiCard
              label={t("analytics.avgOrderValue")}
              value={money(data.average_ticket)}
              icon={<Receipt className="w-6 h-6" />}
              iconClass="bg-expresso/10 text-expresso"
            />
            <KpiCard
              label={t("analytics.tips")}
              value={money(data.tip_amount)}
              sub={t("analytics.tipsNote")}
              icon={<Wallet className="w-6 h-6" />}
              iconClass="bg-warm-roast/10 text-warm-roast"
            />
          </div>

          {/* Gross / IVA / discounts / refunds strip — the reconciliation view */}
          <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <MiniStat label={t("analytics.grossSales")} value={money(data.gross_sales)} />
              <MiniStat label={t("analytics.netSales")} value={money(data.net_sales)} />
              <MiniStat label="IVA" value={money(data.tax_amount)} />
              <MiniStat label={t("analytics.refunds")} value={money(data.refund_total)} muted={data.refund_count === 0} />
              <MiniStat label={t("analytics.voids")} value={String(data.void_count)} muted={data.void_count === 0} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
              <h3 className="text-lg font-bold text-expresso mb-6">{t("analytics.revenueTrend")}</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.by_day}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLOR_GRID} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      tickFormatter={(value) => formatMoney(value, "CRC")}
                      dx={-10}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: COLOR_TOOLTIP_BG, borderColor: COLOR_TOOLTIP_BORDER, borderRadius: "8px" }}
                      itemStyle={{ color: COLOR_TOOLTIP_TEXT }}
                      formatter={(value) => [money(Number(value ?? 0)), t("analytics.netSales")]}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      stroke={COLOR_LINE}
                      strokeWidth={3}
                      dot={{ fill: COLOR_LINE, strokeWidth: 2 }}
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
                  <BarChart data={data.by_hour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLOR_GRID} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      dx={-10}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: COLOR_TOOLTIP_BG, borderColor: COLOR_TOOLTIP_BORDER, borderRadius: "8px" }}
                      itemStyle={{ color: COLOR_TOOLTIP_TEXT }}
                      cursor={{ fill: COLOR_BAR_HOVER }}
                    />
                    <Bar dataKey="orders" fill={COLOR_BAR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Payment mix — the number cash reconciliation needs */}
          <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-warm-roast/10">
              <h3 className="text-lg font-bold text-expresso">{t("analytics.paymentMix")}</h3>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.by_payment_method.length === 0 ? (
                <p className="text-sm text-expresso/60 col-span-3">{t("analytics.noData")}</p>
              ) : (
                data.by_payment_method.map((pm) => (
                  <div key={pm.method} className="p-4 rounded-xl bg-warm-roast/5 border border-warm-roast/10">
                    <p className="text-xs font-semibold text-expresso/60 uppercase tracking-wider">{pm.method}</p>
                    <p className="text-xl font-bold text-expresso mt-1">{money(pm.total)}</p>
                    <p className="text-xs text-expresso/50 mt-0.5">{pm.count} {t("analytics.orders")}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By category */}
            <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-warm-roast/10">
                <h3 className="text-lg font-bold text-expresso">{t("analytics.salesByCategory")}</h3>
              </div>
              <div className="divide-y divide-warm-roast/10">
                {data.by_category.length === 0 ? (
                  <p className="p-6 text-sm text-expresso/60">{t("analytics.noData")}</p>
                ) : (
                  data.by_category.map((c) => (
                    <div key={c.name} className="px-6 py-3 flex justify-between text-sm">
                      <span className="text-expresso font-medium">{c.name}</span>
                      <span className="text-expresso/70">{money(c.revenue)} · {c.quantity} {t("analytics.units")}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* By staff */}
            <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-warm-roast/10">
                <h3 className="text-lg font-bold text-expresso">{t("analytics.salesByStaff")}</h3>
              </div>
              <div className="divide-y divide-warm-roast/10">
                {data.by_staff.length === 0 ? (
                  <p className="p-6 text-sm text-expresso/60">{t("analytics.noData")}</p>
                ) : (
                  data.by_staff.map((s) => (
                    <div key={s.name} className="px-6 py-3 flex justify-between text-sm">
                      <span className="text-expresso font-medium">{s.name}</span>
                      <span className="text-expresso/70">{money(s.gross)} · {s.orders} {t("analytics.orders")}</span>
                    </div>
                  ))
                )}
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
                  {data.top_items.map((item, i) => (
                    <tr key={i} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-expresso">{item.name}</td>
                      <td className="px-6 py-4 text-expresso/60">{item.quantity} {t("analytics.units")}</td>
                      <td className="px-6 py-4 text-expresso/60">{money(item.revenue)}</td>
                    </tr>
                  ))}
                  {data.top_items.length === 0 && (
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

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-expresso/60">{label}</p>
          <h3 className="text-3xl font-bold text-expresso mt-2">{value}</h3>
          {sub && <p className="text-xs text-expresso/40 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-xl ${iconClass}`}>{icon}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs text-expresso/50 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${muted ? "text-expresso/30" : "text-expresso"}`}>{value}</p>
    </div>
  );
}
