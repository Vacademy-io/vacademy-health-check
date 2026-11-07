import test from "node:test";
import assert from "node:assert/strict";
import { OTHER_KEY, pivotSpend, splitOf } from "../src/components/external-apis/breakdown.ts";

const row = (bucket: string, series: string, cost_usd: number, credits: number) => ({ bucket, series, cost_usd, credits });
const name = (raw: string) => raw.toUpperCase();

test("each bucket gets a column per series, zero where it had none", () => {
  const p = pivotSpend([row("2026-11-01", "a", 2, 10), row("2026-11-02", "b", 1, 5)], name);

  assert.deepEqual(p.series.map((s) => s.label), ["A", "B"]);
  assert.deepEqual(p.cost, [
    { bucket: "2026-11-01", s0: 2, s1: 0 },
    { bucket: "2026-11-02", s0: 0, s1: 1 },
  ]);
  assert.deepEqual(p.credits[1], { bucket: "2026-11-02", s0: 0, s1: 5 });
});

test("the biggest series keep the first colours, by cost and credits together", () => {
  const p = pivotSpend([row("d", "cheap", 0.1, 1), row("d", "credit-heavy", 0, 200), row("d", "pricey", 5, 1)], name);

  assert.deepEqual(p.series.map((s) => s.label), ["CREDIT-HEAVY", "PRICEY", "CHEAP"]);
  assert.equal(p.series[0].color, "var(--series-1)");
});

test("past five series the rest fold into Other, which says how many", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g"].map((s, i) => row("d", s, 7 - i, 0));
  const p = pivotSpend(rows, name);

  assert.equal(p.series.length, 6);
  assert.deepEqual(p.series[5], { key: OTHER_KEY, label: "Other (2)", color: "var(--series-other)" });
  assert.equal(p.cost[0][OTHER_KEY], 2 + 1);
});

test("exactly five series need no Other", () => {
  const p = pivotSpend(["a", "b", "c", "d", "e"].map((s) => row("d", s, 1, 1)), name);

  assert.ok(!p.series.some((s) => s.key === OTHER_KEY));
});

test("buckets come out in time order and series keys never use the raw value", () => {
  const p = pivotSpend([row("2026-11-03T00:00:00Z", "likely:openrouter.ai", 1, 1), row("2026-11-01T00:00:00Z", "x", 1, 1)], (s) => s);

  assert.deepEqual(p.cost.map((b) => b.bucket), ["2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z"]);
  assert.ok(p.series.every((s) => /^s\d$|^other$/.test(s.key)));
});

test("no rows, no series", () => {
  assert.deepEqual(pivotSpend([], name), { series: [], cost: [], credits: [] });
});

test("splitOf lists the non-zero parts biggest first with their total", () => {
  const p = pivotSpend([row("d", "a", 1, 0), row("d", "b", 3, 0), row("d", "c", 0, 9)], name);
  const { parts, total } = splitOf(p.cost[0], p.series);

  assert.deepEqual(parts.map((x) => [x.series.label, x.value]), [["B", 3], ["A", 1]]);
  assert.equal(total, 4);
});
