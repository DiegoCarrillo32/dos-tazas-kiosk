"use client";

import { Input } from "@/components/ui/Input";
import { useT } from "@/lib/i18n/LanguageContext";

/** One-tap tip percentages, computed off the pre-tip total (subtotal + IVA). */
export function TipSection({
  tip,
  preTipTotal,
  onChange,
}: {
  tip: string;
  preTipTotal: number;
  onChange: (value: string) => void;
}) {
  const t = useT();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-expresso/60 uppercase tracking-wider">{t("counter.tip")}</h3>
      <div className="flex flex-wrap items-center gap-2">
        {[10, 15, 20].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => onChange(String(Math.round(preTipTotal * (pct / 100))))}
            className="px-4 py-2 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
          >
            {pct}%
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("")}
          className="px-4 py-2 text-sm rounded-lg bg-warm-roast/10 text-expresso/70 hover:bg-warm-roast/20 transition-colors"
        >
          {t("counter.tipNone")}
        </button>
        <Input
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          value={tip}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("counter.tipCustom")}
          className="w-32"
        />
      </div>
    </div>
  );
}
