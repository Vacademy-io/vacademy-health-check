// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { plansProblem } from "../src/components/products/plans.ts";

const starter = { key: "starter", name: "Starter", price_inr: 5000, credits: 100, users: 1 };
const team = { key: "team", name: "Team", price_inr: 20000, credits: 2000, users: 15 };

test("the Evalezy plans are fine", () => {
  assert.equal(plansProblem([starter, team], 12, 1), null);
  assert.equal(plansProblem(null, null, null), null);
});

test("bad plans say why", () => {
  assert.match(plansProblem([starter, starter], 12, 1) ?? "", /Two plans/);
  assert.match(plansProblem([{ ...team, users: 0 }], 12, 1) ?? "", /users/);
  assert.match(plansProblem([{ ...team, key: "Team Plan" }], 12, 1) ?? "", /id/);
  assert.match(plansProblem([{ ...team, price_inr: Number.NaN }], 12, 1) ?? "", /price/);
  assert.match(plansProblem([{ ...team, name: " " }], 12, 1) ?? "", /name/);
  assert.match(plansProblem([starter], 0, 1) ?? "", /months/);
  assert.match(plansProblem([starter], 12, -1) ?? "", /Extra credit/);
});
