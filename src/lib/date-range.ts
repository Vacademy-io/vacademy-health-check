export const DATE_PRESETS = [
  { value: "ANY", label: "Any time" },
  { value: "TODAY", label: "Today" },
  { value: "7D", label: "Last 7 days" },
  { value: "30D", label: "Last 30 days" },
  { value: "90D", label: "Last 90 days" },
  { value: "CUSTOM", label: "Custom range" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

/** The `from`/`to` halves are the raw yyyy-MM-dd values of the two date inputs. */
export interface DateRange {
  preset: DatePreset;
  from: string;
  to: string;
}

export const EMPTY_DATE_RANGE: DateRange = { preset: "ANY", from: "", to: "" };

export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = toDateInputValue(today);
  const days = preset === "TODAY" ? 0 : preset === "7D" ? 7 : preset === "30D" ? 30 : 90;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: toDateInputValue(from), to };
}

/**
 * Turn a picked range into the ISO instants the tickets API expects. The bounds are widened to
 * whole local days — a user picking "5 Aug" means all of the 5th in their own timezone, not
 * midnight UTC — and the API compares them against the ticket's creation time.
 */
export function toCreatedParams(range: DateRange): { createdFrom?: string; createdTo?: string } {
  return {
    createdFrom: range.from ? new Date(`${range.from}T00:00:00`).toISOString() : undefined,
    createdTo: range.to ? new Date(`${range.to}T23:59:59.999`).toISOString() : undefined,
  };
}
