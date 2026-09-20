"use client";

import { Armchair, ShoppingBag } from "lucide-react";
import type { ServiceType } from "@/lib/types";
import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LanguageContext";

/**
 * How the order was served, and whether to charge the servicio for it.
 *
 * The type is normally settled on the Floor and only seeded here, but it
 * stays editable because the common correction — ordered to go, then sat
 * down — is discovered at the till, not on the floor. Changing it
 * re-prices the servicio, which is why this sits above the totals.
 *
 * Rendered only when the shop has table service turned on
 * (`location_settings.table_service_enabled`), the same way TipSection is
 * gated on `tip_enabled`.
 */
export function ServiceSection({
  serviceType,
  waived,
  ratePct,
  onTypeChange,
  onWaivedChange,
}: {
  serviceType: ServiceType;
  waived: boolean;
  /** The configured rate, as a percentage — for the waive label. */
  ratePct: number;
  onTypeChange: (value: ServiceType) => void;
  onWaivedChange: (value: boolean) => void;
}) {
  const t = useT();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-expresso/70 uppercase tracking-wider">
        {t("counter.serviceType")}
      </h3>

      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {(["takeaway", "table"] as ServiceType[]).map((type) => {
          const Icon = type === "takeaway" ? ShoppingBag : Armchair;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onTypeChange(type)}
              aria-pressed={serviceType === type}
              className={cn(
                "p-4 min-h-[44px] rounded-xl border flex flex-col items-center gap-3 transition-all",
                serviceType === type
                  ? "bg-coffee-fruit text-white border-transparent shadow-md"
                  : "bg-card text-expresso/80 border-warm-roast/10 hover:border-warm-roast/40"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-sm font-medium">
                {type === "takeaway" ? t("common.takeaway") : t("counter.tableService")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Only a table order has a servicio to waive, so the control
          appears with it rather than sitting there permanently disabled. */}
      {serviceType === "table" && (
        <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
          <Checkbox
            checked={waived}
            onChange={(e) => onWaivedChange(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-expresso/80">
            <span className="font-medium text-expresso">{t("counter.waiveService")}</span>
            <br />
            {t("counter.waiveServiceDesc", { pct: String(ratePct) })}
          </span>
        </label>
      )}
    </div>
  );
}
