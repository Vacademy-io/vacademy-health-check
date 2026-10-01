// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_EVAL_TOOL_KEY,
  API_EVAL_TOOL_LABEL,
  buildOverrideRequest,
  ceilWhole,
  computeCredits,
  draftFromRow,
  draftRate,
  effectiveNoOverage,
  errorDetail,
  formatCount,
  formatRate,
  isFixedPrice,
  normalizeApiAccess,
  normalizeHistory,
  normalizeInstitutePricing,
  normalizeOverrides,
  overrideCountsByTool,
  overriddenToolsByInstitute,
  parseInstituteIds,
  parseOptionalInt,
  presetQuota,
  previewLine,
  sourceBadge,
  summarizeBulkEnable,
  toolLabel,
  typedPreviewLine,
} from "../src/lib/eval-api-pricing.ts";
import type { InstituteToolPricingRow, ToolRate } from "../src/types/eval-api.ts";

const API_RATE: ToolRate = {
  flat: 0,
  per_unit: 1,
  unit_field: "pages",
  params: { fixed_price: true, typed_per_answer: 1 },
};
const DASH_RATE: ToolRate = { flat: 1, per_unit: 0.2, unit_field: "questions", params: {} };

function apiRow(override: InstituteToolPricingRow["override"] = null): InstituteToolPricingRow {
  return {
    tool_key: API_EVAL_TOOL_KEY,
    label: "copy check evaluation api",
    global: API_RATE,
    override,
    effective: API_RATE,
    source: override ? `override:${override.id}` : "global",
  };
}

test("API default: 1 credit per page, typed 1 per answer (spec §10.1 examples)", () => {
  assert.equal(computeCredits(API_RATE, 12), 12);
  assert.equal(computeCredits(API_RATE, 32), 32);
  assert.equal(computeCredits(API_RATE, 50), 50);
  assert.equal(computeCredits(API_RATE, 4, { typed: true }), 4);
});

test("dashboard default: 1 + 0.2 per question, rounded up without float dust", () => {
  assert.equal(computeCredits(DASH_RATE, 10), 3);
  assert.equal(computeCredits(DASH_RATE, 40), 9); // 1 + 0.2*40 = 9.000000000000002 in floats
  assert.equal(computeCredits(DASH_RATE, 64), 14);
  assert.equal(ceilWhole(9.000000000000002), 9);
  assert.equal(ceilWhole(9.01), 10);
});

test("question slabs win over the per-question rate", () => {
  const slab: ToolRate = {
    flat: 0,
    per_unit: 5,
    unit_field: "questions",
    params: { slabs: [{ upto: 20, credits: 1.5 }, { upto: 50, credits: 3 }, { upto: null, credits: 6.5 }] },
  };
  assert.equal(computeCredits(slab, 10), 2);
  assert.equal(computeCredits(slab, 40), 3);
  assert.equal(computeCredits(slab, 400), 7);
});

test("preview lines read like the spec", () => {
  const contract: ToolRate = { ...API_RATE, per_unit: 0.8 };
  assert.equal(previewLine(contract, API_RATE, 12), "12-page copy = 10 credits (standard 12)");
  assert.equal(previewLine({ ...DASH_RATE, per_unit: 0.15 }, DASH_RATE, 40), "40-question copy = 7 credits (standard 9)");
  assert.equal(typedPreviewLine(API_RATE, API_RATE), "4 typed answers = 4 credits (standard 4)");
  assert.equal(typedPreviewLine(DASH_RATE, DASH_RATE), null);
});

test("labels, rate text, badges and fixed price", () => {
  assert.equal(toolLabel(API_EVAL_TOOL_KEY, "whatever"), API_EVAL_TOOL_LABEL);
  assert.equal(API_EVAL_TOOL_LABEL, "AI evaluation — API partners (per page, fixed price)");
  assert.equal(toolLabel("paper_digitise"), "paper digitise");
  assert.equal(formatRate(API_RATE), "1 per page");
  assert.equal(formatRate(DASH_RATE), "1 + 0.2 per question");
  assert.equal(sourceBadge("override:abc").label, "Contract");
  assert.equal(sourceBadge("global").label, "Standard");
  assert.equal(sourceBadge("default").detail, "code default");
  assert.equal(isFixedPrice(DASH_RATE, "copy_check_evaluation"), false);
  assert.equal(isFixedPrice({ ...DASH_RATE, no_token_overage: true }), true);
  assert.equal(isFixedPrice(DASH_RATE, API_EVAL_TOOL_KEY), true);
});

test("override request: reason required, blanks inherit, typed keeps other params", () => {
  const row = apiRow();
  const draft = draftFromRow(row);
  assert.deepEqual(draft, { flat: "", perUnit: "", typedPerAnswer: "", noOverage: false, reason: "" });

  const noReason = buildOverrideRequest(row, { ...draft, perUnit: "0.8" });
  assert.equal(noReason.ok, false);

  const nothing = buildOverrideRequest(row, { ...draft, reason: "PO 1" });
  assert.equal(nothing.ok, false);

  const neg = buildOverrideRequest(row, { ...draft, perUnit: "-1", reason: "PO 1" });
  assert.deepEqual(neg, { ok: false, error: "Credits per page must be between 0 and 10000" });

  const ok = buildOverrideRequest(row, { ...draft, perUnit: "0.8", typedPerAnswer: "0.5", reason: "  PO 1 " });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.body, {
      reason: "PO 1",
      no_token_overage: true,
      per_unit_credits: 0.8,
      params: { fixed_price: true, typed_per_answer: 0.5 },
    });
  }

  const preview = draftRate(row, { ...draft, perUnit: "0.8" });
  assert.equal(preview.flat, 0);
  assert.equal(preview.per_unit, 0.8);
  assert.equal(computeCredits(preview, 12), 10);
});

test("draft from an existing override pre-fills only the set fields", () => {
  const row = apiRow({
    id: "o1",
    flat: null,
    per_unit: 0.7,
    params: { fixed_price: true, typed_per_answer: 2 },
    no_token_overage: true,
    effective_from: "2026-10-01T00:00:00",
    reason: "PO",
    created_by: "staff",
    created_at: null,
  });
  assert.deepEqual(draftFromRow(row), { flat: "", perUnit: "0.7", typedPerAnswer: "2", noOverage: true, reason: "" });
});

test("normalisers accept the spec shape and tolerant variants", () => {
  const rows = normalizeInstitutePricing([
    {
      tool_key: API_EVAL_TOOL_KEY,
      label: "x",
      global: { flat: 0, per_unit: 1, unit_field: "pages", params: { fixed_price: true } },
      override: { id: "o1", flat_base_credits: "0", per_unit_credits: "0.8", reason: "PO", no_token_overage: false },
      effective: { flat: 0, per_unit: 0.8 },
      source: "override:o1",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].override?.per_unit, 0.8);
  assert.equal(rows[0].effective.unit_field, "pages"); // inherited from global
  assert.deepEqual(normalizeInstitutePricing({ tools: [] }), []);
  assert.deepEqual(normalizeInstitutePricing(null), []);

  const overrides = normalizeOverrides({
    overrides: [
      { institute_id: "inst-0001", tool_key: API_EVAL_TOOL_KEY, per_unit_credits: 0.8 },
      { institute_id: "inst-0001", tool_key: "copy_check_evaluation", flat: 1 },
      { institute_id: "inst-0002", tool_key: API_EVAL_TOOL_KEY },
      { tool_key: "broken" },
    ],
  });
  assert.equal(overrides.length, 3);
  assert.deepEqual(overrideCountsByTool(overrides), { [API_EVAL_TOOL_KEY]: 2, copy_check_evaluation: 1 });
  assert.deepEqual(overriddenToolsByInstitute(overrides)["inst-0001"], [API_EVAL_TOOL_KEY, "copy_check_evaluation"]);

  const history = normalizeHistory([
    { id: "g1", tool_key: API_EVAL_TOOL_KEY, old_json: {}, new_json: { flat_base_credits: 0, per_unit_credits: 1 }, changed_by: "a", reason: "launch", changed_at: "2026-10-01T10:00:00" },
    { id: "o1", tool_key: API_EVAL_TOOL_KEY, institute_id: "inst-0001", per_unit_credits: 0.8, created_by: "b", reason: "PO", effective_from: "2026-10-02T10:00:00", effective_to: null },
  ]);
  assert.equal(history[0].id, "o1"); // newest first
  assert.equal(history[0].scope, "override");
  assert.equal(history[0].changed_by, "b");
  assert.equal(history[1].scope, "global");
  assert.equal(history[1].per_unit, 1);
  assert.equal(history[1].institute_id, null);
});

test("bulk paste parsing, presets and optional ints", () => {
  const { ids, invalid } = parseInstituteIds(
    "6b600940-aaaa-bbbb-cccc-000000000001, 6b600940-aaaa-bbbb-cccc-000000000002\n6b600940-aaaa-bbbb-cccc-000000000001 'bad id' x"
  );
  assert.deepEqual(ids, ["6b600940-aaaa-bbbb-cccc-000000000001", "6b600940-aaaa-bbbb-cccc-000000000002"]);
  assert.deepEqual(invalid, ["bad", "id", "x"]);
  assert.equal(presetQuota("school"), 3000);
  assert.equal(presetQuota("university"), 6000);
  assert.equal(presetQuota("upsc"), 10000);
  assert.equal(presetQuota(null), 2000);
  assert.equal(parseOptionalInt(""), null);
  assert.equal(parseOptionalInt("12"), 12);
  assert.ok(Number.isNaN(parseOptionalInt("1.5")));
  assert.ok(Number.isNaN(parseOptionalInt("-3")));
});

test("errorDetail reads FastAPI and Spring bodies", () => {
  assert.equal(errorDetail({ response: { data: { detail: "Reason required" } } }), "Reason required");
  assert.equal(errorDetail({ response: { data: { detail: [{ msg: "field required" }] } } }), "field required");
  assert.equal(errorDetail({ response: { data: { ex: "Not allowed" } } }), "Not allowed");
  assert.equal(errorDetail({ message: "Network Error" }), "Network Error");
  assert.equal(errorDetail(null, "fallback"), "fallback");
});

test("API tool overrides always store no_token_overage; other tools follow the toggle", () => {
  const row = apiRow();
  const draft = draftFromRow(row);
  assert.equal(effectiveNoOverage(row, draft), true);
  assert.equal(draftRate(row, { ...draft, perUnit: "0.8" }).no_token_overage, true);
  // The implied no-overage alone is not a change for the API tool.
  assert.equal(buildOverrideRequest(row, { ...draft, noOverage: true, reason: "PO" }).ok, false);

  const dash: InstituteToolPricingRow = { ...row, tool_key: "copy_check_evaluation", global: DASH_RATE, effective: DASH_RATE };
  const d = draftFromRow(dash);
  assert.equal(effectiveNoOverage(dash, d), false);
  const r = buildOverrideRequest(dash, { ...d, perUnit: "0.1", reason: "PO" });
  assert.ok(r.ok && r.body.no_token_overage === false);
  const onlyToggle = buildOverrideRequest(dash, { ...d, noOverage: true, reason: "PO" });
  assert.ok(onlyToggle.ok && onlyToggle.body.no_token_overage === true);
});

test("api-access normaliser keeps unknown usage as null and tolerates partial keys", () => {
  const a = normalizeApiAccess({
    products: [{ product: "evaluation", enabled: true }, null],
    keys: [{ id: "k1", name: "Vendor", key_prefix: "vak_eval_ab12", scopes: null, status: "ACTIVE" }],
    usage_30d: { copies: null, typed: null, identify_pages: null, credits: "12.5" },
  });
  assert.equal(a.products.length, 1);
  assert.deepEqual(a.keys[0].scopes, []);
  assert.equal(a.keys[0].prefix, "vak_eval_ab12");
  assert.deepEqual(a.usage_30d, { copies: null, typed: null, identify_pages: null, credits: 12.5 });
  assert.deepEqual(a.webhook_endpoints, []);
  assert.equal(a.last_error, null);
  assert.equal(normalizeApiAccess(null).usage_30d, null);

  assert.equal(formatCount(null), "—");
  assert.equal(formatCount(undefined), "—");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(12.5, 2), (12.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
});

test("bulk-enable summary reads admin-core's {enabled[], not_found[], count}", () => {
  assert.deepEqual(
    summarizeBulkEnable({ product: "evaluation", enabled: ["a", "b"], not_found: ["zz"], count: 2 }, 3),
    { count: 2, notFound: ["zz"] }
  );
  assert.deepEqual(summarizeBulkEnable({ enabled: ["a"], not_found: [] }, 1), { count: 1, notFound: [] });
  assert.deepEqual(summarizeBulkEnable({ enabled: 4 }, 5), { count: 4, notFound: [] });
  assert.deepEqual(summarizeBulkEnable(null, 3), { count: 3, notFound: [] });
});
