import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, isValidCustom, type Period } from "@/lib/pm-range";

/**
 * Preset periods ("30 days") plus Custom, which shows a from → to pair of dates. The custom range
 * applies as soon as both dates are valid (from ≤ to, not in the future, at most 2 years).
 */
export function PeriodPicker({ presets, value, onChange, today }: { presets: readonly number[]; value: Period; onChange: (p: Period) => void; today: string }) {
  const [from, setFrom] = useState(value.kind === "custom" ? value.from : addDays(today, -29));
  const [to, setTo] = useState(value.kind === "custom" ? value.to : today);
  const custom = value.kind === "custom";
  const valid = isValidCustom(from, to, today);

  const setDates = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    if (isValidCustom(f, t, today)) onChange({ kind: "custom", from: f, to: t });
  };
  const btn = (active: boolean) => cn("rounded px-3 py-1 text-xs font-medium", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Period">
        {presets.map((d) => (
          <button key={d} type="button" aria-pressed={!custom && value.days === d} onClick={() => onChange({ kind: "preset", days: d })} className={btn(!custom && value.days === d)}>
            {d} days
          </button>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setDates(from, to)} className={cn(btn(custom), "inline-flex items-center gap-1")}>
          <CalendarRange className="h-3.5 w-3.5" /> Custom
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" value={from} max={to || today} onChange={(e) => setDates(e.target.value, to)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="From date" />
          <span className="text-muted-foreground">to</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setDates(from, e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="To date" />
          {!valid && <span className="text-xs text-red-600">Pick a start before the end, up to today (max 2 years)</span>}
        </div>
      )}
    </div>
  );
}
