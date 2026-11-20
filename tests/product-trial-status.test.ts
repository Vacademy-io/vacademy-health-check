// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_FILTERS, statusBadge } from "../src/components/products/trialStatus.ts";

test("every status the server sends has a badge", () => {
  assert.deepEqual(statusBadge("ON_TRIAL"), { label: "On trial", variant: "secondary" });
  assert.deepEqual(statusBadge("PAYMENT_PENDING"), { label: "Payment pending", variant: "outline" });
  assert.equal(statusBadge("NOT_ON_TRIAL").label, "No trial");
});

test("an unknown or missing status shows as text instead of breaking the table", () => {
  assert.deepEqual(statusBadge("SOMETHING_NEW"), { label: "SOMETHING_NEW", variant: "outline" });
  assert.deepEqual(statusBadge(null), { label: "-", variant: "outline" });
  assert.deepEqual(statusBadge(undefined), { label: "-", variant: "outline" });
});

test("payment pending can be filtered", () => {
  assert.ok(STATUS_FILTERS.some((f) => f.value === "PAYMENT_PENDING"));
});
