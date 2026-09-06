"use client";

import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Receipt,
  Coffee,
  Minus,
} from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { useSalesSummary, useBusinessDate } from "@/lib/hooks";
import { cn, formatMoney } from "@/lib/utils";
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
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { ChartSkeleton } from "../_components/Skeletons";

// Brand tokens as CSS-var color strings (see app/globals.css /
// tailwind.config.ts) so charts stay on-brand and flip with dark mode
// automatically, instead of the hardcoded zinc hexes this page used before.
const COLOR_GRID = "rgb(var(--warm-roast) / 0.15)";
const COLOR_AXIS = "rgb(var(--expresso) / 0.5)";
const COLOR_TOOLTIP_BG = "rgb(var(--card))";
const COLOR_TOOLTIP_BORDER = "rgb(var(--warm-roast) / 0.2)";
const COLOR_TOOLTIP_TEXT = "rgb(var(--card-foreground))";
const COLOR_LINE = "rgb(var(--coffee-fruit))";
/** The previous period, deliberately recessive — it's context, not the subject. */
const COLOR_LINE_PREV = "rgb(var(--expresso) / 0.28)";
const COLOR_BAR = "rgb(var(--warm-roast))";
const COLOR_BAR_HOVER = "rgb(var(--warm-roast) / 0.2)";

/** "YYYY-MM-DD" → a Date at local midnight (never UTC — that shifts the day). */
function parseBusinessDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function AnalyticsPage() {
  const t = useT();
  const { data: today } = useBusinessDate();

  // The range defaults to the shop's business day, not the browser's. The
  // page used to seed from `new Date()`, so an admin looking at 8pm from a
  // timezone ahead of the shop asked the RPC for tomorrow.
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const shopToday = today ? parseBusinessDate(today) : undefined;
  const effectiveEnd = endDate ?? shopToday;
  const effectiveStart = startDate ?? (shopToday ? subDays(shopToday, 29) : undefined);

  const startStr = effectiveStart ? format(effectiveStart, "yyyy-MM-dd") : undefined;
  const endStr = effectiveEnd ? format(effectiveEnd, "yyyy-MM-dd") : undefined;

  const { data, isLoading } = useSalesSummary(startStr, endStr);
  const money = (n: number) => formatMoney(n, "CRC");

  const [itemSort, setItemSort] = useState<"quantity" | "revenue">("quantity");
  const sortedItems = useMemo(() => {
    const rows = [...(data?.top_items ?? [])];
    rows.sort((a, b) =>
      itemSort === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity
    );
    return rows;
  }, [data?.top_items, itemSort]);
  const pg = usePagination(sortedItems, {
    resetKey: `${startStr}|${endStr}|${itemSort}`,
  });

  // The two series are gap-filled to the same length by the RPC, so pairing
  // them off by index compares day 1 with day 1 of the previous window.
  const trend = useMemo(
    () =>
      (data?.by_day ?? []).map((d, i) => ({
        ...d,
        prevNet: data?.previous_period.by_day[i]?.net ?? null,
      })),
    [data]
  );

  const weekdayNames = [
    t("analytics.mon"), t("analytics.tue"), t("analytics.wed"), t("analytics.thu"),
    t("analytics.fri"), t("analytics.sat"), t("analytics.sun"),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("analytics.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <DatePicker date={effectiveStart} setDate={setStartDate} placeholder={t("analytics.startDate")} className="w-full sm:w-40" />
          <span className="hidden sm:inline text-expresso/40">{t("common.to")}</span>
          <DatePicker date={effectiveEnd} setDate={setEndDate} placeholder={t("analytics.endDate")} className="w-full sm:w-40" />
        </div>
      </div>

      {isLoading || !data ? (
        <ChartSkeleton />
      ) : (
        <div className="space-y-6 animate-in fade-in-0 duration-200">
          {/* KPI cards, each against the previous window of equal length */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <KpiCard
              label={t("analytics.netSales")}
              value={money(data.net_sales)}
              delta={pctDelta(data.net_sales, data.previous_period.net_sales)}
              deltaLabel={t("analytics.vsPrevious")}
              icon={<TrendingUp className="w-6 h-6" />}
              iconClass="bg-coffee-fruit/10 text-coffee-fruit"
            />
            <KpiCard
              label={t("analytics.totalOrders")}
              value={String(data.order_count)}
              delta={pctDelta(data.order_count, data.previous_period.order_count)}
              deltaLabel={t("analytics.vsPrevious")}
              icon={<ShoppingBag className="w-6 h-6" />}
              iconClass="bg-warm-roast/10 text-warm-roast"
            />
            <KpiCard
              label={t("analytics.avgOrderValue")}
              value={money(data.average_ticket_net)}
              sub={t("analytics.avgOrderValueNote")}
              delta={pctDelta(data.average_ticket_net, data.previous_period.average_ticket_net)}
              deltaLabel={t("analytics.vsPrevious")}
              icon={<Receipt className="w-6 h-6" />}
              iconClass="bg-expresso/10 text-expresso"
            />
            <KpiCard
              label={t("analytics.itemsSold")}
              value={String(data.items_sold)}
              sub={t("analytics.basketNote", {
                items: String(data.basket.avg_items_per_order),
              })}
              delta={pctDelta(data.items_sold, data.previous_period.items_sold)}
              deltaLabel={t("analytics.vsPrevious")}
              icon={<Coffee className="w-6 h-6" />}
              iconClass="bg-warm-roast/10 text-warm-roast"
            />
          </div>

          {/* The reconciliation strip, in an order where the arithmetic closes:
              Gross − IVA − Tips = Net. Discounts are shown because they are
              already inside Net — they are what was given away to get there. */}
          <div className="bg-card p-4 sm:p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
            <h3 className="text-sm font-bold text-expresso/70 uppercase tracking-wider mb-4">
              {t("analytics.reconciliation")}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
              <MiniStat label={t("analytics.grossSales")} value={money(data.gross_sales)} />
              <MiniStat label={t("analytics.discounts")} value={"−" + money(data.discount_amount)} muted={data.discount_amount === 0} />
              <MiniStat label={t("analytics.iva")} value={"−" + money(data.tax_amount)} />
              <MiniStat label={t("analytics.tips")} value={"−" + money(data.tip_amount)} hint={t("analytics.tipsNote")} muted={data.tip_amount === 0} />
              <MiniStat label={t("analytics.netSales")} value={money(data.net_sales)} emphasis />
              <MiniStat label={t("analytics.refunds")} value={money(data.refund_total)} hint={t("analytics.refundsNote")} muted={data.refund_count === 0} />
              <MiniStat label={t("analytics.voids")} value={String(data.void_count)} muted={data.void_count === 0} />
            </div>
            {data.refund_count > 0 && (
              <p className="text-xs text-expresso/50 mt-4">
                {t("analytics.netAfterRefunds", { value: money(data.net_sales_after_refunds) })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue trend, gap-filled, with the previous window behind it */}
            <Panel title={t("analytics.revenueTrend")} subtitle={t("analytics.revenueTrendNote")}>
              <div className="h-[240px] sm:h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLOR_GRID} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      tickFormatter={(d: string) => d.slice(5)}
                      dy={10}
                      minTickGap={16}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      tickFormatter={(value) => formatMoney(value, "CRC")}
                      dx={-10}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: COLOR_TOOLTIP_BG, borderColor: COLOR_TOOLTIP_BORDER, borderRadius: "8px" }}
                      itemStyle={{ color: COLOR_TOOLTIP_TEXT }}
                      formatter={(value, name) => [
                        money(Number(value ?? 0)),
                        name === "prevNet" ? t("analytics.previousPeriod") : t("analytics.netSales"),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="prevNet"
                      stroke={COLOR_LINE_PREV}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
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
            </Panel>

            {/* Hourly shape, averaged per trading day so the chart means the
                same thing over one day and over thirty. */}
            <Panel
              title={t("analytics.productiveHours")}
              subtitle={t("analytics.productiveHoursNote", {
                days: String(data.operating_days),
              })}
            >
              <div className="h-[240px] sm:h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_hour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLOR_GRID} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      dy={10}
                      interval={1}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: COLOR_AXIS, fontSize: 12 }}
                      dx={-10}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: COLOR_TOOLTIP_BG, borderColor: COLOR_TOOLTIP_BORDER, borderRadius: "8px" }}
                      itemStyle={{ color: COLOR_TOOLTIP_TEXT }}
                      cursor={{ fill: COLOR_BAR_HOVER }}
                      labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                      formatter={(value) => [String(value ?? 0), t("analytics.ordersPerDay")]}
                    />
                    <Bar dataKey="avg_orders" fill={COLOR_BAR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekday shape — the "should we open Mondays?" question */}
            <Panel title={t("analytics.byWeekday")} subtitle={t("analytics.byWeekdayNote")}>
              <div className="space-y-2">
                {data.by_weekday.map((w) => (
                  <BarRow
                    key={w.dow}
                    label={weekdayNames[w.dow - 1]}
                    value={money(w.avg_net)}
                    meta={`${w.orders} ${t("analytics.orders")} · ${w.days} ${t("analytics.days")}`}
                    share={shareOf(w.avg_net, Math.max(...data.by_weekday.map((x) => x.avg_net), 1))}
                  />
                ))}
              </div>
            </Panel>

            {/* Payment mix — the number cash reconciliation needs */}
            <Panel title={t("analytics.paymentMix")}>
              {data.by_payment_method.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.noData")}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {data.by_payment_method.map((pm) => (
                    <div key={pm.method} className="p-4 rounded-xl bg-warm-roast/5 border border-warm-roast/10">
                      <p className="text-xs font-medium text-expresso/60 uppercase tracking-wider">{pm.method}</p>
                      <p className="text-xl font-bold text-expresso mt-1">{money(pm.total)}</p>
                      <p className="text-xs text-expresso/50 mt-0.5">{pm.count} {t("analytics.orders")}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Both of these are now ex-IVA and discount-apportioned, so they
                add up to Net Sales instead of to a fourth, unrelated number. */}
            <Panel title={t("analytics.salesByCategory")} subtitle={t("analytics.netBasisNote")}>
              {data.by_category.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.noData")}</p>
              ) : (
                <div className="space-y-2">
                  {data.by_category.map((c) => (
                    <BarRow
                      key={c.name}
                      label={c.name}
                      value={money(c.revenue)}
                      meta={`${c.quantity} ${t("analytics.units")} · ${shareOf(c.revenue, data.net_sales)}%`}
                      share={shareOf(c.revenue, data.net_sales)}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={t("analytics.salesByStaff")} subtitle={t("analytics.staffNote")}>
              {data.by_staff.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.noData")}</p>
              ) : (
                <div className="divide-y divide-warm-roast/10 -my-2">
                  {data.by_staff.map((s) => (
                    <div key={s.name} className="py-3 flex justify-between gap-3 text-sm">
                      <span className="text-expresso font-medium truncate">{s.name}</span>
                      <span className="text-expresso/70 shrink-0 text-right">
                        {money(s.net)} · {s.orders} {t("analytics.orders")}
                        {s.tips > 0 && (
                          <span className="block text-xs text-expresso/40">
                            {t("analytics.tipsCollected", { value: money(s.tips) })}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Top Selling Items */}
          <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-warm-roast/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-expresso">{t("analytics.topSellingItems")}</h3>
                <p className="text-sm text-expresso/60 mt-0.5">{t("analytics.netBasisNote")}</p>
              </div>
              <Select
                value={itemSort}
                onChange={(e) => setItemSort(e.target.value as "quantity" | "revenue")}
                aria-label={t("analytics.sortBy")}
                className="sm:w-48"
              >
                <option value="quantity">{t("analytics.sortByQuantity")}</option>
                <option value="revenue">{t("analytics.sortByRevenue")}</option>
              </Select>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full min-w-max whitespace-nowrap text-left text-sm">
                <thead className="bg-muted/40 text-expresso/60">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 font-medium">{t("analytics.itemName")}</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 font-medium">{t("analytics.quantitySold")}</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 font-medium">{t("analytics.revenueGenerated")}</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 font-medium">{t("analytics.shareOfSales")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-roast/10">
                  {pg.pageRows.map((item) => (
                    <tr key={item.name} className="hover:bg-warm-roast/5 transition-colors">
                      <td className="px-4 sm:px-6 py-3 sm:py-4 font-medium text-expresso">{item.name}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-expresso/60">{item.quantity} {t("analytics.units")}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-expresso/60">{money(item.revenue)}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-expresso/60">{shareOf(item.revenue, data.net_sales)}%</td>
                    </tr>
                  ))}
                  {sortedItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center whitespace-normal text-expresso/60">{t("analytics.noItems")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...pg} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Makes the discount reasons (incl. Club de lealtad) measurable */}
            <Panel title={t("analytics.discountsByReason")}>
              {data.by_discount_reason.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.noDiscounts")}</p>
              ) : (
                <div className="divide-y divide-warm-roast/10 -my-2">
                  {data.by_discount_reason.map((d) => (
                    <div key={d.reason} className="py-3 flex justify-between gap-3 text-sm">
                      <span className="text-expresso font-medium truncate">{d.reason}</span>
                      <span className="text-expresso/70 shrink-0">{money(d.total)} · {d.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Recorded on every order since day one and never once reported */}
            <Panel title={t("analytics.topModifiers")} subtitle={t("analytics.topModifiersNote")}>
              {data.by_modifier.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.noData")}</p>
              ) : (
                <div className="divide-y divide-warm-roast/10 -my-2">
                  {data.by_modifier.map((m) => (
                    <div key={m.name} className="py-3 flex justify-between gap-3 text-sm">
                      <span className="text-expresso font-medium truncate">{m.name}</span>
                      <span className="text-expresso/70 shrink-0">{m.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Dead menu weight — the most directly actionable list here */}
            <Panel title={t("analytics.neverSold")} subtitle={t("analytics.neverSoldNote")}>
              {data.never_sold.length === 0 ? (
                <p className="text-sm text-expresso/60">{t("analytics.everythingSold")}</p>
              ) : (
                <div className="divide-y divide-warm-roast/10 -my-2">
                  {data.never_sold.map((m) => (
                    <div key={m.name} className="py-3 flex justify-between gap-3 text-sm">
                      <span className="text-expresso font-medium truncate">{m.name}</span>
                      <span className="text-expresso/50 shrink-0">{money(m.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/** Percent change, or null when there's no baseline to compare against. */
function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function shareOf(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card p-4 sm:p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
      <div className="mb-4 sm:mb-6">
        <h3 className="text-lg font-bold text-expresso">{title}</h3>
        {subtitle && <p className="text-sm text-expresso/60 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-expresso/60">{label}</p>
          <h3 className="text-3xl font-bold text-expresso mt-2">{value}</h3>
          {delta != null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium",
                delta > 0 && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                delta < 0 && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                delta === 0 && "bg-warm-roast/10 text-expresso/60"
              )}
              title={deltaLabel}
            >
              {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {delta > 0 ? "+" : ""}{delta}%
            </span>
          )}
          {sub && <p className="text-xs text-expresso/40 mt-1">{sub}</p>}
        </div>
        <div className={cn("p-3 rounded-xl shrink-0", iconClass)}>{icon}</div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div title={hint}>
      <p className="text-xs text-expresso/50 uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          "font-bold mt-0.5",
          emphasis ? "text-xl text-coffee-fruit" : "text-lg",
          !emphasis && (muted ? "text-expresso/30" : "text-expresso")
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** A label, a figure, and a proportional bar behind it. */
function BarRow({
  label,
  value,
  meta,
  share,
}: {
  label: string;
  value: string;
  meta?: string;
  share: number;
}) {
  return (
    <div className="relative rounded-lg overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-warm-roast/10"
        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
        aria-hidden
      />
      <div className="relative flex justify-between items-baseline gap-3 px-3 py-2.5 text-sm">
        <span className="text-expresso font-medium truncate">{label}</span>
        <span className="text-expresso/70 shrink-0 text-right">
          {value}
          {meta && <span className="block text-xs text-expresso/40">{meta}</span>}
        </span>
      </div>
    </div>
  );
}
