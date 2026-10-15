// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPolicyPut,
  buildRowCreate,
  buildRowPatch,
  defaultPolicy,
  describeScope,
  describeSubject,
  effectiveMode,
  emptyRowDraft,
  enforceSettingValue,
  formatLimit,
  isValidTimeZone,
  meterPct,
  meterUsed,
  meterTone,
  normalizeAllRows,
  normalizeInstituteLimits,
  normalizeOverview,
  normalizeOverviewResponse,
  normalizePolicy,
  normalizeRow,
  normalizeUsage,
  overviewTotals,
  parseLimit,
  policyDraft,
  resolveGlobalEnforce,
  rowDraftFromRow,
  softMarkPct,
  splitRows,
} from "../src/lib/limits.ts";
import type { AiSettingEntry } from "../src/types/ai-settings.ts";
import type { LimitRow, LimitUsageMeter } from "../src/types/limits.ts";
import type { UseCaseCatalogRow } from "../src/types/metering.ts";

const row = (over: Partial<LimitRow> = {}): LimitRow => ({
  id: "r1",
  subject_kind: "INSTITUTE",
  subject_value: null,
  subject_label: null,
  per_member: true,
  scope_kind: "ALL",
  scope_value: null,
  scope_label: null,
  period: "MONTH",
  metric: "CREDITS",
  soft_limit: 800,
  hard_limit: 1000,
  origin: "PLATFORM",
  locked: true,
  is_active: true,
  reason: null,
  created_by: "u1",
  created_at: "2026-10-15T00:00:00Z",
  updated_at: null,
  ...over,
});

const catalogRow = (use_case: string, over: Partial<UseCaseCatalogRow> = {}): UseCaseCatalogRow => ({
  use_case,
  feature_group: "tutor",
  label: use_case.replace(/_/g, " "),
  label_template: null,
  count_unit_label: null,
  model_use_case: null,
  legacy_request_types: [],
  tool_keys: [],
  capability_key: null,
  default_surface: "LEARNER_APP",
  actor_kind: "USER",
  unit_kind: "CREDITS",
  billing_policy: "AS_TODAY",
  plan_eligible: true,
  limit_eligible: true,
  is_active: true,
  display_order: 10,
  updated_by: null,
  updated_at: null,
  ...over,
});

const meter = (over: Partial<LimitUsageMeter> = {}): LimitUsageMeter => ({
  key: "I|ALL",
  label: "Whole institute",
  period: "DAY",
  credits_used: 0,
  count_used: 0,
  cost_usd: null,
  soft: null,
  hard: null,
  metric: null,
  pct: null,
  window_start: null,
  ...over,
});

test("normalizePolicy: empty / null is the OFF default; values are coerced", () => {
  assert.deepEqual(normalizePolicy(null), defaultPolicy());
  assert.deepEqual(normalizePolicy({}), defaultPolicy());
  const p = normalizePolicy({ mode: "shadow", tenant_may_enforce: true, timezone: "Europe/London", updated_at: "2026-10-15T01:00:00Z", updated_by: "u9" });
  assert.equal(p.mode, "SHADOW");
  assert.equal(p.tenant_may_enforce, true);
  assert.equal(p.timezone, "Europe/London");
  assert.equal(p.notify_admins_on_soft, true);
  assert.equal(p.show_numbers_to_learners, false);
  assert.equal(p.is_default, false);
  // A default-shaped policy the server synthesised (no updated_at) counts as "no row".
  assert.equal(normalizePolicy({ mode: "OFF" }).is_default, true);
  assert.equal(normalizePolicy({ mode: "OFF", is_default: false }).is_default, false);
  // ai-service's own flag
  assert.equal(normalizePolicy({ mode: "OFF", exists: false, updated_at: "t" }).is_default, true);
  assert.equal(normalizePolicy({ mode: "OFF", exists: true }).is_default, false);
});

test("normalizeRow: NUMERIC strings, upper-casing, null limits; id required", () => {
  const r = normalizeRow({ id: 7, subject_kind: "role_class", subject_value: "TEACHER", soft_limit: "40.5", hard_limit: null, origin: "tenant", per_member: false });
  assert.ok(r);
  assert.equal(r.id, "7");
  assert.equal(r.subject_kind, "ROLE_CLASS");
  assert.equal(r.soft_limit, 40.5);
  assert.equal(r.hard_limit, null);
  assert.equal(r.origin, "TENANT");
  assert.equal(r.per_member, false);
  assert.equal(r.is_active, true);
  assert.equal(normalizeRow({ subject_kind: "USER" }), null);
  assert.equal(normalizeRow({ id: "x", hard_limit: "abc" })?.hard_limit, null);
});

test("normalizeInstituteLimits: envelope and bare policy; rows split by origin, deduped", () => {
  const env = normalizeInstituteLimits({
    policy: { mode: "ENFORCE", updated_at: "t" },
    rows: [{ id: "a", origin: "TENANT" }, { id: "p2", origin: "PLATFORM" }],
    platform_rows: [{ id: "p1", origin: "PLATFORM" }, { id: "p2", origin: "PLATFORM" }],
    enforce_globally_enabled: false,
  });
  assert.equal(env.policy.mode, "ENFORCE");
  assert.deepEqual(env.rows.map((r) => r.id), ["a"]);
  assert.deepEqual(env.platform_rows.map((r) => r.id).sort(), ["p1", "p2"]);
  assert.equal(env.enforce_globally_enabled, false);

  const bare = normalizeInstituteLimits({ mode: "SHADOW", timezone: "Asia/Kolkata", updated_at: "t" });
  assert.equal(bare.policy.mode, "SHADOW");
  assert.deepEqual(bare.rows, []);
  assert.equal(bare.enforce_globally_enabled, null);
  assert.equal(normalizeInstituteLimits(null).policy.is_default, true);
});

test("normalizeAllRows accepts an array, {rows} and {rows, platform_rows}", () => {
  assert.equal(normalizeAllRows([{ id: "a" }]).length, 1);
  assert.equal(normalizeAllRows({ rows: [{ id: "a" }], platform_rows: [{ id: "b", origin: "PLATFORM" }] }).length, 2);
  assert.deepEqual(normalizeAllRows("nope"), []);
});

test("splitRows sorts active first, institute → user, all → use case, day → month", () => {
  const { tenant } = splitRows([
    row({ id: "u", origin: "TENANT", subject_kind: "USER", subject_value: "x" }),
    row({ id: "old", origin: "TENANT", is_active: false }),
    row({ id: "rc-month", origin: "TENANT", subject_kind: "ROLE_CLASS", subject_value: "TEACHER" }),
    row({ id: "rc-day", origin: "TENANT", subject_kind: "ROLE_CLASS", subject_value: "TEACHER", period: "DAY" }),
    row({ id: "inst", origin: "TENANT" }),
  ]);
  assert.deepEqual(tenant.map((r) => r.id), ["inst", "rc-day", "rc-month", "u", "old"]);
});

test("normalizeOverview: array or {institutes}; counts from numbers or arrays; blocked first", () => {
  const rows = normalizeOverview({
    institutes: [
      { institute_id: "b", institute_name: "Beta", mode: "shadow", rows: 3, platform_rows: [1, 2], would_block_7d: "5" },
      { institute_id: "a", institute_name: "Alpha", mode: "ENFORCE", tenant_may_enforce: true, blocked_7d: 2 },
      { institute_name: "no id" },
    ],
  });
  assert.deepEqual(rows.map((r) => r.institute_id), ["a", "b"]);
  assert.equal(rows[1].mode, "SHADOW");
  assert.equal(rows[1].rows, 3);
  assert.equal(rows[1].platform_rows, 2);
  assert.equal(rows[1].would_block_7d, 5);
  const t = overviewTotals(rows);
  assert.equal(t.institutes, 2);
  assert.equal(t.byMode.ENFORCE, 1);
  assert.equal(t.byMode.SHADOW, 1);
  assert.equal(t.tenantMayEnforce, 1);
  assert.equal(t.blocked_7d, 2);
  assert.equal(t.would_block_7d, 5);
  assert.equal(normalizeOverview([{ institute_id: "x" }])[0].mode, "OFF");
  assert.deepEqual(normalizeOverview(null), []);
  assert.deepEqual(normalizeOverviewResponse({ institutes: [], enforce_globally_enabled: false }), { institutes: [], enforce_globally_enabled: false });
  assert.equal(normalizeOverviewResponse([]).enforce_globally_enabled, null);
});

test("normalizeUsage + meter maths", () => {
  const ms = normalizeUsage({
    usage: [
      { key: "I|ALL", label: "Institute", credits_used: "50", count_used: 3, soft: 80, hard: 100, pct: 50 },
      { counter_key: "U:x|ALL", credits_used: 95, soft: "80", hard: "100" },
      { label: "keyless" },
    ],
  });
  assert.deepEqual(ms.map((m) => m.key), ["U:x|ALL", "I|ALL"]);
  assert.equal(ms[0].label, "U:x|ALL");
  assert.equal(meterPct(ms[0]), 95);
  assert.equal(meterTone(ms[0]), "warn");
  assert.equal(meterTone(ms[1]), "ok");
  assert.equal(softMarkPct(ms[1]), 80);
  assert.equal(meterTone(meter({ credits_used: 120, hard: 100 })), "error");
  assert.equal(meterPct(meter({ hard: 0, count_used: 1, metric: "COUNT" })), 100);
  assert.equal(meterPct(meter({ hard: 0 })), 0);
  assert.equal(meterTone(meter({ credits_used: 10 })), "off");
  assert.equal(meterTone(meter({ credits_used: 10, soft: 5 })), "warn");
  assert.deepEqual(normalizeUsage([{ key: "k" }]).map((m) => m.key), ["k"]);
  // The binding row's metric decides what "used" is.
  const byCount = normalizeUsage([{ key: "k", credits_used: 500, count_used: 9, cost_usd: "0.5", hard: 10, metric: "count" }])[0];
  assert.equal(byCount.metric, "COUNT");
  assert.equal(byCount.cost_usd, 0.5);
  assert.equal(meterUsed(byCount), 9);
  assert.equal(meterPct(byCount), 90);
  assert.equal(meterUsed({ ...byCount, metric: "COST_USD" }), 0.5);
  assert.equal(meterUsed({ ...byCount, metric: null }), 500);
});

test("global switch: policy flag wins, then the setting, default on; ENFORCE acts as SHADOW when off", () => {
  const entry = (over: Partial<AiSettingEntry>) => ({ key: "metering.limits.enforce", value: null, default: true, effective: undefined, ...over }) as AiSettingEntry;
  assert.equal(enforceSettingValue(null), null);
  assert.equal(enforceSettingValue(entry({})), true);
  assert.equal(enforceSettingValue(entry({ value: false })), false);
  assert.equal(enforceSettingValue(entry({ value: true, effective: "false" })), false);
  assert.deepEqual(resolveGlobalEnforce(false, true), { enabled: false, known: true });
  assert.deepEqual(resolveGlobalEnforce(null, false), { enabled: false, known: true });
  assert.deepEqual(resolveGlobalEnforce(null, null), { enabled: true, known: false });
  assert.equal(effectiveMode("ENFORCE", false), "SHADOW");
  assert.equal(effectiveMode("ENFORCE", true), "ENFORCE");
  assert.equal(effectiveMode("SHADOW", false), "SHADOW");
});

test("labels", () => {
  assert.equal(describeSubject(row()), "Whole institute · pooled");
  assert.equal(describeSubject(row({ subject_kind: "ROLE_CLASS", subject_value: "TEACHER" })), "Teacher (class) · each member");
  assert.equal(describeSubject(row({ subject_kind: "ROLE", subject_value: "EVALUATOR", per_member: false })), "Role EVALUATOR · pooled");
  assert.equal(describeSubject(row({ subject_kind: "USER", subject_value: "u1", subject_label: "Asha" })), "Asha");
  // ai-service's label already says how the role is pooled
  assert.equal(describeSubject(row({ subject_kind: "ROLE_CLASS", subject_value: "TEACHER", per_member: false, subject_label: "All teachers together" })), "All teachers together");
  assert.equal(describeScope(row()), "All AI");
  assert.equal(describeScope(row({ scope_kind: "GROUP", scope_value: "tutor" })), "Group: tutor");
  assert.equal(describeScope(row({ scope_kind: "USE_CASE", scope_value: "tutor_chat" }), new Map([["tutor_chat", "AI tutor chat"]])), "AI tutor chat");
  assert.equal(describeScope(row({ scope_kind: "USE_CASE", scope_value: "x", scope_label: "Server label" })), "Server label");
  assert.equal(formatLimit(null, "CREDITS"), "no cap");
  assert.equal(formatLimit(1200, "CREDITS"), "1,200 cr");
  assert.equal(formatLimit(40, "COUNT"), "40 req");
  assert.equal(formatLimit(1.5, "COST_USD"), "$1.50");
});

test("parseLimit and isValidTimeZone", () => {
  assert.deepEqual(parseLimit("", "Hard"), { value: null });
  assert.deepEqual(parseLimit(" 1,000 ", "Hard"), { value: 1000 });
  assert.deepEqual(parseLimit("0", "Hard"), { value: 0 });
  assert.deepEqual(parseLimit("0.123456", "Hard"), { value: 0.1235 });
  assert.ok("error" in parseLimit("-1", "Hard"));
  assert.ok("error" in parseLimit("abc", "Hard"));
  assert.ok("error" in parseLimit("1e11", "Hard"));
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Mars/Base"), false);
  assert.equal(isValidTimeZone(" Asia/Kolkata"), false);
  assert.equal(isValidTimeZone(""), false);
});

test("buildPolicyPut: validates, needs a change (except creating) and a reason", () => {
  const stored = normalizePolicy({ mode: "SHADOW", timezone: "Asia/Kolkata", updated_at: "t" });
  const d = policyDraft(stored);
  assert.deepEqual(buildPolicyPut(stored, d, "x"), { error: "Nothing changed" });
  assert.deepEqual(buildPolicyPut(stored, { ...d, mode: "ENFORCE" }, " "), { error: "Say why (it lands in the change log)" });
  assert.ok("error" in buildPolicyPut(stored, { ...d, timezone: "Nowhere/City" }, "r"));
  const ok = buildPolicyPut(stored, { ...d, mode: "ENFORCE", tenant_may_enforce: true, timezone: " Europe/London " }, " pilot ");
  assert.deepEqual(ok, {
    body: { mode: "ENFORCE", tenant_may_enforce: true, timezone: "Europe/London", notify_admins_on_soft: true, show_numbers_to_learners: false, reason: "pilot" },
  });
  // No policy row yet: saving the defaults creates it.
  const def = defaultPolicy();
  assert.ok("body" in buildPolicyPut(def, policyDraft(def), "create"));
  // An unknown mode from the server is shown as OFF in the form.
  assert.equal(policyDraft(normalizePolicy({ mode: "WEIRD", updated_at: "t" })).mode, "OFF");
});

test("buildRowCreate: subjects, scopes, periods, limits, duplicates, reason", () => {
  const ctx = { existing: [] as LimitRow[], catalog: [catalogRow("tutor_chat"), catalogRow("auto_analytics", { limit_eligible: false })] };
  const base = { ...emptyRowDraft("PLATFORM"), hard_limit: "1000", soft_limit: "800" };

  const ok = buildRowCreate(base, " cap ", ctx);
  assert.deepEqual(ok, {
    body: {
      subject_kind: "INSTITUTE",
      subject_value: null,
      scope_kind: "ALL",
      scope_value: null,
      period: "MONTH",
      metric: "CREDITS",
      soft_limit: 800,
      hard_limit: 1000,
      origin: "PLATFORM",
      locked: true,
      reason: "cap",
    },
  });

  assert.deepEqual(buildRowCreate({ ...base, subject_kind: "ROLE_CLASS" }, "r", ctx), { error: "Pick a role class" });
  const rc = buildRowCreate({ ...base, subject_kind: "ROLE_CLASS", subject_value: "SYSTEM", per_member: false }, "r", ctx);
  assert.ok("body" in rc && rc.body.per_member === false && rc.body.subject_value === "SYSTEM");
  const role = buildRowCreate({ ...base, subject_kind: "ROLE", subject_value: " content-reviewer " }, "r", ctx);
  assert.ok("body" in role && role.body.subject_value === "CONTENT_REVIEWER" && role.body.per_member === true);
  assert.deepEqual(buildRowCreate({ ...base, subject_kind: "USER", subject_value: "  " }, "r", ctx), { error: "Enter the user id" });
  assert.ok("error" in buildRowCreate({ ...base, subject_kind: "USER", subject_value: "a b" }, "r", ctx));
  const user = buildRowCreate({ ...base, subject_kind: "USER", subject_value: " u-1 " }, "r", ctx);
  assert.ok("body" in user && user.body.subject_value === "u-1" && !("per_member" in user.body));

  assert.deepEqual(buildRowCreate({ ...base, scope_kind: "GROUP" }, "r", ctx), { error: "Pick a feature group" });
  assert.ok("body" in buildRowCreate({ ...base, scope_kind: "GROUP", scope_value: "video" }, "r", ctx));
  assert.deepEqual(buildRowCreate({ ...base, scope_kind: "USE_CASE", scope_value: "nope" }, "r", ctx), { error: '"nope" is not in the use-case catalog' });
  assert.ok("error" in buildRowCreate({ ...base, scope_kind: "USE_CASE", scope_value: "auto_analytics" }, "r", ctx));
  assert.ok("body" in buildRowCreate({ ...base, scope_kind: "USE_CASE", scope_value: "tutor_chat" }, "r", ctx));
  // Catalog not loaded: any key goes through (the server validates).
  assert.ok("body" in buildRowCreate({ ...base, scope_kind: "USE_CASE", scope_value: "nope" }, "r", { existing: [] }));

  assert.deepEqual(buildRowCreate({ ...base, period: "PLAN_PERIOD" }, "r", ctx), { error: "Plan period is reserved for AI plans (not shipped yet)" });
  assert.deepEqual(buildRowCreate({ ...base, soft_limit: "1200" }, "r", ctx), { error: "The soft limit must not be above the hard limit" });
  assert.deepEqual(buildRowCreate({ ...base, soft_limit: "", hard_limit: "" }, "r", ctx), { error: "Set a soft limit, a hard limit or both" });
  // A tenant USER row with no numbers is an exemption from the role cap.
  const exempt = buildRowCreate({ ...emptyRowDraft("TENANT"), subject_kind: "USER", subject_value: "u1" }, "vip", ctx);
  assert.ok("body" in exempt && exempt.body.hard_limit === null && exempt.body.locked === false && exempt.body.origin === "TENANT");
  // A super admin may lock a tenant row too (ai-service accepts locked on any origin).
  const tenantLocked = buildRowCreate({ ...base, origin: "TENANT", locked: true }, "r", ctx);
  assert.ok("body" in tenantLocked && tenantLocked.body.locked === true);
  const tenantOpen = buildRowCreate({ ...emptyRowDraft("TENANT"), hard_limit: "5" }, "r", ctx);
  assert.ok("body" in tenantOpen && tenantOpen.body.locked === false);

  const dup = buildRowCreate(base, "r", { ...ctx, existing: [row({ id: "e" })] });
  assert.ok("error" in dup && dup.error.startsWith("An active row"));
  // ...but a removed row with the same identity does not block a new one
  assert.ok("body" in buildRowCreate(base, "r", { ...ctx, existing: [row({ id: "e", is_active: false })] }));
  assert.deepEqual(buildRowCreate(base, "  ", ctx), { error: "Say why (it lands in the change log)" });
});

test("buildRowPatch sends only changed numbers / per_member / locked", () => {
  const r = row();
  const d = rowDraftFromRow(r);
  assert.deepEqual(buildRowPatch(r, d, "x"), { error: "Nothing changed" });
  assert.deepEqual(buildRowPatch(r, { ...d, hard_limit: "1500" }, " raise "), { patch: { reason: "raise", hard_limit: 1500 } });
  assert.deepEqual(buildRowPatch(r, { ...d, locked: false }, "r"), { patch: { reason: "r", locked: false } });
  assert.deepEqual(buildRowPatch(r, { ...d, hard_limit: "" }, "r"), { patch: { reason: "r", hard_limit: null } });
  assert.deepEqual(buildRowPatch(r, { ...d, soft_limit: "", hard_limit: "" }, "r"), { error: "Set a soft limit, a hard limit or both (or remove the row)" });
  assert.deepEqual(buildRowPatch(r, { ...d, soft_limit: "2000" }, "r"), { error: "The soft limit must not be above the hard limit" });
  assert.deepEqual(buildRowPatch(r, { ...d, hard_limit: "1500" }, " "), { error: "Say why (it lands in the change log)" });
  // ai-service patches soft / hard / locked only: per_member is never sent
  assert.deepEqual(buildRowPatch(r, { ...d, per_member: false }, "r"), { error: "Nothing changed" });
  const roleRow = row({ subject_kind: "ROLE", subject_value: "EVALUATOR", origin: "TENANT", locked: false });
  assert.deepEqual(buildRowPatch(roleRow, { ...rowDraftFromRow(roleRow), per_member: false, locked: true }, "r"), { patch: { reason: "r", locked: true } });
  // A tenant ROLE row may become an exemption (no numbers).
  assert.deepEqual(buildRowPatch(roleRow, { ...rowDraftFromRow(roleRow), soft_limit: "", hard_limit: "" }, "r"), {
    patch: { reason: "r", soft_limit: null, hard_limit: null },
  });
});
