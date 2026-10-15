// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveWireModel,
  effectiveStatus,
  formatPeriod,
  looksLikeAnthropicKey,
  normalizeKeysResponse,
  spendState,
  toNumber,
  usableKeyCount,
  validateKeyForm,
  type KeyFormValues,
} from "../src/lib/llm-keys.ts";
import { isImageModel, isImageUseCase } from "../src/lib/image-use-cases.ts";
import type { LlmKeyView } from "../src/types/llm-keys.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const LATER = "2026-10-15T13:00:00Z";
const EARLIER = "2026-10-15T11:00:00Z";

function key(over: Partial<LlmKeyView> = {}, spent = 0): LlmKeyView {
  return {
    id: "k1",
    provider: "anthropic",
    label: "Org A",
    org_label: null,
    key_hint: "…a1B2",
    monthly_budget_usd: 200,
    soft_limit_pct: 95,
    weight: 1,
    status: "active",
    cooldown_until: null,
    exhausted_until: null,
    last_error: null,
    last_error_at: null,
    last_used_at: null,
    created_at: null,
    created_by: null,
    month: { metered_usd: spent, calls: 0, errors: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
    ...over,
  };
}

test("toNumber parses NUMERIC strings and rejects junk", () => {
  assert.equal(toNumber("200.0000"), 200);
  assert.equal(toNumber(12), 12);
  assert.equal(toNumber("abc", 7), 7);
  assert.equal(toNumber(null, 3), 3);
  assert.equal(toNumber("", 5), 5);
  assert.equal(toNumber(Number.NaN, 1), 1);
});

test("deriveWireModel strips the provider and turns dots into dashes", () => {
  assert.equal(deriveWireModel("anthropic/claude-sonnet-4.5"), "claude-sonnet-4-5");
  assert.equal(deriveWireModel("anthropic/claude-haiku-4.5"), "claude-haiku-4-5");
  assert.equal(deriveWireModel("claude-opus-4"), "claude-opus-4");
});

test("normalizeKeysResponse coerces numbers, defaults the month, never trusts a missing encryption flag", () => {
  const res = normalizeKeysResponse({
    keys: [{ id: "a", label: "A", key_hint: "…xyz1", monthly_budget_usd: "150.5000", soft_limit_pct: 90, weight: "2", status: "active", month: { metered_usd: "12.345678", calls: "40" } }],
    anthropic_routes: [{ model_id: "anthropic/claude-sonnet-4.5" }, { model_id: "anthropic/claude-opus-4.5", wire_model: "claude-opus-4-5-x" }, { bogus: true }],
    period_month: "2026-10-01",
  });
  assert.equal(res.encryption_ready, false);
  assert.equal(res.keys[0].monthly_budget_usd, 150.5);
  assert.equal(res.keys[0].weight, 2);
  assert.equal(res.keys[0].month.metered_usd, 12.345678);
  assert.equal(res.keys[0].month.calls, 40);
  assert.equal(res.keys[0].month.errors, 0);
  assert.deepEqual(res.anthropic_routes, [
    { model_id: "anthropic/claude-sonnet-4.5", wire_model: "claude-sonnet-4-5" },
    { model_id: "anthropic/claude-opus-4.5", wire_model: "claude-opus-4-5-x" },
  ]);
  assert.equal(normalizeKeysResponse({ encryption_ready: true }).encryption_ready, true);
  const empty = normalizeKeysResponse(null);
  assert.deepEqual(empty.keys, []);
  assert.deepEqual(empty.anthropic_routes, []);
});

test("spendState levels against the soft limit", () => {
  assert.equal(spendState(key({}, 10)).level, "ok");
  assert.equal(spendState(key({}, 160)).level, "near"); // 80% ≥ 0.8 × 95
  assert.equal(spendState(key({}, 190)).level, "over"); // 95%
  const over = spendState(key({}, 300));
  assert.equal(over.barPct, 100);
  assert.equal(Math.round(over.pct), 150);
  assert.equal(spendState(key({ monthly_budget_usd: 0 }, 1)).level, "over");
  assert.equal(spendState(key({ monthly_budget_usd: 0 }, 0)).level, "ok");
});

test("effectiveStatus folds stored status, timed stops and the soft limit", () => {
  assert.equal(effectiveStatus(key(), NOW).tone, "ok");
  assert.equal(effectiveStatus(key({ status: "disabled" }), NOW).label, "Disabled");
  assert.equal(effectiveStatus(key({ status: "auth_failed" }), NOW).tone, "error");
  assert.equal(effectiveStatus(key({ cooldown_until: LATER }), NOW).label, "Cooling down");
  assert.equal(effectiveStatus(key({ cooldown_until: EARLIER }), NOW).label, "Active");
  assert.equal(effectiveStatus(key({ exhausted_until: LATER }), NOW).label, "Budget stop");
  assert.equal(effectiveStatus(key({}, 195), NOW).label, "At soft limit");
  assert.equal(effectiveStatus(key({ status: "weird" }), NOW).label, "weird");
  assert.equal(usableKeyCount([key(), key({ status: "disabled" }), key({ cooldown_until: LATER }), key({}, 199)], NOW), 1);
});

test("validateKeyForm", () => {
  const ok: KeyFormValues = {
    label: "Org A",
    org_label: "",
    api_key: "sk-ant-abc",
    monthly_budget_usd: "200",
    soft_limit_pct: "95",
    weight: "1",
    reason: "second org",
  };
  assert.equal(validateKeyForm(ok, true), null);
  assert.match(validateKeyForm({ ...ok, label: " " }, true) ?? "", /label/);
  assert.match(validateKeyForm({ ...ok, api_key: "" }, true) ?? "", /API key/);
  assert.equal(validateKeyForm({ ...ok, api_key: "" }, false), null); // edit never sends the secret
  assert.match(validateKeyForm({ ...ok, api_key: "sk-ant a" }, true) ?? "", /spaces/);
  assert.match(validateKeyForm({ ...ok, monthly_budget_usd: "0" }, true) ?? "", /budget/);
  assert.match(validateKeyForm({ ...ok, monthly_budget_usd: "" }, true) ?? "", /budget/);
  assert.match(validateKeyForm({ ...ok, soft_limit_pct: "101" }, true) ?? "", /Soft limit/);
  assert.match(validateKeyForm({ ...ok, soft_limit_pct: "9.5" }, true) ?? "", /Soft limit/);
  assert.match(validateKeyForm({ ...ok, weight: "0" }, true) ?? "", /Weight/);
  assert.match(validateKeyForm({ ...ok, reason: "" }, true) ?? "", /why/);
});

test("looksLikeAnthropicKey and formatPeriod", () => {
  assert.equal(looksLikeAnthropicKey(" sk-ant-api03-x"), true);
  assert.equal(looksLikeAnthropicKey("sk-or-v1-x"), false);
  assert.match(formatPeriod("2026-10-01"), /2026/);
  assert.equal(formatPeriod(""), "");
});

test("isImageUseCase: catalog kind wins, key name is the fallback", () => {
  assert.equal(isImageUseCase({ use_case: "page_builder_image", kind: "chat" }), true);
  assert.equal(isImageUseCase({ use_case: "video_support_visual" }), true);
  assert.equal(isImageUseCase({ use_case: "anything", kind: "image" }), true);
  assert.equal(isImageUseCase({ use_case: "copy_check_deduction", kind: "vision" }), false);
  assert.equal(isImageUseCase({ use_case: "image_keyword", kind: "chat" }), false);
  assert.equal(isImageUseCase({ use_case: "image" }), true);
  assert.equal(isImageUseCase(null), false);
  assert.equal(isImageModel({ category: "Image" }), true);
  assert.equal(isImageModel({ category: "general" }), false);
});
