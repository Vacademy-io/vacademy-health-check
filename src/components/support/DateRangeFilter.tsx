import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_PRESETS,
  EMPTY_DATE_RANGE,
  presetRange,
  type DatePreset,
  type DateRange,
} from "@/lib/date-range";

/**
 * Preset dropdown; the from/to inputs appear only for "Custom range". Every other preset already
 * says what it covers, so showing two date pickers alongside it was pure noise.
 *
 * <p>The leading icon is wrapped in a `div`, not a `span`: SelectTrigger carries
 * `[&>span]:line-clamp-1`, and `line-clamp` sets `display:-webkit-box`, which overrides `flex` and
 * stacks the icon above the label.
 */
export function DateRangeFilter({
  value,
  onChange,
  label = "Created",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  label?: string;
}) {
  const applyPreset = (preset: DatePreset) => {
    if (preset === "ANY") {
      onChange(EMPTY_DATE_RANGE);
    } else if (preset === "CUSTOM") {
      onChange({ ...value, preset });
    } else {
      onChange({ preset, ...presetRange(preset) });
    }
  };

  return (
    <>
      <Select value={value.preset} onValueChange={(v) => applyPreset(v as DatePreset)}>
        <SelectTrigger className="h-9 w-[9.5rem]" aria-label={`${label} date range`}>
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.preset === "CUSTOM" ? (
        <div className="flex h-9 items-center gap-1 rounded-md border px-2">
          <Input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-7 w-[8.5rem] border-0 p-1 shadow-none focus-visible:ring-0"
            aria-label={`${label} from`}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-7 w-[8.5rem] border-0 p-1 shadow-none focus-visible:ring-0"
            aria-label={`${label} until`}
          />
        </div>
      ) : null}
    </>
  );
}
