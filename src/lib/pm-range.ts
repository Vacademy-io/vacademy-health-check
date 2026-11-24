// Date ranges for the PM View period pickers: a preset ("last 30 days") or a custom from → to.
// Pure functions (tests/pm-range.test.ts). Dates are YYYY-MM-DD and both ends are inclusive.

export type Period = { kind: "preset"; days: number } | { kind: "custom"; from: string; to: string };

export interface Range {
  from: string;
  to: string;
  /** Days in the range, both ends included. */
  days: number;
  /** "last 30 days" or "1 Oct 2026 – 15 Nov 2026". */
  label: string;
  custom: boolean;
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A valid custom range: real dates, from ≤ to, not in the future, at most `maxDays` long. */
export function isValidCustom(from: string, to: string, today: string, maxDays = 730): boolean {
  if (!ISO.test(from) || !ISO.test(to) || !Number.isFinite(ms(from)) || !Number.isFinite(ms(to))) return false;
  if (from > to || to > today) return false;
  return (ms(to) - ms(from)) / DAY + 1 <= maxDays;
}

export function resolvePeriod(p: Period, today: string): Range {
  if (p.kind === "custom" && isValidCustom(p.from, p.to, today)) {
    const days = Math.round((ms(p.to) - ms(p.from)) / DAY) + 1;
    return { from: p.from, to: p.to, days, label: p.from === p.to ? nice(p.from) : `${nice(p.from)} – ${nice(p.to)}`, custom: true };
  }
  const days = p.kind === "preset" ? p.days : 30;
  return { from: addDays(today, -(days - 1)), to: today, days, label: `last ${days} days`, custom: false };
}

/** The same number of days just before `r` (for "vs previous period"). */
export function previousRange(r: Range): { from: string; to: string } {
  return { from: addDays(r.from, -r.days), to: addDays(r.from, -1) };
}

/** True when the date part of `iso` falls inside the range. */
export const inRange = (iso: string | null | undefined, r: { from: string; to: string }) => {
  const d = iso?.slice(0, 10);
  return !!d && d >= r.from && d <= r.to;
};
