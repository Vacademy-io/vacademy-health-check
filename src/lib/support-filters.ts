import type { SelectedInstitute } from "@/components/support/InstituteFilter";
import { EMPTY_DATE_RANGE, type DateRange } from "@/lib/date-range";

/** Sentinel for the engineer filter's "Unassigned" option (not a real engineer id). */
export const UNASSIGNED = "__UNASSIGNED__";

/** The filter state shared by the support inbox and board. */
export interface SupportFilters {
  search: string;
  institutes: SelectedInstitute[];
  engineerId: string;
  dateRange: DateRange;
  /** Inbox only — the board's columns already are the status axis. */
  status?: string;
  overdueOnly?: boolean;
}

export const EMPTY_FILTERS: SupportFilters = {
  search: "",
  institutes: [],
  engineerId: "ALL",
  dateRange: EMPTY_DATE_RANGE,
  status: "ALL",
  overdueOnly: false,
};

/** How many filters are narrowing the list — drives the "Clear N" affordance. */
export function countActiveFilters(f: SupportFilters): number {
  return [
    !!f.search.trim(),
    f.institutes.length > 0,
    f.engineerId !== "ALL",
    f.dateRange.preset !== "ANY",
    !!f.status && f.status !== "ALL",
    !!f.overdueOnly,
  ].filter(Boolean).length;
}
