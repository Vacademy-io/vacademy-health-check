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

import { newPlans, packCreditPrice, plansNeedSync, saleState, soldFor } from "../src/components/products/plans.ts";

const sold = (key: string, price: number, credits: number, extra: Partial<{ listed: boolean; offered: boolean; months: number; name: string }> = {}) => ({
  plan_id: key, plan_key: `evalezy_${key}`, key, name: extra.name ?? key[0].toUpperCase() + key.slice(1),
  listed: extra.listed ?? true, audience_mode: "SEGMENT", offered: extra.offered ?? true,
  published: { version_id: "v", version_no: 1, currency: "INR", price_inr: price, credits, period_months: extra.months ?? 12,
    is_tax_inclusive: false, features: ["copy_check"] },
});

test("a plan sold at the form's numbers is on sale; anything else differs or is missing", () => {
  assert.equal(saleState(starter, soldFor(starter, [sold("starter", 5000, 100)]), 12), "on_sale");
  assert.equal(saleState(starter, soldFor(starter, [sold("starter", 6000, 100)]), 12), "differs");
  assert.equal(saleState(starter, soldFor(starter, [sold("starter", 5000, 100)]), 6), "differs");
  assert.equal(saleState(starter, soldFor(starter, [sold("starter", 5000, 100, { offered: false })]), 12), "not_on_sale");
  assert.equal(saleState(team, soldFor(team, [sold("starter", 5000, 100)]), 12), "not_on_sale");
  assert.equal(soldFor({ ...team, key: "big-team" }, [sold("big_team", 1, 1)])?.plan_key, "evalezy_big_team");
});

test("sync is needed for a new, changed or dropped plan only", () => {
  const both = [sold("starter", 5000, 100), sold("team", 20000, 2000)];
  assert.equal(plansNeedSync([starter, team], both, 12), false);
  assert.equal(plansNeedSync([starter], both, 12), true);
  assert.equal(plansNeedSync([starter], [sold("starter", 5000, 100), sold("team", 1, 1, { listed: false })], 12), false);
  assert.equal(plansNeedSync([starter, team], [both[0]], 12), true);
  assert.deepEqual(newPlans([starter, team], [both[0]]).map((p) => p.key), ["team"]);
});

test("plan ids start with a letter and fit a storefront key", () => {
  assert.match(plansProblem([{ ...team, key: "1yr" }], 12, 1) ?? "", /letter/);
  assert.equal(plansProblem([{ ...team, key: "big-team" }], 12, 1), null);
});

test("an extra credit costs what the smallest INR pack charges per credit", () => {
  const packs = [
    { credits: 2500, is_active: true, prices: [{ currency: "INR", amount_minor: 232500 }] },
    { credits: 500, is_active: true, prices: [{ currency: "USD", amount_minor: 500 }, { currency: "INR", amount_minor: 46500 }] },
    { credits: 50, is_active: false, prices: [{ currency: "INR", amount_minor: 4650 }] },
  ];
  assert.equal(packCreditPrice(packs), 0.93);
  assert.equal(packCreditPrice([]), null);
});
