import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pagination as PaginationState } from "@/lib/usePagination";
import { useT } from "@/lib/i18n/LanguageContext";
import { Select } from "./Select";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Footer bar for a table card. Meant to render inside the card, after the
 * `overflow-x-auto` wrapper, so it stays fixed while the table body scrolls
 * horizontally on small screens.
 *
 * Renders nothing when the row count doesn't exceed the smallest page-size
 * option — short lists (a handful of staff, a handful of top-selling items)
 * stay exactly as they looked before pagination existed.
 */
export function Pagination<T>({
  total,
  page,
  setPage,
  pageSize,
  setPageSize,
  pageCount,
  rangeStart,
  rangeEnd,
}: PaginationState<T>) {
  const t = useT();

  if (total <= PAGE_SIZE_OPTIONS[0]) return null;

  return (
    <div className="px-4 sm:px-6 py-3 border-t border-warm-roast/10 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-expresso/60">
        {t("pagination.showing", { from: rangeStart, to: rangeEnd, total })}
      </p>
      <div className="flex items-center gap-3">
        <Select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="w-auto h-9 py-0"
          aria-label={t("pagination.perPage")}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} {t("pagination.perPage")}
            </option>
          ))}
        </Select>
        <span className="text-sm text-expresso/60 whitespace-nowrap">
          {t("pagination.pageOf", { page, pages: pageCount })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label={t("pagination.previous")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/60 hover:text-expresso disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
            aria-label={t("pagination.next")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-expresso/60 hover:text-expresso disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
