import { useState } from "react";

/**
 * Page state that goes back to the first page whenever `resetKey` changes (the time range or a
 * filter), so changing "Last 7 days" to "Last hour" never leaves you on a page that no longer exists.
 */
export function usePage(resetKey: unknown): [number, (p: number) => void] {
  const key = JSON.stringify(resetKey);
  const [state, setState] = useState({ key, page: 0 });
  const page = state.key === key ? state.page : 0;
  return [page, (p: number) => setState({ key, page: p })];
}

/** One page of an array that was loaded whole, for the shared Pager. */
export function slicePage<T>(rows: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, totalPages - 1);
  return { rows: rows.slice(safe * size, safe * size + size), totalPages, total: rows.length, page: safe };
}
