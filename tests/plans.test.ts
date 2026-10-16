// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowanceMeter,
  allowedModes,
  applyOverride,
  buildAssign,
  buildItem,
  buildItemsPut,
  buildOverride,
  buildPlanCreate,
  buildTermsPatch,
  defaultItem,
  describeCaps,
  describeStateChange,
  diffVersions,
  draftVersion,
  effectiveMode,
  emptyAssignDraft,
  emptyOverrideDraft,
  eventLabel,
  formatInr,
  formatInrMinor,
  itemDraft,
  itemDraftsFor,
  liveSubscription,
  liveVersion,
  marginTone,
  normalizeEvents,
  normalizeFeatures,
  normalizePlan,
  normalizePlans,
  normalizePnl,
  normalizeSimulation,
  normalizeSubscription,
  normalizeVersion,
  parseCap,
  parseModelList,
  parseRupeesToMinor,
  pnlCsv,
  pnlTotals,
  sameItems,
  settingBool,
  settingNumber,
  termsDraft,
} from "../src/lib/plans.ts";
import type { AiSettingEntry } from "../src/types/ai-settings.ts";
import type { BillingFeature, PlanItem, PlanVersion } from "../src/types/plans.ts";

const feature = (feature_key: string, eligibility: BillingFeature["eligibility"], over: Partial<BillingFeature> = {}): BillingFeature => ({
  feature_key,
  label: feature_key.replace(/_/g, " "),
  tenant_label: null,
  description: null,
  eligibility,
  locked: false,
  display_order: 100,
  is_active: true,
  use_cases: [],
  updated_by: null,
  updated_at: null,
  ...over,
});

const FEATURES: BillingFeature[] = [
  feature("learner_assistant", "INCLUDABLE", { display_order: 10 }),
  feature("image_generation", "ALLOWANCE_ONLY", { display_order: 20 }),
  feature("ai_calling", "ALWAYS_CHARGED", { display_order: 30, locked: true }),
  feature("old_feature", "INCLUDABLE", { display_order: 40, is_active: false }),
];

const version = (over: Partial<PlanVersion> = {}): PlanVersion => ({
  ...normalizeVersion({ id: "v1", plan_id: "p1", version_no: 1, status: "DRAFT", price_minor: 500000, allowance_credits: "2000", internal_cost_cap_usd: "13.95", grace_days: 7 }),
  ...over,
});

const setting = (key: string, value: AiSettingEntry["value"], over: Partial<AiSettingEntry> = {}): AiSettingEntry => ({
  key,
  group: "billing",
  group_label: "Billing",
  label: key,
  description: "",
  type: "bool",
  nullable: false,
  options: [],
  value,
  default: null,
  source: "portal",
  updated_by: null,
  updated_at: null,
  ...over,
});

// ---------------------------------------------------------------- normalisers

test("normalizeFeatures: wrapped list, sorted, unknown eligibility fails safe to ALWAYS_CHARGED", () => {
  const out = normalizeFeatures({
    features: [
      { feature_key: "b", label: "B", eligibility: "INCLUDABLE", display_order: 20 },
      { feature_key: "a", label: "A", eligibility: "WHATEVER", display_order: "5", locked: true },
      { label: "no key" },
    ],
  });
  assert.deepEqual(out.map((f) => f.feature_key), ["a", "b"]);
  assert.equal(out[0].eligibility, "ALWAYS_CHARGED");
  assert.equal(out[0].locked, true);
  assert.equal(out[0].display_order, 5);
});

test("normalizeVersion: NUMERIC strings become numbers, items normalised", () => {
  const v = normalizeVersion({
    id: "v9",
    version_no: "3",
    status: "PUBLISHED",
    price_minor: "500000",
    allowance_credits: "2000.0000",
    internal_cost_cap_usd: null,
    items: [{ feature_key: "kb_qa", mode: "INCLUDED", inst_units_cap: "5000.0000", roles_included: ["LEARNER"], model_allowlist: [] }],
  });
  assert.equal(v.version_no, 3);
  assert.equal(v.price_minor, 500000);
  assert.equal(v.allowance_credits, 2000);
  assert.equal(v.internal_cost_cap_usd, null);
  assert.equal(v.items[0].inst_units_cap, 5000);
  assert.deepEqual(v.items[0].roles_included, ["LEARNER"]);
  assert.equal(v.items[0].model_allowlist, null, "an empty allowlist reads as none");
  assert.equal(v.items[0].model_policy, "DEFAULT_CHAIN");
});

test("normalizePlan: { plan, versions } envelope and list rows with only latest_version", () => {
  const p = normalizePlan({ plan: { id: "p1", plan_key: "ai_pro", name: "AI Pro" }, versions: [{ id: "v1", version_no: 1, status: "PUBLISHED" }, { id: "v2", version_no: 2, status: "DRAFT" }] });
  assert.equal(p.name, "AI Pro");
  assert.deepEqual(p.versions.map((v) => v.version_no), [2, 1], "newest first");
  assert.equal(liveVersion(p)?.id, "v1");
  assert.equal(draftVersion(p)?.id, "v2");
  const list = normalizePlans([{ id: "p2", plan_key: "x", latest_version: { id: "v7", version_no: 7, status: "PUBLISHED" }, live_count: 2 }, { name: "no id" }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].versions[0].id, "v7");
  assert.equal(list[0].live_subscriptions, 2);
});

test("normalizeSubscription: nested plan / version objects and period", () => {
  const s = normalizeSubscription({
    id: "s1",
    institute_id: "i1",
    plan: { id: "p1", name: "AI Pro", plan_key: "ai_pro" },
    plan_version: { id: "v1", version_no: 1 },
    status: "ACTIVE",
    enforcement: "BOGUS",
    current_period: { period_start: "2026-10-01T00:00:00Z", period_end: "2026-11-01T00:00:00Z", allowance_credits: "2000", allowance_used: "150.5" },
  });
  assert.equal(s.plan_name, "AI Pro");
  assert.equal(s.plan_version_id, "v1");
  assert.equal(s.version_no, 1);
  assert.equal(s.enforcement, "SHADOW", "an unknown enforcement reads as SHADOW (charges as today)");
  assert.equal(s.current_period?.allowance_used, 150.5);
});

test("normalizeEvents: newest first, JSON-string states parsed", () => {
  const ev = normalizeEvents({
    events: [
      { id: "1", event_type: "ASSIGNED", created_at: "2026-10-01T00:00:00Z", to_state: '{"enforcement":"SHADOW"}' },
      { id: "2", event_type: "ENFORCEMENT_CHANGED", created_at: "2026-10-05T00:00:00Z", from_state: { enforcement: "SHADOW" }, to_state: { enforcement: "LIVE" } },
    ],
  });
  assert.deepEqual(ev.map((e) => e.id), ["2", "1"]);
  assert.deepEqual(ev[1].to_state, { enforcement: "SHADOW" });
  assert.equal(describeStateChange(ev[0].from_state, ev[0].to_state), "enforcement: SHADOW → LIVE");
  assert.equal(eventLabel("ENFORCEMENT_CHANGED"), "Enforcement changed");
  assert.equal(eventLabel("SOMETHING_NEW"), "Something new");
});

// ---------------------------------------------------------------- eligibility

test("allowedModes follows eligibility; effectiveMode applies the platform guard", () => {
  assert.deepEqual(allowedModes("INCLUDABLE"), ["INCLUDED", "ALLOWANCE", "CHARGED"]);
  assert.deepEqual(allowedModes("ALLOWANCE_ONLY"), ["ALLOWANCE", "CHARGED"]);
  assert.deepEqual(allowedModes("ALWAYS_CHARGED"), ["CHARGED"]);
  assert.equal(effectiveMode("ALWAYS_CHARGED", "INCLUDED"), "CHARGED");
  assert.equal(effectiveMode("ALWAYS_CHARGED", "ALLOWANCE"), "CHARGED");
  assert.equal(effectiveMode("ALLOWANCE_ONLY", "INCLUDED"), "ALLOWANCE");
  assert.equal(effectiveMode(undefined, "INCLUDED"), "CHARGED", "an unknown feature is charged");
});

// ---------------------------------------------------------------- items

test("itemDraftsFor: every active feature, CHARGED by default; inactive only when it has an item", () => {
  const drafts = itemDraftsFor(FEATURES, [{ ...defaultItem("image_generation"), mode: "ALLOWANCE" }, { ...defaultItem("ghost"), mode: "INCLUDED" }]);
  assert.deepEqual(drafts.map((d) => [d.feature_key, d.mode]), [
    ["learner_assistant", "CHARGED"],
    ["image_generation", "ALLOWANCE"],
    ["ai_calling", "CHARGED"],
    ["ghost", "INCLUDED"],
  ]);
});

test("buildItem refuses INCLUDED / ALLOWANCE on an ALWAYS_CHARGED feature and INCLUDED on ALLOWANCE_ONLY", () => {
  const calling = FEATURES[2];
  const d = itemDraft({ ...defaultItem("ai_calling"), mode: "INCLUDED" });
  assert.match(String((buildItem(d, calling) as { error: string }).error), /not allowed/);
  assert.ok("error" in buildItem({ ...d, mode: "ALLOWANCE" }, calling));
  assert.ok("item" in buildItem({ ...d, mode: "CHARGED" }, calling));
  assert.ok("error" in buildItem({ ...d, feature_key: "image_generation", mode: "INCLUDED" }, FEATURES[1]));
  assert.ok("error" in buildItem({ ...d, mode: "CHARGED" }, undefined) === false, "an unknown feature may still be CHARGED");
});

test("buildItem: caps and model policy only travel with INCLUDED; validation of caps", () => {
  const f = FEATURES[0];
  const base = itemDraft(defaultItem("learner_assistant"));
  const inc = { ...base, mode: "INCLUDED" as const, inst_units_cap: "20,000", user_units_cap: "300", roles_included: ["LEARNER"], display_cap_text: "  Fair use: 300 messages per learner  " };
  const built = buildItem(inc, f);
  assert.ok("item" in built);
  if ("item" in built) {
    assert.equal(built.item.inst_units_cap, 20000);
    assert.equal(built.item.user_units_cap, 300);
    assert.deepEqual(built.item.roles_included, ["LEARNER"]);
    assert.equal(built.item.display_cap_text, "Fair use: 300 messages per learner");
  }
  const allow = buildItem({ ...inc, mode: "ALLOWANCE" }, f);
  assert.ok("item" in allow);
  if ("item" in allow) {
    assert.equal(allow.item.inst_units_cap, null, "caps are dropped outside INCLUDED");
    assert.equal(allow.item.roles_included, null);
  }
  assert.ok("error" in buildItem({ ...inc, user_units_cap: "1.5" }, f), "uses must be whole");
  assert.ok("error" in buildItem({ ...inc, inst_credits_cap: "-1" }, f));
  assert.ok("error" in buildItem({ ...inc, model_policy: "ALLOWLIST", model_allowlist: " , " }, f));
  const al = buildItem({ ...inc, model_policy: "ALLOWLIST", model_allowlist: "z-ai/glm-5.3-flash, google/gemini-2.5-flash z-ai/glm-5.3-flash" }, f);
  assert.ok("item" in al && al.item.model_allowlist?.length === 2);
  assert.ok("error" in buildItem({ ...inc, model_policy: "MAX_PRICE", max_output_price_per_1m: "" }, f));
  assert.ok("item" in buildItem({ ...inc, model_policy: "MAX_PRICE", max_output_price_per_1m: "2.5" }, f));
});

test("buildItemsPut returns the first problem, else every row; sameItems ignores order", () => {
  const drafts = itemDraftsFor(FEATURES.slice(0, 3), []);
  const ok = buildItemsPut(drafts, FEATURES);
  assert.ok("items" in ok && ok.items.length === 3);
  const bad = buildItemsPut(drafts.map((d) => (d.feature_key === "ai_calling" ? { ...d, mode: "INCLUDED" as const } : d)), FEATURES);
  assert.ok("error" in bad);
  if ("items" in ok) {
    assert.equal(sameItems(ok.items, [...ok.items].reverse()), true);
    assert.equal(sameItems(ok.items, ok.items.map((i) => (i.feature_key === "learner_assistant" ? { ...i, mode: "ALLOWANCE" as const } : i))), false);
  }
});

test("describeCaps / parseModelList", () => {
  const item: PlanItem = { ...defaultItem("learner_analytics"), mode: "INCLUDED", inst_credits_cap: 1500, user_credits_cap: 3, user_cap_basis: "SUBJECT" };
  assert.equal(describeCaps(item), "Institute 1,500 cr; per learner (subject) 3 cr");
  assert.equal(describeCaps(defaultItem("x")), "No cap");
  assert.deepEqual(parseModelList("a, b\nc  a"), ["a", "b", "c"]);
});

// ---------------------------------------------------------------- terms

test("buildTermsPatch sends only changed terms and validates", () => {
  const v = version();
  const d = termsDraft(v);
  assert.equal(d.price_rupees, "5000");
  const same = buildTermsPatch(v, d, "r");
  assert.ok("body" in same && same.changed === false);
  const changed = buildTermsPatch(v, { ...d, price_rupees: "4,999.50", allowance_credits: "2500", internal_cost_cap_usd: "" }, " pricing review ");
  assert.ok("body" in changed);
  if ("body" in changed) {
    assert.deepEqual(changed.body, { reason: "pricing review", price_minor: 499950, allowance_credits: 2500, internal_cost_cap_usd: null });
    assert.equal(changed.changed, true);
  }
  assert.ok("error" in buildTermsPatch(v, { ...d, price_rupees: "" }, "r"));
  assert.ok("error" in buildTermsPatch(v, { ...d, period_months: 2 }, "r"));
  assert.ok("error" in buildTermsPatch(v, { ...d, grace_days: "120" }, "r"));
  assert.ok("error" in buildTermsPatch(v, { ...d, supersedes_version_id: "v1" }, "r"));
  assert.ok("error" in buildTermsPatch(v, { ...d, price_rupees: "1" }, "  "), "reason required");
});

test("money parsing and formatting", () => {
  assert.deepEqual(parseRupeesToMinor("₹ 5,000"), { value: 500000 });
  assert.deepEqual(parseRupeesToMinor("0.5"), { value: 50 });
  assert.deepEqual(parseRupeesToMinor(""), { value: null });
  assert.ok("error" in parseRupeesToMinor("12.345"));
  assert.ok("error" in parseRupeesToMinor("-3"));
  assert.equal(formatInrMinor(500000), "₹5,000");
  assert.equal(formatInrMinor(499950), "₹4,999.5");
  assert.equal(formatInrMinor(null), "—");
  assert.equal(formatInr(-1234.5), "-₹1,235");
  assert.deepEqual(parseCap(" ", "x"), { value: null });
  assert.ok("error" in parseCap("abc", "x"));
});

test("diffVersions: first version lists non-charged items; later versions only changes", () => {
  const v1 = version({ status: "PUBLISHED", items: [{ ...defaultItem("learner_assistant"), mode: "INCLUDED", inst_units_cap: 20000 }, defaultItem("ai_calling")] });
  const first = diffVersions(null, v1, FEATURES);
  assert.ok(first.some((d) => d.what === "Price" && d.to === "₹5,000 + GST"));
  assert.ok(first.some((d) => d.what === "learner assistant"));
  assert.ok(!first.some((d) => d.what === "ai calling"), "charged items of a first version are not noise");
  const v2 = version({ id: "v2", version_no: 2, price_minor: 600000, items: [{ ...defaultItem("learner_assistant"), mode: "INCLUDED", inst_units_cap: 20000 }, { ...defaultItem("image_generation"), mode: "ALLOWANCE" }] });
  const d = diffVersions(v1, v2, FEATURES);
  assert.deepEqual(d.map((x) => x.what).sort(), ["Price", "image generation"].sort());
  assert.equal(d.find((x) => x.what === "image generation")?.from, "Charged");
});

test("buildPlanCreate validates the key", () => {
  assert.ok("error" in buildPlanCreate({ plan_key: "AI Pro", name: "AI Pro", description: "", reason: "r" }));
  assert.ok("error" in buildPlanCreate({ plan_key: "ai_pro", name: "", description: "", reason: "r" }));
  const ok = buildPlanCreate({ plan_key: "ai_starter", name: " AI Starter ", description: " ", reason: " r " });
  assert.deepEqual(ok, { body: { plan_key: "ai_starter", name: "AI Starter", description: null, reason: "r" } });
});

// ---------------------------------------------------------------- subscriptions

test("buildAssign: only a PUBLISHED version, defaults SHADOW, price override in paise", () => {
  const now = new Date("2026-10-15T10:30:00");
  const d = { ...emptyAssignDraft(now, "inst-1"), plan_version_id: "v1", reason: "pilot" };
  assert.equal(d.enforcement, "SHADOW");
  assert.ok("error" in buildAssign(d, { id: "v1", status: "DRAFT" }));
  assert.ok("error" in buildAssign(d, null));
  assert.ok("error" in buildAssign({ ...d, institute_id: " " }, { id: "v1", status: "PUBLISHED" }));
  assert.ok("error" in buildAssign({ ...d, reason: "" }, { id: "v1", status: "PUBLISHED" }));
  const ok = buildAssign({ ...d, price_override_rupees: "3500" }, { id: "v1", status: "PUBLISHED" });
  assert.ok("body" in ok);
  if ("body" in ok) {
    assert.equal(ok.body.enforcement, "SHADOW");
    assert.equal(ok.body.price_override_minor, 350000);
    assert.equal(ok.body.start_at, now.toISOString());
    assert.equal(ok.body.source, "MANUAL");
  }
  const noOverride = buildAssign(d, { id: "v1", status: "PUBLISHED" });
  assert.ok("body" in noOverride && !("price_override_minor" in noOverride.body));
});

test("buildOverride respects eligibility and needs a change; applyOverride merges", () => {
  const f = FEATURES[0];
  assert.ok("error" in buildOverride({ ...emptyOverrideDraft("learner_assistant"), reason: "r" }, f), "no change");
  assert.ok("error" in buildOverride({ ...emptyOverrideDraft("ai_calling"), mode: "INCLUDED", reason: "r" }, FEATURES[2]));
  const ok = buildOverride({ ...emptyOverrideDraft("learner_assistant"), user_units_cap: "500", reason: " deal " }, f);
  assert.ok("body" in ok);
  if ("body" in ok) {
    assert.equal(ok.body.mode, null);
    assert.equal(ok.body.user_units_cap, 500);
    const merged = applyOverride({ ...defaultItem("learner_assistant"), mode: "INCLUDED", user_units_cap: 300, inst_units_cap: 20000 }, ok.body);
    assert.equal(merged.mode, "INCLUDED");
    assert.equal(merged.user_units_cap, 500);
    assert.equal(merged.inst_units_cap, 20000);
  }
});

test("liveSubscription and allowanceMeter", () => {
  const subs = [
    normalizeSubscription({ id: "a", institute_id: "i", status: "EXPIRED" }),
    normalizeSubscription({ id: "b", institute_id: "i", status: "GRACE" }),
  ];
  assert.equal(liveSubscription(subs)?.id, "b");
  assert.equal(liveSubscription([subs[0]]), null);
  assert.deepEqual(allowanceMeter({ allowance_credits: 2000, allowance_used: 500 }), { credits: 2000, used: 500, remaining: 1500, pct: 25 });
  assert.deepEqual(allowanceMeter(null), { credits: 0, used: 0, remaining: 0, pct: null });
  assert.equal(allowanceMeter({ allowance_credits: 100, allowance_used: 150 }).pct, 100);
});

// ---------------------------------------------------------------- simulate and P&L

test("normalizeSimulation: client totals when the server sends none", () => {
  const r = normalizeSimulation(
    { features: [{ feature_key: "content_generation", list_credits: 100, included_credits: 100, real_cost_usd: 1 }, { feature_key: "ai_calling", list_credits: 300, charged_credits: 300, real_cost_usd: 4 }] },
    { plan_version_id: "v1", institute_id: "i1", days: 60, price_minor: 500000, period_months: 1, inr_per_usd: 86 }
  );
  assert.equal(r.server_totals, false);
  assert.equal(r.revenue_inr, 10000, "₹5,000 a month over 60 days");
  assert.equal(r.absorbed_cost_inr, 86, "only the included work's cost");
  assert.equal(r.real_cost_inr_total, 430);
  assert.equal(r.margin_inr, 10000 - 86);
  assert.equal(r.rows[0].feature_key, "ai_calling", "sorted by list credits");
  const s = normalizeSimulation({ rows: [], totals: { revenue_inr: 5000, margin_inr: 4000, absorbed_cost_inr: 1000 }, inr_per_usd: 90 }, { plan_version_id: "v1", institute_id: "i1", days: 30, price_minor: 0, period_months: 1, inr_per_usd: 86 });
  assert.equal(s.server_totals, true);
  assert.equal(s.margin_inr, 4000);
  assert.equal(s.inr_per_usd, 90);
});

test("normalizePnl: margin fallback, totals and CSV escaping", () => {
  const p = normalizePnl(
    { inr_per_usd: 86, rows: [{ institute_id: "i1", institute_name: 'Acme, "Ltd"', price_minor: 500000, real_cost_usd_total: "10", included_cost_usd: 8, allowance_cost_usd: 2, included_list_credits: 120 }, { institute_id: "i2", price_minor: 0, real_cost_usd: 1, margin_inr: -86, plan_cost_inr: 86, basis: "SHADOW" }] },
    "current"
  );
  assert.equal(p.rows[0].plan_cost_inr, 860, "plan cost = (included + allowance) real cost");
  assert.equal(p.rows[0].margin_inr, 5000 - 860);
  assert.equal(p.rows[1].margin_inr, -86, "the server's margin wins");
  assert.equal(p.rows[1].basis, "SHADOW");
  assert.equal(p.rows[0].cost_estimated_events, 0);
  assert.equal(normalizePnl([{ institute_id: "e", cost_basis: "ESTIMATED", cost_estimated_events: "4" }], "current").rows[0].cost_estimated_events, 4);
  const t = pnlTotals(p.rows);
  assert.equal(t.revenue_inr, 5000);
  assert.equal(t.plan_cost_inr, 946);
  assert.equal(t.margin_inr, 5000 - 860 - 86);
  // The engine returns a bare list; the router wraps it as { rows }.
  assert.equal(normalizePnl([{ institute_id: "x", price_minor: 100 }], "previous").period, "previous");
  const csv = pnlCsv(p.rows).split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[1], /^i1,"Acme, ""Ltd""",/);
  assert.equal(marginTone(4140, 5000), "ok");
  assert.equal(marginTone(1000, 5000), "warn");
  assert.equal(marginTone(-86, 0), "error");
  assert.equal(marginTone(0, 0), "off");
});

test("settings: plans switch is off unless set, rate falls back to 86", () => {
  assert.equal(settingBool(null), null);
  assert.equal(settingBool(setting("billing.plans.enabled", false, { default: false })), false);
  assert.equal(settingBool(setting("billing.plans.enabled", null, { default: false, effective: true })), true);
  assert.equal(settingNumber(null, 86), 86);
  assert.equal(settingNumber(setting("billing.inr_per_usd", "88.5", { type: "number" }), 86), 88.5);
  assert.equal(settingNumber(setting("billing.inr_per_usd", 0, { type: "number" }), 86), 86);
});

test("backend shapes: subscriber counts, use-case objects, list counts, version price", () => {
  const plans = normalizePlans({
    plans: [
      {
        id: "p1",
        plan_key: "ai_pro",
        name: "AI Pro",
        subscribers: { live: 2, shadow: 3 },
        versions: [{ id: "v1", version_no: 1, status: "PUBLISHED", subscribers: { live: 2, shadow: 1 }, included_count: 9, item_count: 24 }],
        live_version: { id: "v1", version_no: 1, status: "PUBLISHED" },
      },
    ],
    plans_enabled: false,
  });
  assert.equal(plans[0].live_subscriptions, 2);
  assert.equal(plans[0].shadow_subscriptions, 3);
  assert.equal(plans[0].versions.length, 1, "live_version is not duplicated");
  assert.equal(plans[0].versions[0].subscriber_count, 3);
  assert.equal(plans[0].versions[0].included_count, 9);
  const f = normalizeFeatures({ features: [{ feature_key: "kb_qa", label: "KB", eligibility: "INCLUDABLE", use_cases: [{ use_case: "knowledge_base", label: "KB" }, "kb_companion"] }] });
  assert.deepEqual(f[0].use_cases, ["knowledge_base", "kb_companion"]);
  const s = normalizeSubscription({ id: "s", institute_id: "i", status: "ACTIVE", price_minor: 500000, current_period: { allowance_credits: 2000, allowance_used: 0, allowance_remaining: 2000 } });
  assert.equal(s.version_price_minor, 500000);
});

test("normalizeSimulation: the engine's shape (features + totals, revenue_minor, plan_cost_usd)", () => {
  const r = normalizeSimulation(
    {
      plan_version_id: "v1",
      institute_id: "i1",
      days: 30,
      revenue_minor: 493151,
      inr_per_usd: 86,
      truncated: true,
      features: [
        { feature_key: "learner_assistant", events: 10, list_credits: 5, included_credits: 5, charged_credits: 0, real_cost_usd: 0.05, plan_cost_usd: 0.05, over_cap_events: 0 },
        { feature_key: "content_generation", events: 4, list_credits: 50, included_credits: 20, charged_credits: 30, real_cost_usd: 0.5, plan_cost_usd: 0.2, over_cap_events: 2, model_not_included_events: 1 },
      ],
      totals: { revenue_inr: 4931.51, plan_cost_inr: 21.5, margin_inr: 4910.01, margin_pct: 99.6 },
    },
    { plan_version_id: "v1", institute_id: "i1", days: 30, price_minor: 500000, period_months: 1, inr_per_usd: 86 }
  );
  assert.equal(r.server_totals, true);
  assert.equal(r.revenue_inr, 4931.51);
  assert.equal(r.absorbed_cost_inr, 21.5);
  assert.equal(r.margin_inr, 4910.01);
  assert.equal(r.truncated, true);
  assert.equal(r.over_cap_events, 2);
  assert.equal(r.rows.find((x) => x.feature_key === "content_generation")?.not_covered_events, 1);
  // Without server totals, revenue_minor and per-feature plan_cost_usd are used.
  const c = normalizeSimulation(
    { revenue_minor: 100000, features: [{ feature_key: "a", list_credits: 10, included_credits: 10, real_cost_usd: 1, plan_cost_usd: 0.5 }] },
    { plan_version_id: "v1", institute_id: "i1", days: 30, price_minor: 500000, period_months: 1, inr_per_usd: 80 }
  );
  assert.equal(c.revenue_inr, 1000);
  assert.equal(c.absorbed_cost_inr, 40);
  assert.equal(c.margin_inr, 960);
});
