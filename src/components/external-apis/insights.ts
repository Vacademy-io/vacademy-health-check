// The arithmetic behind each tab's summary: shares, period changes, rates and runway.
// No imports, so the Node tests can load this file directly.

/** part as a percentage of whole, or null when there is no whole to compare against. */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

export const pctLabel = (p: number | null): string => {
  if (p == null) return "—";
  if (p > 0 && p < 1) return "under 1%";
  if (p < 100 && p > 99) return "over 99%";
  return `${Math.round(p)}%`;
};

/** "up 24%" / "down 10%" against the previous window of the same length. */
export const changeLabel = (current: number, previous: number, period: string): string | null => {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return `Nothing in the ${period} before`;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return `About the same as the ${period} before`;
  return `${change > 0 ? "Up" : "Down"} ${Math.round(Math.abs(change))}% on the ${period} before`;
};

/** "7 days", "24 hours", "hour": the window in words, for "the 7 days before". */
export const periodWords = (hours: number): string => {
  if (hours === 1) return "hour";
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
};

/** A vendor value without the "likely:" or "model:" prefix the queries add, lowercased. */
export const vendorKey = (raw: string): string => raw.replace(/^(likely|model):/, "").toLowerCase();

/** Recorded vendor cost per day, by vendor key, over a window of `hours`. */
export const dailySpendByVendor = (
  rows: Array<{ provider: string; cost_usd: number }>,
  hours: number,
): Map<string, number> => {
  const days = hours / 24;
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = vendorKey(r.provider);
    out.set(key, (out.get(key) ?? 0) + r.cost_usd / days);
  }
  return out;
};

/** Days a balance lasts at a daily spend; null when there is no spend to divide by. */
export const runwayDays = (balance: number | null, perDay: number | null | undefined): number | null =>
  balance != null && perDay != null && perDay > 0 ? balance / perDay : null;

export const daysWords = (days: number): string => {
  if (days < 1) return "less than a day";
  if (days > 365) return "more than a year";
  const whole = Math.floor(days);
  return `about ${whole} day${whole === 1 ? "" : "s"}`;
};

/** The largest entry by `value`, and its share of the total. */
export const leader = <T>(rows: T[], value: (r: T) => number): { row: T; share: number | null } | null => {
  let best: T | null = null;
  let total = 0;
  for (const r of rows) {
    const v = value(r);
    total += v;
    if (best == null || v > value(best)) best = r;
  }
  return best == null || value(best) <= 0 ? null : { row: best, share: pct(value(best), total) };
};

/** Sum `value` over rows grouped by `key`, largest first. */
export const groupSum = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Array<{ key: string; total: number }> => {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(key(r), (totals.get(key(r)) ?? 0) + value(r));
  return [...totals].map(([k, total]) => ({ key: k, total })).sort((a, b) => b.total - a.total);
};

export const minutes = (seconds: number): string => {
  const m = seconds / 60;
  return m >= 100 ? Math.round(m).toLocaleString("en-US") : m.toFixed(m < 10 ? 1 : 0);
};

/** Telephony statuses that mean the call is over, and of those, the one where someone talked. */
export const ENDED_CALL_STATUSES = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELLED"];
export const CONNECTED_CALL_STATUS = "COMPLETED";
