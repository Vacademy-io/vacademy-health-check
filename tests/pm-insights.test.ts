// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountSignal,
  AI_TOOLS_SQL,
  biggestDrop,
  buildFunnel,
  churnSummary,
  cohort,
  FEATURE_SQL,
  featureAdoption,
  isReadOnlySql,
  signupsByWeek,
  STAFF_SQL,
  toolLabel,
  type Signals,
} from "../src/lib/pm-insights.ts";
import { buildAccounts, type AccountRow } from "../src/lib/pm-view.ts";
import { emptyRecord, sanitizeRecord, type PmRecord } from "../src/lib/pm-record.ts";
import type { InstituteListItemDTO } from "../src/types/api.ts";
import type { Subscription } from "../src/types/plans.ts";

const TODAY = "2026-11-21";

function inst(id: string, over: Partial<InstituteListItemDTO> = {}): InstituteListItemDTO {
  return { id, name: `Inst ${id}`, email: "", city: "", state: "", type: "SCHOOL", logo_file_id: null, subdomain: id, created_at: "2026-11-01T00:00:00Z", student_count: 0, course_count: 0, batch_count: 0, lead_tag: null, ...over };
}
const rec = (id: string, over: Partial<PmRecord> = {}): PmRecord => ({ ...emptyRecord(id, `Inst ${id}`), ...over });
const accounts = (list: InstituteListItemDTO[], records: PmRecord[] = []): AccountRow[] =>
  buildAccounts(list, [], [], new Map(), new Map(records.map((r) => [r.instituteId, r])), TODAY);

test("only single read-only SELECTs pass the guard", () => {
  assert.ok(isReadOnlySql("SELECT 1"));
  assert.ok(isReadOnlySql("  with x as (select 1) select * from x;"));
  assert.ok(isReadOnlySql("SELECT 'drop table x' AS note"));
  assert.ok(!isReadOnlySql("SELECT 1; DROP TABLE users"));
  assert.ok(!isReadOnlySql("UPDATE users SET name = 'x'"));
  assert.ok(!isReadOnlySql("WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d"));
  assert.ok(!isReadOnlySql("insert into x values (1)"));
});

test("every query the PM View sends is a read-only SELECT", () => {
  for (const [k, q] of Object.entries(FEATURE_SQL)) assert.ok(isReadOnlySql(q.sql), k);
  assert.ok(isReadOnlySql(STAFF_SQL));
  assert.ok(isReadOnlySql(AI_TOOLS_SQL));
});

test("funnel: each step counts only accounts that passed the steps above it", () => {
  const rows = accounts([
    inst("none"), // signed up only
    inst("login"),
    inst("course", { course_count: 2 }),
    inst("full", { course_count: 1, student_count: 30 }),
    inst("paid", { course_count: 1, student_count: 5, lead_tag: "PROD" }),
    inst("nologin-course", { course_count: 3 }), // made a course but no staff login recorded: stops at "Logged in"
  ]);
  const signals: Signals = {
    features: { live: new Map([["full", { total: 2, d30: 1 }]]) },
    staff: new Map(
      ["login", "course", "full", "paid"].map((id) => [id, { staff: 1, staffLoggedIn: 1, staffLastLogin: id === "full" || id === "paid" ? "2026-11-20T10:00:00Z" : "2026-09-01T10:00:00Z", studentsActive30: 0 }])
    ),
  };
  const steps = buildFunnel(rows, (a) => accountSignal(a, signals, TODAY));
  assert.deepEqual(steps.map((s) => s.count), [6, 4, 3, 2, 2, 1]);
  assert.deepEqual(steps[1].stuck.map((a) => a.id).sort(), ["nologin-course", "none"]);
  assert.equal(biggestDrop(steps)?.key, "logged_in");
});

test("active in the last 30 days counts logins, student logins and any recent feature use", () => {
  const [a] = accounts([inst("a")]);
  const base: Signals = { features: {}, staff: new Map() };
  assert.equal(accountSignal(a, base, TODAY).active30, false);
  assert.equal(accountSignal(a, { ...base, staff: new Map([["a", { staff: 1, staffLoggedIn: 1, staffLastLogin: "2026-11-01T00:00:00Z", studentsActive30: 0 }]]) }, TODAY).active30, true);
  assert.equal(accountSignal(a, { ...base, staff: new Map([["a", { staff: 0, staffLoggedIn: 0, staffLastLogin: null, studentsActive30: 4 }]]) }, TODAY).active30, true);
  assert.equal(accountSignal(a, { features: { ai: new Map([["a", { total: 9, d30: 2 }]]) }, staff: null }, TODAY).active30, true);
  // Logins unknown until the query loads.
  assert.equal(accountSignal(a, { features: {}, staff: null }, TODAY).loggedIn, null);
});

test("cohort keeps real sign-ups in the window, for one product", () => {
  const rows = accounts(
    [inst("new", { created_at: "2026-11-10T00:00:00Z" }), inst("old", { created_at: "2026-05-01T00:00:00Z" }), inst("test", { lead_tag: "TEST" }), inst("tel", { created_at: "2026-11-12T00:00:00Z" })],
    [rec("tel", { products: ["telleo"] })]
  );
  assert.deepEqual(cohort(rows, TODAY, 30, "").map((a) => a.id).sort(), ["new", "tel"]);
  assert.deepEqual(cohort(rows, TODAY, 30, "telleo").map((a) => a.id), ["tel"]);
  assert.deepEqual(cohort(rows, TODAY, 30, "NONE").map((a) => a.id), ["new"]);
});

test("sign-ups per week start on Monday and cover the requested weeks", () => {
  const rows = accounts([inst("a", { created_at: "2026-11-16T09:00:00Z" }), inst("b", { created_at: "2026-11-21T09:00:00Z" }), inst("c", { created_at: "2026-11-09T09:00:00Z" })]);
  const weeks = signupsByWeek(rows, TODAY, 3);
  assert.deepEqual(weeks, [
    { week: "2026-11-02", count: 0 },
    { week: "2026-11-09", count: 1 },
    { week: "2026-11-16", count: 2 },
  ]);
});

test("feature adoption compares paying customers with non-paying institutes that logged in", () => {
  const rows = accounts([inst("p1", { lead_tag: "PROD", course_count: 1 }), inst("p2", { lead_tag: "PROD" }), inst("f1", { course_count: 1 }), inst("f2"), inst("ghost")]);
  const signals: Signals = {
    features: { live: new Map([["p1", { total: 3, d30: 1 }], ["p2", { total: 1, d30: 0 }]]) },
    staff: new Map(["p1", "p2", "f1", "f2"].map((id) => [id, { staff: 1, staffLoggedIn: 1, staffLastLogin: "2026-11-20T00:00:00Z", studentsActive30: 0 }])),
  };
  const live = featureAdoption(rows, (a) => accountSignal(a, signals, TODAY)).find((f) => f.key === "live")!;
  assert.deepEqual([live.using, live.using30, live.payingUsing, live.payingTotal, live.freeUsing, live.freeTotal, live.lift], [2, 1, 2, 2, 0, 2, 100]);
  const courses = featureAdoption(rows, (a) => accountSignal(a, signals, TODAY)).find((f) => f.key === "courses")!;
  assert.equal(courses.lift, 0);
});

test("churn: ended plans, planned cancellations, lost trials and recorded reasons", () => {
  const rows = accounts(
    [inst("gone"), inst("leaving"), inst("lost1"), inst("lost2"), inst("lost3")],
    [rec("lost1", { classification: "LOST", lostReason: "PRICE" }), rec("lost2", { classification: "LOST", lostReason: "PRICE" }), rec("lost3", { classification: "LOST" })]
  );
  const subs = [
    { institute_id: "gone", institute_name: null, plan_name: "Pro", status: "CANCELLED", updated_at: "2026-11-15T00:00:00Z", end_at: null, cancel_at_period_end: false, reason: "Budget cut" },
    { institute_id: "leaving", institute_name: null, plan_name: "Pro", status: "ACTIVE", updated_at: null, end_at: "2026-12-01T00:00:00Z", cancel_at_period_end: true, reason: null },
    { institute_id: "gone", institute_name: null, plan_name: "Old", status: "EXPIRED", updated_at: null, end_at: "2025-01-01T00:00:00Z", cancel_at_period_end: false, reason: null },
  ] as unknown as Subscription[];
  const c = churnSummary(rows, subs, TODAY, 30);
  assert.deepEqual(c.plansEnded.map((x) => [x.instituteId, x.reason]), [["gone", "Budget cut"]]);
  assert.deepEqual(c.cancelling.map((x) => x.instituteId), ["leaving"]);
  assert.equal(c.lostTotal, 3);
  assert.deepEqual(c.reasons.map((r) => [r.reason, r.count]), [["PRICE", 2], ["NONE", 1]]);
});

test("lost reason is kept by the sanitizer and unknown values are dropped", () => {
  assert.equal(sanitizeRecord({ instituteId: "a", lostReason: "competitor" })?.lostReason, "COMPETITOR");
  assert.equal(sanitizeRecord({ instituteId: "a", lostReason: "bored" })?.lostReason, null);
});

test("AI tool names read as words", () => {
  assert.equal(toolLabel("CONTENT_GENERATION"), "Content generation");
  assert.equal(toolLabel(""), "Unknown");
});
