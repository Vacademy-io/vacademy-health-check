import { AlertTriangle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InstituteFilter } from "@/components/support/InstituteFilter";
import { DateRangeFilter } from "@/components/support/DateRangeFilter";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  UNASSIGNED,
  type SupportFilters,
} from "@/lib/support-filters";
import type { SupportEngineerDto, TicketStatus } from "@/services/support-api";

const STATUS_FILTER_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting on customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

/**
 * The shared inbox/board filter row. Both pages render the same controls in the same order, so
 * switching views doesn't move the toolbar under you. Status and the overdue toggle are opt-in —
 * the board omits them because its columns are the status axis.
 */
export function SupportFilterBar({
  value,
  onChange,
  engineers,
  showStatus = false,
  showOverdue = false,
}: {
  value: SupportFilters;
  onChange: (next: SupportFilters) => void;
  engineers: SupportEngineerDto[];
  showStatus?: boolean;
  showOverdue?: boolean;
}) {
  const set = <K extends keyof SupportFilters>(key: K, v: SupportFilters[K]) =>
    onChange({ ...value, [key]: v });

  const activeCount = countActiveFilters(value);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Search by title…"
          aria-label="Search tickets by title"
          className="h-9 w-56 pl-8"
        />
      </div>

      <InstituteFilter value={value.institutes} onChange={(v) => set("institutes", v)} />

      {showStatus ? (
        <Select value={value.status ?? "ALL"} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="h-9 w-[10.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={value.engineerId} onValueChange={(v) => set("engineerId", v)}>
        <SelectTrigger className="h-9 w-[10.5rem]" aria-label="Filter by engineer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All engineers</SelectItem>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {engineers.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateRangeFilter value={value.dateRange} onChange={(v) => set("dateRange", v)} />

      {showOverdue ? (
        <Button
          variant={value.overdueOnly ? "default" : "outline"}
          size="sm"
          className="h-9"
          aria-pressed={!!value.overdueOnly}
          onClick={() => set("overdueOnly", !value.overdueOnly)}
        >
          <AlertTriangle className="mr-1.5 h-4 w-4" /> Overdue
        </Button>
      ) : null}

      {activeCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange({ ...EMPTY_FILTERS, status: showStatus ? "ALL" : undefined })}
        >
          <X className="mr-1 h-4 w-4" />
          Clear {activeCount}
        </Button>
      ) : null}
    </div>
  );
}
