"use client";

import { BanknoteIcon as Banknote, CreditCard, Smartphone } from "lucide-react";
import type { PaymentMethod } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { formatMoney } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

export function PaymentSection({
  paymentMethod,
  onSelectMethod,
  sinpeRef,
  onSinpeRefChange,
  tendered,
  onTenderedChange,
  totalDue,
  changeDue,
  currency,
}: {
  paymentMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
  sinpeRef: string;
  onSinpeRefChange: (value: string) => void;
  tendered: string;
  onTenderedChange: (value: string) => void;
  totalDue: number;
  changeDue: number;
  currency: string;
}) {
  const t = useT();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.paymentMethod")}</h3>
      <div className="grid grid-cols-3 gap-4">
        {(["card", "cash", "sinpe"] as PaymentMethod[]).map((method) => {
          const Icon = method === "card" ? CreditCard : method === "cash" ? Banknote : Smartphone;
          const label =
            method === "card" ? t("counter.card") :
            method === "cash" ? t("counter.cash") :
            "SINPE";
          return (
            <button
              key={method}
              onClick={() => onSelectMethod(method)}
              className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                paymentMethod === method
                  ? "bg-coffee-fruit text-white border-transparent shadow-md"
                  : "bg-card text-expresso/80 border-warm-roast/10 hover:border-warm-roast/40"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="font-medium text-sm">{label}</span>
            </button>
          );
        })}
      </div>
      {paymentMethod === "sinpe" && (
        <div className="mt-4 bg-card p-4 rounded-xl border border-warm-roast/10">
          <Label className="mb-2 block">{t("counter.referenceNumber")}</Label>
          <Input type="text" value={sinpeRef} onChange={(e) => onSinpeRefChange(e.target.value)} placeholder={t("counter.enterSinpeRef")} />
        </div>
      )}
      {paymentMethod === "cash" && (
        <div className="mt-4 bg-card p-4 rounded-xl border border-warm-roast/10 space-y-3">
          <Label className="block">{t("counter.amountTendered")}</Label>
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            value={tendered}
            onChange={(e) => onTenderedChange(e.target.value)}
            placeholder={String(Math.round(totalDue))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onTenderedChange(String(Math.round(totalDue)))}
              className="px-3 py-1.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
            >
              {t("counter.exact")}
            </button>
            {[1000, 2000, 5000, 10000]
              .filter((amt) => amt >= totalDue)
              .slice(0, 3)
              .map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => onTenderedChange(String(amt))}
                  className="px-3 py-1.5 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
                >
                  {formatMoney(amt, currency)}
                </button>
              ))}
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-warm-roast/10">
            <span className="text-sm font-medium text-expresso/60">{t("counter.changeDue")}</span>
            <span className={`text-lg font-bold ${changeDue < 0 ? "text-red-500" : "text-expresso"}`}>
              {formatMoney(changeDue < 0 ? 0 : changeDue, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
