import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client-side paging for a list. The page goes back to the first whenever `resetKey` changes
 * (filters, search, sort), and is clamped if the list shrinks.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePaged<T>(list: T[], pageSize: number, resetKey = "") {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = state.key === resetKey ? Math.min(state.page, pages - 1) : 0;
  return {
    page,
    pages,
    total: list.length,
    pageSize,
    items: list.slice(page * pageSize, page * pageSize + pageSize),
    setPage: (p: number) => setState({ key: resetKey, page: Math.max(0, Math.min(p, pages - 1)) }),
  };
}

export function Pager({ page, pages, total, pageSize, setPage, noun = "rows" }: { page: number; pages: number; total: number; pageSize: number; setPage: (p: number) => void; noun?: string }) {
  if (total <= pageSize) return total > 0 ? <p className="px-1 text-xs text-muted-foreground">{total} {noun}</p> : null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          Page {page + 1} of {pages}
        </span>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
