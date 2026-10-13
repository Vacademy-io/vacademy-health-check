// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeValue,
  formatPrice,
  gatewayFor,
  groupUseCases,
  isChatModel,
  isNotFound,
  matchesUseCase,
} from "../src/lib/model-defaults.ts";
import type { UseCaseEntry } from "../src/types/model-defaults.ts";

function uc(use_case: string, group: string, label = use_case, model = "z-ai/glm-5.3-flash"): UseCaseEntry {
  return {
    use_case,
    label,
    group,
    service: "ai_service",
    kind: "chat",
    description: "",
    consumers: [],
    held_reason: null,
    row: { default_model_id: model, fallback_model_id: null, free_tier_model_id: null, updated_at: null },
    last_change: null,
  };
}

test("gatewayFor: routes win, unrouted models go via OpenRouter", () => {
  const routes = { "z-ai/glm-5.3-flash": "isoquant" };
  assert.deepEqual(gatewayFor("z-ai/glm-5.3-flash", routes), { key: "isoquant", label: "Isoquant" });
  assert.deepEqual(gatewayFor("google/gemini-2.5-flash", routes), { key: "openrouter", label: "OpenRouter" });
  assert.equal(gatewayFor(null, routes), null);
});

test("isChatModel drops image / video / embedding / tts", () => {
  assert.equal(isChatModel({ category: "llm" }), true);
  assert.equal(isChatModel({ category: "IMAGE" }), false);
  assert.equal(isChatModel({ category: "embedding" }), false);
});

test("formatPrice reads string DECIMALs", () => {
  assert.equal(formatPrice({ input_price_per_1m: "0.100000", output_price_per_1m: "0.40" }), "$0.1 in · $0.4 out /1M");
  assert.equal(formatPrice({ input_price_per_1m: null, output_price_per_1m: null }), null);
  assert.equal(formatPrice({ input_price_per_1m: "2.5", output_price_per_1m: null }), "$2.5 in · ? out /1M");
});

test("groupUseCases follows the group order, unknown groups last", () => {
  const groups = groupUseCases([uc("b", "Platform"), uc("a", "Mystery"), uc("c", "Learner AI"), uc("d", "Platform", "Alpha")]);
  assert.deepEqual(groups.map(([g]) => g), ["Learner AI", "Platform", "Mystery"]);
  assert.deepEqual(groups[1][1].map((u) => u.use_case), ["d", "b"]);
});

test("matchesUseCase searches label, id and models", () => {
  const u = uc("copy_check_deduction", "Assessment & evaluation", "Deduction re-check", "google/gemini-2.5-flash");
  assert.equal(matchesUseCase(u, "deduction"), true);
  assert.equal(matchesUseCase(u, "gemini"), true);
  assert.equal(matchesUseCase(u, "video"), false);
  assert.equal(matchesUseCase(u, "  "), true);
});

test("describeValue shows only the changed keys of a row snapshot", () => {
  const oldV = { default_model_id: "a/x", fallback_model_id: null, updated_at: "t1" };
  const newV = { default_model_id: "z-ai/glm-5.3-flash", fallback_model_id: null, updated_at: "t2" };
  assert.equal(describeValue(oldV, newV), "default: a/x");
  assert.equal(describeValue(newV, oldV), "default: z-ai/glm-5.3-flash");
  assert.equal(describeValue("z-ai/glm-5.3-flash"), "z-ai/glm-5.3-flash");
  assert.equal(describeValue(null), "—");
});

test("isNotFound only for HTTP 404", () => {
  assert.equal(isNotFound({ response: { status: 404 } }), true);
  assert.equal(isNotFound({ response: { status: 500 } }), false);
  assert.equal(isNotFound(new Error("network")), false);
  assert.equal(isNotFound(null), false);
});
