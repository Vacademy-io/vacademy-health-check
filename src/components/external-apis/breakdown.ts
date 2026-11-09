import type { SpendBreakdownRow } from "../../types/external-apis";

/** Named series a chart shows before the rest fold into "Other": the palette's validated five. */
export const MAX_SERIES = 5;
export const OTHER_KEY = "other";

export interface SpendSeries {
  /** Recharts data key. Never the raw value, which can hold dots or colons. */
  key: string;
  label: string;
  color: string;
}

export type SpendBucket = { bucket: string } & Record<string, number | string>;

export interface PivotedSpend {
  series: SpendSeries[];
  cost: SpendBucket[];
  credits: SpendBucket[];
}

/**
 * One row per time bucket with a column per series, for stacked bars. The biggest series by
 * share of cost plus share of credits keep their own colour, in that order, for both charts;
 * the rest share "Other". Colour therefore follows the series across the two charts.
 */
export function pivotSpend(
  rows: SpendBreakdownRow[],
  label: (raw: string) => string,
  max = MAX_SERIES,
): PivotedSpend {
  const totals = new Map<string, { cost: number; credits: number }>();
  for (const r of rows) {
    const t = totals.get(r.series) ?? { cost: 0, credits: 0 };
    t.cost += r.cost_usd;
    t.credits += r.credits;
    totals.set(r.series, t);
  }
  const allCost = [...totals.values()].reduce((a, t) => a + t.cost, 0);
  const allCredits = [...totals.values()].reduce((a, t) => a + t.credits, 0);
  const share = (t: { cost: number; credits: number }) =>
    (allCost ? t.cost / allCost : 0) + (allCredits ? t.credits / allCredits : 0);
  const ranked = [...totals.entries()].sort((a, b) => share(b[1]) - share(a[1]) || a[0].localeCompare(b[0]));

  const named = ranked.length > max ? ranked.slice(0, max) : ranked;
  const keyOf = new Map(named.map(([raw], i) => [raw, `s${i}`]));
  const series: SpendSeries[] = named.map(([raw], i) => ({
    key: `s${i}`,
    label: label(raw),
    color: `var(--series-${i + 1})`,
  }));
  const folded = ranked.length - named.length;
  if (folded > 0) series.push({ key: OTHER_KEY, label: `Other (${folded})`, color: "var(--series-other)" });

  const empty = () => Object.fromEntries(series.map((s) => [s.key, 0]));
  const cost = new Map<string, SpendBucket>();
  const credits = new Map<string, SpendBucket>();
  for (const r of rows) {
    const key = keyOf.get(r.series) ?? OTHER_KEY;
    for (const [map, value] of [[cost, r.cost_usd], [credits, r.credits]] as const) {
      const bucket = map.get(r.bucket) ?? ({ bucket: r.bucket, ...empty() } as SpendBucket);
      bucket[key] = (bucket[key] as number) + value;
      map.set(r.bucket, bucket);
    }
  }
  const sorted = (map: Map<string, SpendBucket>) =>
    [...map.values()].sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());
  return { series, cost: sorted(cost), credits: sorted(credits) };
}

/** The non-zero parts of one bucket, biggest first, and their total. */
export function splitOf(bucket: SpendBucket, series: SpendSeries[]) {
  const parts = series
    .map((s) => ({ series: s, value: Number(bucket[s.key]) || 0 }))
    .filter((p) => p.value !== 0)
    .sort((a, b) => b.value - a.value);
  return { parts, total: parts.reduce((a, p) => a + p.value, 0) };
}
