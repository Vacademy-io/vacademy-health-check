import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  page: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  onSort?: (key: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  rowId?: (row: T) => string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  page,
  totalPages,
  totalItems,
  onPageChange,
  isLoading,
  onRowClick,
  toolbar,
  sortBy,
  sortDirection,
  onSort,
  selectable,
  selectedIds,
  onSelectionChange,
  rowId,
}: DataTableProps<T>) {
  const allPageIds = selectable && rowId ? data.map(rowId) : [];
  const allSelected = selectable && allPageIds.length > 0 && allPageIds.every((id) => selectedIds?.has(id));
  const someSelected = selectable && allPageIds.some((id) => selectedIds?.has(id));

  function toggleAll() {
    if (!onSelectionChange || !selectedIds || !rowId) return;
    const next = new Set(selectedIds);
    if (allSelected) {
      allPageIds.forEach((id) => next.delete(id));
    } else {
      allPageIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  }

  function toggleOne(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  function renderSortIcon(col: Column<T>) {
    if (!col.sortable || !onSort) return null;
    if (sortBy === col.key) {
      return sortDirection === "ASC" ? (
        <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
      );
    }
    return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
  }

  return (
    <div className="space-y-4">
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !!(someSelected && !allSelected);
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`${col.className ?? ""} ${col.sortable && onSort ? "cursor-pointer select-none" : ""}`}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  {col.header}
                  {renderSortIcon(col)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => {
                const id = selectable && rowId ? rowId(row) : "";
                const isChecked = selectable && selectedIds?.has(id);
                return (
                  <TableRow
                    key={idx}
                    className={`${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""} ${isChecked ? "bg-muted/30" : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <TableCell className="w-10">
                        <input
                          type="checkbox"
                          checked={isChecked || false}
                          onChange={() => toggleOne(id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        {col.render
                          ? col.render(row)
                          : String(row[col.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
            {totalItems !== undefined && ` (${totalItems.toLocaleString()} total)`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
