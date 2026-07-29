"use client";

import { Printer, X } from "lucide-react";
import type { Order, OrderItem, LocationSettings } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * Thermal-printer-friendly receipt for a completed (or completing) order.
 * Renders inside a modal; the `.receipt-print-area` is the only thing that
 * survives `window.print()` (see the @media print rules in globals.css).
 */
export function Receipt({
  order,
  settings,
  onClose,
  provisional,
}: {
  order: Order;
  settings: LocationSettings | null;
  onClose: () => void;
  /** Set when this order hasn't actually reached the server yet — the sale
   * happened (money in the drawer), but syncing it is still queued. */
  provisional?: { offlineRef: string };
}) {
  const t = useT();
  const currency = settings?.currency ?? "CRC";
  const money = (n: number | string | null | undefined) =>
    formatMoney(Number(n ?? 0), currency);
  const taxPct = Math.round(Number(order.tax_rate ?? 0.13) * 100);
  const items = order.order_items ?? [];

  const discount = Number(order.discount_amount ?? 0);
  // The list price of the lines above: subtotal and tax are stored net of
  // the discount, so adding it back recovers what the items came to.
  const grossItems = Number(order.subtotal) + Number(order.tax_amount) + discount;

  const businessName = settings?.business_legal_name?.trim() || "Dos Tazas";
  const dateStr = new Date(order.created_at).toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handlePrint = () => window.print();

  return (
    <Sheet onClose={onClose} maxHeight="90vh" wrapperClassName="no-print">
        {/* Receipt body — the only part that prints */}
        <div className="receipt-print-area overflow-y-auto p-6 font-mono text-[13px] leading-snug text-expresso">
          <div className="text-center space-y-0.5 mb-3">
            <div className="font-display text-xl tracking-wide" style={{ fontFamily: "'Titan One', cursive" }}>
              {businessName}
            </div>
            {settings?.address && <div className="text-[11px]">{settings.address}</div>}
            {settings?.phone && <div className="text-[11px]">Tel: {settings.phone}</div>}
            {settings?.tax_id && <div className="text-[11px]">Céd. Jurídica: {settings.tax_id}</div>}
          </div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          <div className="flex justify-between">
            <span>
              {provisional
                ? `${t("receipt.provisionalRef")}: ${provisional.offlineRef}`
                : `${t("receipt.order")} #${order.order_number ?? order.id.slice(0, 8)}`}
            </span>
            <span>{dateStr}</span>
          </div>
          <div>{order.table?.name ? `${t("receipt.table")}: ${order.table.name}` : t("receipt.takeaway")}</div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          {/* Items */}
          <div className="space-y-1.5">
            {items.map((item: OrderItem) => (
              <div key={item.id}>
                <div className="flex justify-between gap-2">
                  <span>
                    {item.quantity}× {item.menu_item?.name ?? "Item"}
                  </span>
                  <span className="tabular-nums">{money(item.total_price)}</span>
                </div>
                {(item.modifiers ?? []).length > 0 && (
                  <div className="pl-4 text-[11px] text-expresso/70">
                    {(item.modifiers ?? []).map((m) => m.name).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          {/* Totals. `subtotal` and `tax_amount` are already net of any
              discount, so a discounted receipt opens with the list price of
              the lines printed above and shows what came off — otherwise the
              column would not add up to the total. */}
          <div className="space-y-0.5">
            {discount > 0 && (
              <>
                <Row label={t("receipt.itemsTotal")} value={money(grossItems)} />
                <Row
                  label={
                    t("receipt.discount") +
                    (order.discount_reason ? ` (${order.discount_reason})` : "")
                  }
                  value={"-" + money(discount)}
                />
              </>
            )}
            <Row label={t("receipt.subtotal")} value={money(order.subtotal)} />
            <Row label={`IVA (${taxPct}%)`} value={money(order.tax_amount)} />
            {Number(order.tip_amount) > 0 && (
              <Row label={t("receipt.tip")} value={money(order.tip_amount)} />
            )}
            <div className="flex justify-between font-bold text-[15px] pt-1 mt-1 border-t border-expresso/40">
              <span>{t("receipt.total")}</span>
              <span className="tabular-nums">{money(order.total_amount)}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-expresso/40 my-2" />

          {/* Payment */}
          <div className="space-y-0.5">
            <Row
              label={t("receipt.payment")}
              value={
                order.payment_method === "sinpe"
                  ? "SINPE"
                  : order.payment_method
                    ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
                    : "—"
              }
            />
            {order.payment_reference && <Row label={t("receipt.reference")} value={order.payment_reference} />}
            {order.payment_method === "cash" && order.amount_tendered != null && (
              <>
                <Row label={t("receipt.cash")} value={money(order.amount_tendered)} />
                <Row label={t("receipt.change")} value={money(order.change_due)} />
              </>
            )}
          </div>

          {/* Fiscal customer block */}
          {order.customer_name && (
            <>
              <div className="border-t border-dashed border-expresso/40 my-2" />
              <div className="space-y-0.5">
                <div className="text-center text-[11px] font-bold">{t("receipt.invoice")}</div>
                <Row label={t("receipt.invoiceName")} value={order.customer_name} />
                {order.customer_id && <Row label={t("receipt.invoiceCedula")} value={order.customer_id} />}
                {order.customer_email && <Row label={t("receipt.invoiceEmail")} value={order.customer_email} />}
              </div>
            </>
          )}

          {provisional && (
            <>
              <div className="border-t border-dashed border-expresso/40 my-2" />
              <div className="border border-expresso/60 rounded p-2 text-center text-[11px] font-bold leading-snug">
                {t("receipt.provisionalTitle")}
                <div className="font-normal mt-0.5">{t("receipt.provisionalBody")}</div>
              </div>
            </>
          )}

          <div className="border-t border-dashed border-expresso/40 my-2" />
          <div className="text-center text-[11px] whitespace-pre-line">
            {settings?.receipt_footer?.trim() || t("receipt.footer")}
          </div>
        </div>

        {/* Actions — hidden when printing */}
        <div className="shrink-0 p-4 border-t border-warm-roast/10 bg-card flex gap-3 no-print">
          <Button variant="secondary" onClick={onClose} className="flex-1" leftIcon={<X className="w-4 h-4" />}>
            {t("receipt.close")}
          </Button>
          <Button
            onClick={handlePrint}
            className="flex-1 bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
            leftIcon={<Printer className="w-4 h-4" />}
          >
            {t("receipt.print")}
          </Button>
        </div>
    </Sheet>
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
