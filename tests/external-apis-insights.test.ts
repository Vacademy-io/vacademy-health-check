import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeLabel,
  dailySpendByVendor,
  daysWords,
  groupSum,
  leader,
  pctLabel,
  periodWords,
  runwayDays,
  vendorKey,
} from "../src/components/external-apis/insights.ts";
import { collapseSharedPlivo, isLow, type VendorBalance } from "../src/components/external-apis/balances.ts";
import { instituteKeyKind, keyLabel, serviceName } from "../src/components/external-apis/format.ts";

const row = (over: Partial<VendorBalance>): VendorBalance => ({
  vendor: "Plivo", account: "subaccount …1234", institute_id: "i1", institute_name: "A", status: "ok",
  kind: "account_balance", balance: 19.1, currency: "USD", spend_per_hour: null, message: null,
  checked_at: "2026-11-11T10:00:00Z", ...over,
});

test("Plivo subaccounts collapse to one shared master balance; failures stay per institute", () => {
  const exotel = row({ vendor: "Exotel", institute_id: "i3", balance: 400, currency: "INR" });
  const failed = row({ institute_id: "i9", status: "error", balance: null });
  const out = collapseSharedPlivo([exotel, row({}), row({ institute_id: "i2" }), failed]);
  assert.equal(out.length, 3);
  assert.equal(out[0].shared_by, 2);
  assert.equal(out[0].institute_id, null);
  assert.equal(out[0].balance, 19.1);
  assert.deepEqual(out.slice(1), [exotel, failed]);
  // Already folded by the server: unchanged count.
  assert.equal(collapseSharedPlivo([out[0]])[0].shared_by, 2);
  assert.deepEqual(collapseSharedPlivo([exotel]), [exotel]);
});

test("low balance thresholds per currency", () => {
  assert.equal(isLow({ status: "ok", balance: 4, currency: "USD" }), true);
  assert.equal(isLow({ status: "ok", balance: 499, currency: "inr" }), true);
  assert.equal(isLow({ status: "ok", balance: 600, currency: "INR" }), false);
  assert.equal(isLow({ status: "error", balance: 1, currency: "USD" }), false);
});

test("period change wording", () => {
  assert.equal(changeLabel(120, 100, "7 days"), "Up 20% on the 7 days before");
  assert.equal(changeLabel(50, 100, "7 days"), "Down 50% on the 7 days before");
  assert.equal(changeLabel(100, 100, "hour"), "About the same as the hour before");
  assert.equal(changeLabel(5, 0, "24 hours"), "Nothing in the 24 hours before");
  assert.equal(changeLabel(0, 0, "7 days"), null);
  assert.equal(periodWords(168), "7 days");
  assert.equal(periodWords(24), "24 hours");
});

test("runway from recorded spend", () => {
  const spend = dailySpendByVendor([
    { provider: "openrouter", cost_usd: 14 },
    { provider: "likely:openrouter", cost_usd: 7 },
    { provider: "fal", cost_usd: 0 },
  ], 168);
  assert.equal(spend.get("openrouter"), 3);
  assert.equal(runwayDays(30, spend.get("openrouter")), 10);
  assert.equal(runwayDays(30, spend.get("fal")), null);
  assert.equal(daysWords(0.5), "less than a day");
  assert.equal(daysWords(6.8), "about 6 days");
  assert.equal(vendorKey("model:OpenAI"), "openai");
});

test("leader, shares and grouping", () => {
  const top = leader([{ v: 1 }, { v: 3 }], (r) => r.v);
  assert.equal(top?.row.v, 3);
  assert.equal(pctLabel(top?.share ?? null), "75%");
  assert.equal(leader([{ v: 0 }], (r) => r.v), null);
  assert.equal(pctLabel(0.4), "under 1%");
  assert.deepEqual(groupSum([{ k: "a", n: 1 }, { k: "b", n: 5 }, { k: "a", n: 2 }], (r) => r.k, (r) => r.n),
    [{ key: "b", total: 5 }, { key: "a", total: 3 }]);
});

test("no code names on screen", () => {
  assert.equal(serviceName("ai, admin-core"), "AI service, Main app");
  assert.equal(keyLabel("OPENROUTER_API_KEY"), "Main key");
  assert.equal(keyLabel("SERPER_API_KEYS"), "Key pool");
  assert.equal(keyLabel("llm_provider_keys: Team A"), 'Stored key "Team A"');
  assert.equal(instituteKeyKind("institute_telephony_config"), "Telephony account");
});

test("status codes and WhatsApp errors in words", async () => {
  const { httpMeaning, whatsappErrorMeaning } = await import("../src/components/external-apis/insights.ts");
  assert.equal(httpMeaning(429), "Rate limited: too many requests");
  assert.equal(httpMeaning(null), "No answer: network error or our own timeout");
  assert.equal(httpMeaning(418), "Request refused");
  assert.equal(httpMeaning(599), "Vendor error");
  assert.equal(whatsappErrorMeaning("131047"), "Outside the 24-hour window: needs an approved template");
  assert.equal(whatsappErrorMeaning("999999"), "See Meta's error code list");
});
