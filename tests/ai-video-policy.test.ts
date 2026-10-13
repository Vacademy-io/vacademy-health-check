// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_DEFAULT_POLICY,
  capProgress,
  formFromPolicy,
  normalizeAiVideoPolicyResponse,
  normalizeQualities,
  policyChanged,
  validatePolicyForm,
} from "../src/lib/ai-video-policy.ts";

test("normalize: missing pieces fall back to platform defaults, strings become numbers", () => {
  const r = normalizeAiVideoPolicyResponse({
    policy: { enabled: false, monthly_credit_cap: "500.5", max_concurrent: "4" },
    is_default: false,
    usage: { month_credits_used: "123.25", running_now: 2 },
  });
  assert.equal(r.policy.enabled, false);
  assert.deepEqual(r.policy.allowed_qualities, ["standard", "premium", "ultra"]);
  assert.equal(r.policy.max_minutes_per_video, 8);
  assert.equal(r.policy.monthly_credit_cap, 500.5);
  assert.equal(r.policy.max_concurrent, 4);
  assert.equal(r.is_default, false);
  assert.deepEqual(r.usage, { month_credits_used: 123.25, running_now: 2, videos_this_month: 0 });
});

test("normalize: garbage response still renders (defaults, uncapped, zero usage)", () => {
  const r = normalizeAiVideoPolicyResponse(null);
  assert.equal(r.policy.monthly_credit_cap, null);
  assert.equal(r.is_default, false);
  assert.equal(r.usage.month_credits_used, 0);
});

test("normalizeQualities: display order, de-duplicated, unknown dropped", () => {
  assert.deepEqual(normalizeQualities(["ultra", "STANDARD", "ultra", "cinematic"]), ["standard", "ultra"]);
  assert.deepEqual(normalizeQualities("ultra"), []);
});

test("validate: defaults round-trip to a body with an explicit null cap", () => {
  const v = validatePolicyForm(formFromPolicy(PLATFORM_DEFAULT_POLICY));
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.body.monthly_credit_cap, null);
    assert.ok("monthly_credit_cap" in v.body);
    assert.equal(policyChanged(v.body, PLATFORM_DEFAULT_POLICY), false);
  }
});

test("validate: ranges match the backend (minutes 1-30, concurrent 1-20, cap >= 0)", () => {
  const base = formFromPolicy(PLATFORM_DEFAULT_POLICY);
  for (const bad of ["0", "31", "2.5", "", "-1", "abc"]) {
    assert.equal(validatePolicyForm({ ...base, max_minutes_per_video: bad }).ok, false, `minutes ${bad}`);
  }
  for (const bad of ["0", "21", "1.5", ""]) {
    assert.equal(validatePolicyForm({ ...base, max_concurrent: bad }).ok, false, `concurrent ${bad}`);
  }
  assert.equal(validatePolicyForm({ ...base, monthly_credit_cap: "-5" }).ok, false);
  assert.equal(validatePolicyForm({ ...base, monthly_credit_cap: "1e999" }).ok, false);
  const ok = validatePolicyForm({ ...base, max_minutes_per_video: "30", max_concurrent: "20", monthly_credit_cap: " 0 " });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.body.max_minutes_per_video, 30);
    assert.equal(ok.body.max_concurrent, 20);
    assert.equal(ok.body.monthly_credit_cap, 0);
    assert.equal(policyChanged(ok.body, PLATFORM_DEFAULT_POLICY), true);
  }
});

test("validate: enabled needs at least one quality; disabled may have none", () => {
  const base = formFromPolicy(PLATFORM_DEFAULT_POLICY);
  assert.equal(validatePolicyForm({ ...base, allowed_qualities: [] }).ok, false);
  assert.equal(validatePolicyForm({ ...base, enabled: false, allowed_qualities: [] }).ok, true);
});

test("policyChanged: quality order does not count as a change", () => {
  const v = validatePolicyForm({ ...formFromPolicy(PLATFORM_DEFAULT_POLICY), allowed_qualities: ["ultra", "standard", "premium"] });
  assert.ok(v.ok);
  if (v.ok) assert.equal(policyChanged(v.body, PLATFORM_DEFAULT_POLICY), false);
});

test("capProgress: uncapped, partial, over and zero cap", () => {
  assert.equal(capProgress(50, null), null);
  assert.deepEqual(capProgress(25, 100), { percent: 25, reached: false });
  assert.deepEqual(capProgress(150, 100), { percent: 100, reached: true });
  assert.deepEqual(capProgress(0, 0), { percent: 100, reached: true });
});
