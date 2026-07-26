"use client";

import { Printer, X } from "lucide-react";
import type { ShiftSummary } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * Printable shift report — the X-report (open shift, live snapshot) and
 * Z-report (closed shift, final count) share this same view. Follows the
 * same 80mm-thermal-friendly layout as components/Receipt.tsx and reuses
 * its `.receipt-print-area` / `.no-print` isolation from globals.css.
 */
export function ZReport({
  summary,
  businessName,
  onClose,
}: {
  summary: ShiftSummary;
  businessName?: string;
  onClose: () => void;
}) {
  const t = useT();
  const money = (n: number | string | null | undefined) =>
    formatMoney(Number(n ?? 0), "CRC");
  const isClosed = summary.status === "closed";

  const fmtDateTime = (s: string | null) =>
    s
      ? new Date(s).toLocaleString("es-CR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const variance = summary.cash_variance;
  const varianceLabel =
    variance == null
      ? null
      : variance > 0
        ? t("cash.over")
        : variance < 0
          ? t("cash.short")
          : t("cash.balanced");

  const methods = Object.entries(summary.sales.by_payment_method ?? {});

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center no-print">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-warm-roast/10 shadow-xl max-h-[90vh] flex flex-col">
        <div className="receipt-print-area overflow-y-auto p-6 font-mono text-[13px] leading-snug text-expresso">
          <div className="text-center space-y-0.5 mb-3">
            <div className="font-display text-xl tracking-wide" style={{ fontFamily: "'Titan One', cursive" }}>
              {businessName?.trim() || "Dos Tazas"}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider">
              {isClosed ? t("cash.zReport") : t("cash.currentShift")}
            </div>
          </div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          <div className="space-y-0.5">
            <Row label={t("cash.openedAt")} value={fmtDateTime(summary.opened_at)} />
            {summary.opened_by_name && <Row label={t("cash.openedBy")} value={summary.opened_by_name} />}
            {isClosed && (
              <>
                <Row label={t("cash.closeShift")} value={fmtDateTime(summary.closed_at)} />
                {summary.closed_by_name && <Row label="—" value={summary.closed_by_name} />}
              </>
            )}
          </div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          {/* Sales figures */}
          <div className="space-y-0.5">
            <Row label={t("cash.orderCount")} value={String(summary.sales.order_count)} />
            <Row label={t("cash.grossSales")} value={money(summary.sales.gross_sales)} />
            <Row label={t("cash.netSales")} value={money(summary.sales.net_sales)} />
            <Row label="IVA" value={money(summary.sales.tax_amount)} />
            <Row label={t("analytics.tips")} value={money(summary.sales.tip_amount)} />
            {summary.sales.refund_count > 0 && (
              <Row label={t("cash.refundCount")} value={`${summary.sales.refund_count} · ${money(summary.sales.refund_total)}`} />
            )}
            {summary.sales.void_count > 0 && (
              <Row label={t("cash.voidCount")} value={String(summary.sales.void_count)} />
            )}
          </div>

          {methods.length > 0 && (
            <>
              <div className="border-t border-dashed border-expresso/40 my-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider mb-1">
                {t("cash.byPaymentMethod")}
              </div>
              <div className="space-y-0.5">
                {methods.map(([method, total]) => (
                  <Row key={method} label={method.toUpperCase()} value={money(total)} />
                ))}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-expresso/40 my-2" />

          {/* Cash reconciliation */}
          <div className="space-y-0.5">
            <Row label={t("cash.openingFloat")} value={money(summary.opening_float)} />
            <Row label={t("counter.cash")} value={money(summary.cash_sales)} />
            {summary.cash_refunds > 0 && <Row label={t("analytics.refunds")} value={"-" + money(summary.cash_refunds)} />}
            {summary.paid_in > 0 && <Row label={t("cash.paidIn")} value={money(summary.paid_in)} />}
            {summary.paid_out > 0 && <Row label={t("cash.paidOut")} value={"-" + money(summary.paid_out)} />}
            <div className="flex justify-between font-bold pt-1 mt-1 border-t border-expresso/40">
              <span>{t("cash.expectedCash")}</span>
              <span className="tabular-nums">{money(summary.expected_cash)}</span>
            </div>
            {summary.counted_cash != null && (
              <>
                <Row label={t("cash.countedCash")} value={money(summary.counted_cash)} />
                <div
                  className={`flex justify-between font-bold text-[15px] pt-1 mt-1 border-t border-expresso/40 ${
                    variance != null && variance !== 0 ? "text-red-600" : ""
                  }`}
                >
                  <span>
                    {t("cash.variance")} {varianceLabel ? `(${varianceLabel})` : ""}
                  </span>
                  <span className="tabular-nums">
                    {variance != null ? (variance > 0 ? "+" : "") + money(variance) : "—"}
                  </span>
                </div>
              </>
            )}
          </div>

          {summary.movements.length > 0 && (
            <>
              <div className="border-t border-dashed border-expresso/40 my-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider mb-1">
                {t("cash.movements")}
              </div>
              <div className="space-y-1">
                {summary.movements.map((m) => (
                  <div key={m.id} className="flex justify-between gap-2 text-[12px]">
                    <span className="text-expresso/70">
                      {m.type === "paid_in" ? t("cash.paidIn") : t("cash.paidOut")} — {m.reason}
                    </span>
                    <span className="tabular-nums">
                      {m.type === "paid_out" ? "-" : ""}
                      {money(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {summary.closing_note && (
            <>
              <div className="border-t border-dashed border-expresso/40 my-2" />
              <div className="text-[12px] whitespace-pre-line">{summary.closing_note}</div>
            </>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-warm-roast/10 bg-card flex gap-3 no-print">
          <Button variant="secondary" onClick={onClose} className="flex-1" leftIcon={<X className="w-4 h-4" />}>
            {t("receipt.close")}
          </Button>
          <Button
            onClick={handlePrint}
            className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
            leftIcon={<Printer className="w-4 h-4" />}
          >
            {t("cash.printReport")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-expresso/70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
