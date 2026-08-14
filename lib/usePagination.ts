import { useState } from "react";

export interface Pagination<T> {
  pageRows: T[];
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Client-side pagination over an already-loaded array. Derives everything
 * from `rows` on render rather than in an effect — see the modifier-selection
 * comment in app/admin/menu/page.tsx for why this codebase avoids syncing
 * state via useEffect when it can be computed instead.
 */
export function usePagination<T>(
  rows: T[],
  opts?: { pageSize?: number; resetKey?: string }
): Pagination<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(opts?.pageSize ?? 25);

  // Reset to page 1 whenever the caller's filter signature changes. This is
  // React's documented "adjust state during render" pattern, not an effect:
  // it runs synchronously in the same render, so there's no flash of the
  // stale page before the reset takes effect.
  const [prevResetKey, setPrevResetKey] = useState(opts?.resetKey);
  if (opts?.resetKey !== undefined && opts.resetKey !== prevResetKey) {
    setPrevResetKey(opts.resetKey);
    if (page !== 1) setPage(1);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    pageRows,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    pageCount,
    total,
    rangeStart,
    rangeEnd,
  };
}
