import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agoLabel,
  daysLeft,
  money,
  runwayLabel,
  sortBalances,
  totalsByCurrency,
  type VendorBalance,
} from "../src/components/external-apis/balances.ts";

const row = (over: Partial<VendorBalance>): VendorBalance => ({
  vendor: "fal.ai", account: null, institute_id: null, institute_name: null, status: "ok",
  kind: "account_balance", balance: null, currency: "USD", spend_per_hour: null, message: null,
  checked_at: "2026-11-11T10:00:00Z", ...over,
});

test("money formats per currency and survives an unknown code", () => {
  assert.equal(money(24.5, "USD"), "$24.50");
  assert.equal(money(1543.75, "inr"), "₹1,543.75");
  assert.equal(money(null, "USD"), "—");
  assert.equal(money(3, "NOTACODE"), "3.00 NOTACODE");
});

test("runway only when the vendor reports a spend rate", () => {
  assert.equal(daysLeft({ balance: 48, spend_per_hour: 1 }), 2);
  assert.equal(daysLeft({ balance: 48, spend_per_hour: 0 }), null);
  assert.equal(daysLeft({ balance: null, spend_per_hour: 1 }), null);
  assert.equal(runwayLabel(2.9), "About 2 days left at the current spend");
  assert.equal(runwayLabel(1), "About 1 day left at the current spend");
  assert.equal(runwayLabel(0.2), "Less than a day left at the current spend");
  assert.equal(runwayLabel(null), null);
});

test("lowest readable balance first, then errors, then not set up", () => {
  const sorted = sortBalances([
    row({ vendor: "RunPod", status: "not_set_up" }),
    row({ vendor: "Exotel", status: "error" }),
    row({ vendor: "Plivo", balance: 90 }),
    row({ vendor: "fal.ai", balance: 4 }),
  ]);
  assert.deepEqual(sorted.map((r) => r.vendor), ["fal.ai", "Plivo", "Exotel", "RunPod"]);
});

test("totals never mix currencies and leave out key limits and failures", () => {
  assert.deepEqual(totalsByCurrency([
    row({ balance: 10, currency: "USD" }),
    row({ balance: 5, currency: "usd" }),
    row({ balance: 100, currency: "INR" }),
    row({ balance: 50, currency: "USD", kind: "key_limit" }),
    row({ balance: null, status: "error" }),
  ]), [{ currency: "INR", total: 100, accounts: 1 }, { currency: "USD", total: 15, accounts: 2 }]);
});

test("checked-ago wording", () => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  assert.equal(agoLabel("2026-11-11T09:59:30Z", now), "just now");
  assert.equal(agoLabel("2026-11-11T09:56:00Z", now), "4 minutes ago");
  assert.equal(agoLabel("2026-11-11T08:00:00Z", now), "2 hours ago");
  assert.equal(agoLabel("not a date", now), "at an unknown time");
});
