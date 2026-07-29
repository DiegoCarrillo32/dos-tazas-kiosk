"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useT } from "@/lib/i18n/LanguageContext";

export function InvoiceSection({
  needsInvoice,
  onNeedsInvoiceChange,
  invoiceName,
  onInvoiceNameChange,
  invoiceId,
  onInvoiceIdChange,
  invoiceEmail,
  onInvoiceEmailChange,
}: {
  needsInvoice: boolean;
  onNeedsInvoiceChange: (checked: boolean) => void;
  invoiceName: string;
  onInvoiceNameChange: (value: string) => void;
  invoiceId: string;
  onInvoiceIdChange: (value: string) => void;
  invoiceEmail: string;
  onInvoiceEmailChange: (value: string) => void;
}) {
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.electronicInvoice")}</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={needsInvoice} onChange={(e) => onNeedsInvoiceChange(e.target.checked)} />
          <span className="text-sm font-medium text-expresso/80">{t("counter.requestInvoice")}</span>
        </label>
      </div>
      {needsInvoice && (
        <div className="bg-card p-5 rounded-xl border border-warm-roast/10 space-y-4">
          <div>
            <Label className="mb-1 block">{t("counter.fullName")}</Label>
            <Input type="text" value={invoiceName} onChange={(e) => onInvoiceNameChange(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">{t("counter.idNumber")}</Label>
            <Input type="text" value={invoiceId} onChange={(e) => onInvoiceIdChange(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">{t("counter.email")}</Label>
            <Input type="email" value={invoiceEmail} onChange={(e) => onInvoiceEmailChange(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}
