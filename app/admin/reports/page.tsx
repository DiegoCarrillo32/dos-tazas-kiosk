"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { exportOrdersCSV } from "@/lib/queries";
import { DatePicker } from "@/components/ui/DatePicker";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Feedback";
import { useT } from "@/lib/i18n/LanguageContext";

export default function FinancialReports() {
  const t = useT();
  const toast = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!startDate || !endDate) return;
    setIsDownloading(true);
    try {
      const startStr = format(startDate, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");
      const csv = await exportOrdersCSV(startStr, endStr);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dos-tazas-report_${startStr}_to_${endStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export CSV:", err);
      toast(t("reports.failed"));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-expresso">{t("reports.title")}</h1>
        <p className="text-expresso/60 mt-1">{t("reports.subtitle")}</p>
      </div>

      <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm max-w-2xl">
        <h2 className="text-lg font-semibold text-expresso mb-4">{t("reports.exportTitle")}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-expresso/80">{t("reports.startDate")}</label>
            <DatePicker date={startDate} setDate={setStartDate} placeholder={t("reports.selectStart")} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-expresso/80">{t("reports.endDate")}</label>
            <DatePicker date={endDate} setDate={setEndDate} placeholder={t("reports.selectEnd")} />
          </div>
        </div>

        <Button
          size="lg"
          onClick={handleDownload}
          disabled={!startDate || !endDate}
          isLoading={isDownloading}
          leftIcon={!isDownloading && <Download className="w-5 h-5" />}
          className="w-full sm:w-auto"
        >
          {t("reports.downloadCSV")}
        </Button>
      </div>
    </div>
  );
}
