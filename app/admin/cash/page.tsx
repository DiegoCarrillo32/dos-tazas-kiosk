"use client";

import { useState } from "react";
import {
  Loader2,
  Wallet,
  PlusCircle,
  MinusCircle,
  Lock,
  Unlock,
  Download,
} from "lucide-react";
import {
  useCurrentShift,
  useRecordCashMovement,
  useRecentShifts,
  useShiftSummary,
  useLocationSettings,
} from "@/lib/hooks";
import { exportShiftsCSV } from "@/lib/queries";
import type { CashMovementType, ShiftListItem } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { OpenShiftDialog, CloseShiftDialog } from "@/components/ShiftDialogs";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Feedback";
import { ZReport } from "@/components/ZReport";
import { useT } from "@/lib/i18n/LanguageContext";

export default function CashDrawerPage() {
  const t = useT();
  const toast = useToast();
  const { data: shift, isLoading } = useCurrentShift();
  const { data: settings } = useLocationSettings();
  const { data: history = [], isLoading: historyLoading } = useRecentShifts();

  const movementMut = useRecordCashMovement();

  const [showOpen, setShowOpen] = useState(false);

  const [movementType, setMovementType] = useState<CashMovementType | null>(null);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");

  const [showClose, setShowClose] = useState(false);

  const [viewShiftId, setViewShiftId] = useState<string | null>(null);
  const { data: viewedSummary } = useShiftSummary(viewShiftId);

  const [isExporting, setIsExporting] = useState(false);

  const businessName = settings?.business_legal_name ?? undefined;

  const handleMovement = () => {
    if (!movementType) return;
    const amount = parseFloat(movementAmount) || 0;
    if (amount <= 0) return;
    if (!movementReason.trim()) {
      toast(t("cash.reasonRequired"));
      return;
    }
    movementMut.mutate(
      { type: movementType, amount, reason: movementReason.trim() },
      {
        onSuccess: () => {
          setMovementType(null);
          setMovementAmount("");
          setMovementReason("");
        },
        onError: () => toast(t("cash.errorGeneric")),
      }
    );
  };

  const handleExportShifts = async () => {
    setIsExporting(true);
    try {
      const csv = await exportShiftsCSV();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dos-tazas-shifts_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-expresso/40" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-expresso">{t("cash.title")}</h1>
          <p className="text-expresso/60 mt-1">{t("cash.subtitle")}</p>
        </div>
        {shift ? (
          <Button
            variant="secondary"
            leftIcon={<Lock className="w-4 h-4" />}
            onClick={() => setShowClose(true)}
            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            {t("cash.closeShift")}
          </Button>
        ) : (
          <Button
            leftIcon={<Unlock className="w-4 h-4" />}
            onClick={() => setShowOpen(true)}
            className="bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
          >
            {t("cash.openShift")}
          </Button>
        )}
      </div>

      {!shift ? (
        <div className="bg-card p-8 rounded-2xl border border-warm-roast/10 shadow-sm text-center">
          <Wallet className="w-12 h-12 mx-auto mb-4 text-expresso/20" />
          <h3 className="text-lg font-bold text-expresso">{t("cash.noShift")}</h3>
          <p className="text-expresso/60 mt-1 max-w-md mx-auto">{t("cash.noShiftDesc")}</p>
        </div>
      ) : (
        <>
          {/* Current shift summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label={t("cash.openingFloat")} value={formatMoney(shift.opening_float, "CRC")} />
            <StatCard label={t("cash.expectedCash")} value={formatMoney(shift.expected_cash, "CRC")} highlight />
            <StatCard label={t("cash.grossSales")} value={formatMoney(shift.sales.gross_sales, "CRC")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales breakdown */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">
                {t("cash.byPaymentMethod")}
              </h3>
              {Object.entries(shift.sales.by_payment_method ?? {}).length === 0 ? (
                <p className="text-sm text-expresso/40">{t("analytics.noData")}</p>
              ) : (
                Object.entries(shift.sales.by_payment_method).map(([method, amount]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span className="text-expresso/70 uppercase">{method}</span>
                    <span className="font-medium text-expresso">{formatMoney(amount, "CRC")}</span>
                  </div>
                ))
              )}
              <div className="border-t border-warm-roast/10 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-expresso/70">
                  <span>{t("cash.netSales")}</span>
                  <span>{formatMoney(shift.sales.net_sales, "CRC")}</span>
                </div>
                <div className="flex justify-between text-expresso/70">
                  <span>IVA</span>
                  <span>{formatMoney(shift.sales.tax_amount, "CRC")}</span>
                </div>
                <div className="flex justify-between text-expresso/70">
                  <span>{t("analytics.tips")}</span>
                  <span>{formatMoney(shift.sales.tip_amount, "CRC")}</span>
                </div>
              </div>
            </div>

            {/* Cash movements */}
            <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">
                  {t("cash.movements")}
                </h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<PlusCircle className="w-4 h-4" />} onClick={() => setMovementType("paid_in")}>
                    {t("cash.paidIn")}
                  </Button>
                  <Button size="sm" variant="secondary" leftIcon={<MinusCircle className="w-4 h-4" />} onClick={() => setMovementType("paid_out")}>
                    {t("cash.paidOut")}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {shift.movements.length === 0 ? (
                  <p className="text-sm text-expresso/40">{t("cash.noMovements")}</p>
                ) : (
                  shift.movements.map((m) => (
                    <div key={m.id} className="flex justify-between items-start text-sm border-b border-warm-roast/10 pb-2 last:border-0">
                      <div>
                        <span className={`font-medium ${m.type === "paid_out" ? "text-red-600 dark:text-red-400" : "text-expresso"}`}>
                          {m.type === "paid_in" ? t("cash.paidIn") : t("cash.paidOut")}
                        </span>
                        <p className="text-xs text-expresso/60">{m.reason}</p>
                      </div>
                      <span className={`font-medium tabular-nums ${m.type === "paid_out" ? "text-red-600 dark:text-red-400" : "text-expresso"}`}>
                        {m.type === "paid_out" ? "-" : "+"}
                        {formatMoney(m.amount, "CRC")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Shift history */}
      <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-warm-roast/10 flex items-center justify-between">
          <h3 className="text-lg font-bold text-expresso">{t("cash.shiftHistory")}</h3>
          <Button size="sm" variant="secondary" isLoading={isExporting} leftIcon={!isExporting && <Download className="w-4 h-4" />} onClick={handleExportShifts}>
            {t("cash.exportShifts")}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-expresso/60">
              <tr>
                <th className="px-6 py-3 font-medium">{t("cash.openedAt")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.openedBy")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.grossSales")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.expectedCash")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.countedCash")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.variance")}</th>
                <th className="px-6 py-3 font-medium">{t("cash.viewReport")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-roast/10">
              {historyLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-expresso/40 mx-auto" />
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-expresso/40">
                    {t("cash.noShifts")}
                  </td>
                </tr>
              ) : (
                history.map((s: ShiftListItem) => (
                  <tr key={s.id} className="hover:bg-warm-roast/5 transition-colors">
                    <td className="px-6 py-4 text-expresso">{new Date(s.opened_at).toLocaleString("es-CR")}</td>
                    <td className="px-6 py-4 text-expresso/70">{s.opened_by_name ?? "—"}</td>
                    <td className="px-6 py-4 text-expresso">{formatMoney(s.gross_sales, "CRC")}</td>
                    <td className="px-6 py-4 text-expresso/70">{s.expected_cash != null ? formatMoney(s.expected_cash, "CRC") : "—"}</td>
                    <td className="px-6 py-4 text-expresso/70">{s.counted_cash != null ? formatMoney(s.counted_cash, "CRC") : "—"}</td>
                    <td className="px-6 py-4">
                      {s.cash_variance != null ? (
                        <span className={s.cash_variance === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400 font-medium"}>
                          {s.cash_variance > 0 ? "+" : ""}
                          {formatMoney(s.cash_variance, "CRC")}
                        </span>
                      ) : (
                        <span className="text-expresso/40">{t("cash.statusOpen")}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => setViewShiftId(s.id)} className="text-coffee-fruit hover:underline font-medium">
                        {t("cash.viewReport")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open shift modal */}
      {showOpen && <OpenShiftDialog onClose={() => setShowOpen(false)} />}

      {/* Cash movement modal */}
      {movementType && (
        <Modal
          onClose={() => setMovementType(null)}
          title={movementType === "paid_in" ? t("cash.recordPaidIn") : t("cash.recordPaidOut")}
        >
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block">{t("cash.amount")}</Label>
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                min={0}
                autoFocus
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="mb-1 block">{t("cash.reason")}</Label>
              <Input
                type="text"
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder={t("cash.reasonPlaceholder")}
              />
            </div>
            <Button
              size="lg"
              className="w-full bg-coffee-fruit hover:bg-fruit-light text-white border-transparent"
              isLoading={movementMut.isPending}
              onClick={handleMovement}
            >
              {movementType === "paid_in" ? t("cash.recordPaidIn") : t("cash.recordPaidOut")}
            </Button>
          </div>
        </Modal>
      )}

      {/* Close shift modal */}
      {showClose && shift && (
        <CloseShiftDialog shift={shift} onClose={() => setShowClose(false)} />
      )}

      {/* Z-report viewer (history reprint) */}
      {viewedSummary && (
        <ZReport summary={viewedSummary} businessName={businessName} onClose={() => setViewShiftId(null)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm">
      <p className="text-sm font-medium text-expresso/60">{label}</p>
      <h3 className={`text-3xl font-bold mt-2 ${highlight ? "text-coffee-fruit" : "text-expresso"}`}>{value}</h3>
    </div>
  );
}
