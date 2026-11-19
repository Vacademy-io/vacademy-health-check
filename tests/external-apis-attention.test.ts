import { test } from "node:test";
import assert from "node:assert/strict";
import { failingVendors, topUpReason, topUps, topUpUrl, type AttentionBalance } from "../src/components/external-apis/attention.ts";

const bal = (over: Partial<AttentionBalance>): AttentionBalance => ({
  vendor: "OpenRouter",
  account: null,
  institute_name: null,
  status: "ok",
  kind: "account_balance",
  balance: 100,
  currency: "USD",
  message: null,
  ...over,
});

test("an account needs a top-up when empty, low, out of credits or unreadable", () => {
  assert.equal(topUpReason(bal({ balance: 0 })), "empty");
  assert.equal(topUpReason(bal({ balance: 3.2 })), "low");
  assert.equal(topUpReason(bal({ balance: 40 })), null);
  assert.equal(topUpReason(bal({ currency: "INR", balance: 450 })), "low");
  assert.equal(topUpReason(bal({ currency: "INR", balance: 900 })), null);
  assert.equal(topUpReason(bal({ status: "error", balance: null })), "unreadable");
  assert.equal(topUpReason(bal({ status: "not_set_up", balance: null })), null);
  assert.equal(topUpReason(bal({ vendor: "Sarvam", kind: "account_status", state_label: "Out of credits", balance: null })), "out_of_credits");
  assert.equal(topUpReason(bal({ vendor: "Sarvam", kind: "account_status", state_label: "Working", balance: null })), null);
});

test("top-ups are ordered by urgency and carry the vendor's billing page", () => {
  const rows = topUps([
    bal({ vendor: "fal.ai", balance: 2 }),
    bal({ vendor: "RunPod", status: "error", balance: null }),
    bal({ vendor: "Sarvam", kind: "account_status", state_label: "Out of credits", balance: null }),
    bal({ vendor: "OpenRouter", balance: 0 }),
    bal({ vendor: "Plivo", balance: 50 }),
  ]);
  assert.deepEqual(rows.map((r) => [r.row.vendor, r.why]), [
    ["OpenRouter", "empty"],
    ["Sarvam", "out_of_credits"],
    ["fal.ai", "low"],
    ["RunPod", "unreadable"],
  ]);
  assert.equal(rows[0].url, "https://openrouter.ai/settings/credits");
  assert.equal(topUpUrl("Plivo"), "https://console.plivo.com/billing/");
  assert.equal(topUpUrl("Unknown vendor"), null);
});

test("failures are grouped per vendor with a likely cause, latest first", () => {
  const vendors = failingVendors([
    { vendor: "api.sarvam.ai", http_status: 402, reason: "", failed: 7, last_at: "2026-11-18T09:00:00Z" },
    { vendor: "api.sarvam.ai", http_status: 429, reason: "", failed: 2, last_at: "2026-11-18T10:00:00Z" },
    { vendor: "api.plivo.com", http_status: 401, reason: "", failed: 1, last_at: "2026-11-17T10:00:00Z" },
    { vendor: "tts.navana.ai", http_status: null, reason: "ConnectTimeout", failed: 3, last_at: "2026-11-18T08:00:00Z" },
  ]);
  assert.deepEqual(vendors.map((v) => v.vendor), ["api.sarvam.ai", "tts.navana.ai", "api.plivo.com"]);
  assert.equal(vendors[0].failed, 9);
  assert.equal(vendors[0].last_at, "2026-11-18T10:00:00Z");
  assert.deepEqual(vendors[0].statuses, [{ label: "402", failed: 7 }, { label: "429", failed: 2 }]);
  assert.equal(vendors[0].hint, "Out of credits: top up");
  assert.equal(vendors[1].hint, "No answer: timeout or connection refused");
  assert.equal(vendors[1].statuses[0].label, "ConnectTimeout");
  assert.equal(vendors[2].hint, "Key refused: check the key");
});
