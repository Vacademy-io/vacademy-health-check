// Run: npm test  (node --test with native TypeScript stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrials,
  dailyPlatformSeries,
  daysUntil,
  monthlyValueMinor,
  revenueBucket,
  stageCounts,
  stageFromLeadTag,
  suggestPresetKey,
  summarizeRevenue,
  trialEndDate,
  PRODUCTS,
} from "../src/lib/command-center.ts";
import type { Subscription } from "../src/types/plans.ts";

const NOW = new Date("2026-11-03T12:00:00Z");

function sub(over: Partial<Subscription> & { payment?: string | null; price?: number } = {}): Subscription {
  const { payment = "PAID", price = 500000, ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2),
    institute_id: "inst-1",
    institute_name: "Inst One",
    plan_version_id: "v1",
    plan_id: "p1",
    plan_key: "pro",
    plan_name: "Pro",
    version_no: 1,
    status: "ACTIVE",
    enforcement: "LIVE",
    source: "PAYMENT",
    anchor_at: null,
    start_at: "2026-01-01T00:00:00Z",
    end_at: null,
    period_months: 1,
    auto_renew: true,
    grace_days: 7,
    cancel_at_period_end: false,
    pending_plan_version_id: null,
    price_override_minor: null,
    version_price_minor: price,
    reason: null,
    created_by: null,
    created_at: null,
    updated_by: null,
    updated_at: null,
    current_period: {
      id: "per",
      period_start: null,
      period_end: null,
      plan_version_id: "v1",
      price_minor_snapshot: price,
      allowance_credits: 0,
      allowance_used: 0,
      payment_status: payment,
    },
    ...rest,
  } as Subscription;
}

test("monthly value divides by the billing period and prefers the override", () => {
  assert.equal(monthlyValueMinor(sub({ price: 1200000, period_months: 12 })), 100000);
  assert.equal(monthlyValueMinor(sub({ price: 300000, period_months: 3 })), 100000);
  assert.equal(monthlyValueMinor(sub({ price: 500000, price_override_minor: 200000 })), 200000);
  assert.equal(monthlyValueMinor(sub({ price: 0 })), 0);
});

test("revenue buckets: paid counts, marked-paid counts, waived and complimentary don't", () => {
  assert.equal(revenueBucket(sub()), "MRR");
  assert.equal(revenueBucket(sub({ status: "GRACE" })), "MRR");
  assert.equal(revenueBucket(sub({ payment: "DUE" })), "DUE");
  assert.equal(revenueBucket(sub({ status: "PENDING", payment: null })), "DUE");
  assert.equal(revenueBucket(sub({ payment: "WAIVED" })), "NON_REVENUE");
  assert.equal(revenueBucket(sub({ payment: "REFUNDED" })), "NON_REVENUE");
  assert.equal(revenueBucket(sub({ source: "COMPLIMENTARY" })), "NON_REVENUE");
  assert.equal(revenueBucket(sub({ price: 0 })), "NON_REVENUE");
  assert.equal(revenueBucket(sub({ status: "TRIAL" })), "TRIAL");
  assert.equal(revenueBucket(sub({ status: "CANCELLED" })), "ENDED");
});

test("summary: MRR, at risk, due, new, churned and plan mix", () => {
  const subs = [
    sub({ institute_id: "a", price: 500000 }), // 5,000/mo
    sub({ institute_id: "b", price: 1200000, period_months: 12, plan_name: "Annual" }), // 1,000/mo
    sub({ institute_id: "c", status: "GRACE", price: 300000 }), // 3,000/mo, at risk
    sub({ institute_id: "d", start_at: "2026-10-20T00:00:00Z", price: 200000 }), // new
    sub({ institute_id: "e", payment: "DUE", price: 400000 }), // due, not MRR
    sub({ institute_id: "f", status: "TRIAL" }),
    sub({ institute_id: "g", status: "CANCELLED", end_at: "2026-10-25T00:00:00Z", price: 100000 }), // churned
    sub({ institute_id: "h", status: "EXPIRED", end_at: "2026-06-01T00:00:00Z" }), // ended long ago
    sub({ institute_id: "i", payment: "WAIVED" }),
  ];
  const r = summarizeRevenue(subs, NOW, 30);
  assert.equal(r.mrrMinor, 500000 + 100000 + 300000 + 200000);
  assert.equal(r.payingInstitutes, 4);
  assert.equal(r.atRiskCount, 1);
  assert.equal(r.atRiskMinor, 300000);
  assert.equal(r.dueCount, 1);
  assert.equal(r.dueMinor, 400000);
  assert.equal(r.trials, 1);
  assert.equal(r.newCount, 1);
  assert.equal(r.newMinor, 200000);
  assert.equal(r.churnedCount, 1);
  assert.equal(r.churnedMinor, 100000);
  assert.deepEqual(r.planMix.map((p) => [p.plan, p.subscriptions]), [["Pro", 3], ["Annual", 1]]);
  assert.equal(r.mrrRows[0].institute_id, "a");
});

test("daily platform series: zero-filled window, paid counts only real paid subscriptions", () => {
  const now = new Date(2026, 10, 3, 15);
  const day = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
  const { daily, totals } = dailyPlatformSeries(
    [day(1), day(3), day(3), day(20)], // the 20th is outside the window
    [{ startedAt: day(2) }, { startedAt: null }],
    [
      sub({ start_at: day(3) }), // paid
      sub({ start_at: day(2), status: "TRIAL" }), // trial, not paid
      sub({ start_at: day(2), source: "COMPLIMENTARY" }), // free
      sub({ start_at: day(1), status: "CANCELLED" }), // was paid, then cancelled: still a paid start
    ],
    3,
    now
  );
  assert.deepEqual(daily.map((d) => d.date), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(daily.map((d) => [d.accounts, d.trials, d.paid]), [[1, 0, 1], [0, 1, 0], [2, 0, 1]]);
  assert.deepEqual(totals, { accounts: 3, trials: 1, paid: 2 });
});

test("lead tags map onto stages", () => {
  assert.equal(stageFromLeadTag("LEAD"), "Lead");
  assert.equal(stageFromLeadTag("FREE_TRIAL"), "Trial");
  assert.equal(stageFromLeadTag("PROD"), "Paid");
  assert.equal(stageFromLeadTag("TEST"), "Test");
  assert.equal(stageFromLeadTag(null), "Untagged");
});

test("stage counts: untagged is the remainder and never negative", () => {
  assert.deepEqual(stageCounts(100, { LEAD: 10, FREE_TRIAL: 5, PROD: 20, TEST: 3 }), { Lead: 10, Trial: 5, Paid: 20, Test: 3, Untagged: 62 });
  assert.equal(stageCounts(5, { PROD: 9 }).Untagged, 0);
});

test("product presets: matched by key or name, null when none fits", () => {
  const presets = [
    { key: "lms_basic", name: "LMS basic" },
    { key: "ai_calling", name: "Telleo calling" },
    { key: "exam_eval", name: "Evaluation only" },
  ];
  assert.equal(suggestPresetKey("telleo", presets), "ai_calling");
  assert.equal(suggestPresetKey("evalezy", presets), "exam_eval");
  assert.equal(suggestPresetKey("vacademy", presets), "lms_basic");
  assert.equal(suggestPresetKey("voomsales", presets), null);
});

test("trial end date is a local YYYY-MM-DD n days ahead", () => {
  assert.equal(trialEndDate(14, new Date(2026, 10, 3, 10)), "2026-11-17");
  assert.equal(trialEndDate(30, new Date(2026, 11, 15, 10)), "2027-01-14");
});

test("only products on Vacademy sign-in can be provisioned", () => {
  assert.deepEqual(PRODUCTS.filter((p) => p.canProvision).map((p) => p.key), ["vacademy", "telleo", "evalezy"]);
});

test("days until: rounds up, negative once past, null without a date", () => {
  assert.equal(daysUntil("2026-11-05T12:00:00Z", NOW), 2);
  assert.equal(daysUntil("2026-11-01T12:00:00Z", NOW), -2);
  assert.equal(daysUntil(null, NOW), null);
});

test("trials merge demos, tags and AI plan trials into one row per institute", () => {
  const rows = buildTrials(
    [
      { provisionedInstituteId: "a", organizationName: "Alpha", provisionedAt: "2026-11-01T00:00:00Z", demoExpiresAt: "2026-11-05T12:00:00Z", contactEmail: "x@alpha.in" },
      { organizationName: "No demo yet" },
    ],
    [
      { id: "a", name: "Alpha Inst", email: "", created_at: "2026-10-01" },
      { id: "b", name: "Beta", email: "b@beta.in", created_at: "2026-10-02" },
    ],
    [sub({ institute_id: "c", institute_name: "Gamma", status: "TRIAL" }), sub({ institute_id: "d", status: "ACTIVE" })],
    NOW
  );
  assert.equal(rows.length, 3);
  const a = rows.find((r) => r.instituteId === "a")!;
  assert.deepEqual(a.sources, ["DEMO", "TAG"]);
  assert.equal(a.name, "Alpha");
  assert.equal(a.daysLeft, 2);
  assert.equal(a.contact, "x@alpha.in");
  assert.deepEqual(rows.find((r) => r.instituteId === "c")!.sources, ["AI_PLAN"]);
  assert.equal(rows[0].instituteId, "a"); // dated trials first; rows without an end date sort last, by name
});
