// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, inRange, isValidCustom, previousRange, resolvePeriod } from "../src/lib/pm-range.ts";

const TODAY = "2026-11-21";

test("a preset ends today and includes today", () => {
  const r = resolvePeriod({ kind: "preset", days: 30 }, TODAY);
  assert.deepEqual([r.from, r.to, r.days, r.label, r.custom], ["2026-10-23", TODAY, 30, "last 30 days", false]);
});

test("a custom range keeps its dates and counts both ends", () => {
  const r = resolvePeriod({ kind: "custom", from: "2026-10-01", to: "2026-10-31" }, TODAY);
  assert.deepEqual([r.from, r.to, r.days, r.custom], ["2026-10-01", "2026-10-31", 31, true]);
  assert.match(r.label, /1 Oct 2026 – 31 Oct 2026/);
});

test("an invalid custom range falls back to the last 30 days", () => {
  assert.equal(resolvePeriod({ kind: "custom", from: "2026-11-10", to: "2026-11-01" }, TODAY).custom, false);
  assert.equal(isValidCustom("2026-11-01", "2026-11-25", TODAY), false);
  assert.equal(isValidCustom("2024-01-01", "2026-11-01", TODAY), false);
  assert.equal(isValidCustom("2026-11-01", "2026-11-21", TODAY), true);
});

test("previous range is the same length just before", () => {
  assert.deepEqual(previousRange(resolvePeriod({ kind: "custom", from: "2026-11-11", to: "2026-11-20" }, TODAY)), { from: "2026-11-01", to: "2026-11-10" });
});

test("inRange compares the date part, both ends included", () => {
  const r = { from: "2026-11-01", to: "2026-11-10" };
  assert.ok(inRange("2026-11-01T00:00:00Z", r));
  assert.ok(inRange("2026-11-10T23:59:00Z", r));
  assert.ok(!inRange("2026-11-11T00:00:00Z", r));
  assert.ok(!inRange(null, r));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
