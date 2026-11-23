// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAccounts,
  buildInbox,
  buildInsights,
  buildConversions,
  dashboardStats,
  callsByInstitute,
  callsPerDay,
  weekStart,
  summarizeConversions,
  topFocus,
  weeklyTrafficChange,
  whenOf,
  daysBetween,
  filterAccounts,
  productFromCode,
  productsFromSelections,
  findMismatches,
  nextYearly,
  openTasks,
  parseCsv,
  planImport,
  registerCsv,
  toCsv,
  upcomingKeyDates,
} from "../src/lib/pm-view.ts";
import { durationText, endDateFor, phoneDigits, emptyRecord, normalizeDate, recordMonthlyValue, sanitizeRecord, diffRecords, type PmRecord } from "../src/lib/pm-record.ts";
import type { InstituteListItemDTO } from "../src/types/api.ts";
import type { Subscription } from "../src/types/plans.ts";

const TODAY = "2026-11-21";

function inst(id: string, over: Partial<InstituteListItemDTO> = {}): InstituteListItemDTO {
  return {
    id,
    name: `Inst ${id}`,
    email: `${id}@x.com`,
    city: "Pune",
    state: "MH",
    type: "SCHOOL",
    logo_file_id: null,
    subdomain: id,
    created_at: "2026-10-01T00:00:00Z",
    student_count: 0,
    course_count: 0,
    batch_count: 0,
    lead_tag: null,
    ...over,
  };
}

function sub(institute_id: string, over: Partial<Subscription> = {}): Subscription {
  return {
    id: `s-${institute_id}`,
    institute_id,
    institute_name: null,
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
    period_months: 12,
    auto_renew: true,
    grace_days: 7,
    cancel_at_period_end: false,
    pending_plan_version_id: null,
    price_override_minor: null,
    version_price_minor: 6000000,
    reason: null,
    created_by: null,
    created_at: null,
    updated_by: null,
    updated_at: null,
    current_period: { id: "p", period_start: null, period_end: null, plan_version_id: "v1", price_minor_snapshot: 6000000, allowance_credits: 0, allowance_used: 0, payment_status: "PAID" },
    ...over,
  } as Subscription;
}

const rec = (id: string, over: Partial<PmRecord> = {}): PmRecord => ({ ...emptyRecord(id, `Inst ${id}`), ...over });

test("normalizeDate accepts ISO and day-first, rejects impossible dates", () => {
  assert.equal(normalizeDate("2026-03-01"), "2026-03-01");
  assert.equal(normalizeDate("01/03/2026"), "2026-03-01");
  assert.equal(normalizeDate("2026-03-01T10:00:00Z"), "2026-03-01");
  assert.equal(normalizeDate("31/02/2026"), "");
  assert.equal(normalizeDate("soon"), "");
});

test("sanitizeRecord drops bad enums and keeps valid fields", () => {
  const r = sanitizeRecord({ instituteId: "a", classification: "Genuine client", subscriptionType: "weekly", finalPrice: "₹60,000", attachments: ["javascript:x", "https://drive.google.com/x"], hack: 1 });
  assert.ok(r);
  assert.equal(r.classification, "PRODUCTION");
  assert.equal(r.subscriptionType, null);
  assert.equal(r.finalPrice, 60000);
  assert.deepEqual(r.attachments, ["https://drive.google.com/x"]);
  assert.equal((r as unknown as Record<string, unknown>).hack, undefined);
  assert.equal(sanitizeRecord({ classification: "PRODUCTION" }), null);
});

test("recordMonthlyValue divides by the period", () => {
  assert.equal(recordMonthlyValue({ finalPrice: 60000, subscriptionType: "ANNUAL" }), 5000);
  assert.equal(recordMonthlyValue({ finalPrice: 9000, subscriptionType: "QUARTERLY" }), 3000);
  assert.equal(recordMonthlyValue({ finalPrice: 9000, subscriptionType: "ONE_TIME" }), null);
});

test("diffRecords lists changed fields only", () => {
  const a = rec("a", { classification: "TRIAL" });
  const b = { ...a, classification: "PRODUCTION" as const, updatedAt: "x" };
  assert.deepEqual(diffRecords(a, b).map((c) => c.field), ["classification"]);
  assert.equal(diffRecords(null, b)[0].field, "created");
});

test("nextYearly handles this year, next year and 29 Feb", () => {
  assert.deepEqual(nextYearly("2024-12-01", TODAY), { date: "2026-12-01", years: 2 });
  assert.deepEqual(nextYearly("2025-01-10", TODAY), { date: "2027-01-10", years: 2 });
  assert.deepEqual(nextYearly("2024-02-29", TODAY), { date: "2027-02-28", years: 3 });
  assert.equal(daysBetween(TODAY, "2026-11-30"), 9);
});

test("PM classification never changes the platform tag, and disagreements are flagged", () => {
  const rows = buildAccounts(
    [inst("a", { lead_tag: "TEST" }), inst("b", { lead_tag: "PROD" }), inst("c")],
    [sub("b")],
    [],
    new Map(),
    new Map([
      ["a", rec("a", { classification: "PRODUCTION" })],
      ["b", rec("b", { classification: "TEST" })],
    ]),
    TODAY
  );
  const a = rows.find((r) => r.id === "a")!;
  const b = rows.find((r) => r.id === "b")!;
  assert.equal(a.platformTag, "TEST");
  assert.equal(a.pmClass, "PRODUCTION");
  assert.deepEqual(a.mismatches, ["Platform tag is TEST"]);
  assert.match(b.mismatches[0], /paying/);
  assert.equal(rows.find((r) => r.id === "c")!.mismatches.length, 0);
});

test("price mismatch compares the register price with the platform period price", () => {
  const m = findMismatches({ pmClass: "PRODUCTION", platformTag: "PROD", paid: true, subscription: sub("x"), record: rec("x", { finalPrice: 50000, subscriptionType: "ANNUAL" }) });
  assert.deepEqual(m, ["Price differs: register ₹50,000, platform ₹60,000"]);
});

test("quick filters combine (Active institutes + PROD on platform + Not yet reviewed)", () => {
  const rows = buildAccounts(
    [inst("a", { lead_tag: "PROD" }), inst("b", { lead_tag: "PROD" }), inst("c", { lead_tag: "PROD" })],
    [],
    [],
    new Map([["a", 3], ["b", 1]]),
    new Map([["b", rec("b", { classification: "PRODUCTION" })]]),
    TODAY
  );
  assert.deepEqual(filterAccounts(rows, ["active", "paying", "unreviewed"], "").map((r) => r.id), ["a"]);
  assert.deepEqual(filterAccounts(rows, [], "inst c").map((r) => r.id), ["c"]);
  assert.deepEqual(filterAccounts(rows, ["production"], "").map((r) => r.id), ["b"]);
});

test("register entries without a platform institute still appear", () => {
  const rows = buildAccounts([], [], [], new Map(), new Map([["manual-1", rec("manual-1", { name: "Offline School", classification: "PRODUCTION" })]]), TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Offline School");
});

test("key dates: renewal, anniversary, birthday, overdue payment", () => {
  const rows = buildAccounts(
    [inst("a")],
    [],
    [],
    new Map(),
    new Map([
      [
        "a",
        rec("a", {
          classification: "PRODUCTION",
          renewalDate: "2026-12-01",
          finalPrice: 60000,
          subscriptionType: "ANNUAL",
          goLiveDate: "2025-11-25",
          nextPaymentDue: "2026-11-15",
          contacts: [{ role: "Director", name: "Priya", email: "p@x.com", phone: "", birthday: "1990-11-23" }],
        }),
      ],
    ]),
    TODAY
  );
  const dates = upcomingKeyDates(rows, TODAY, 60);
  assert.deepEqual(dates.map((d) => d.type), ["PAYMENT_DUE", "BIRTHDAY", "ANNIVERSARY", "RENEWAL"]);
  assert.equal(dates.find((d) => d.type === "RENEWAL")!.amount, 5000);
  assert.match(dates.find((d) => d.type === "ANNIVERSARY")!.detail, /1 year/);
});

test("inbox: renewal, payment, trial ending, review summary; no sales quote tasks; done/snoozed hidden", () => {
  const rows = buildAccounts(
    [inst("a"), inst("t"), inst("p", { lead_tag: "PROD" })],
    [],
    [{ instituteId: "t", name: "Trial Co", sources: ["DEMO"], startedAt: null, endsAt: "2026-11-23T00:00:00Z", daysLeft: 2, contact: null }],
    new Map(),
    new Map([["a", rec("a", { classification: "PRODUCTION", renewalDate: "2026-11-25", nextPaymentDue: "2026-11-20" })]]),
    TODAY
  );
  const tasks = buildInbox(rows, TODAY);
  const kinds = tasks.map((t) => t.kind);
  for (const k of ["RENEWAL", "PAYMENT", "TRIAL", "REVIEW"]) assert.ok(kinds.includes(k as never), `missing ${k}`);
  assert.equal(tasks[0].severity, "high");

  const renewal = tasks.find((t) => t.kind === "RENEWAL")!;
  const trial = tasks.find((t) => t.kind === "TRIAL")!;
  const now = new Date("2026-11-21T09:00:00Z");
  const open = openTasks(tasks, [
    { key: renewal.key, state: "DONE", until: "", at: "", by: "" },
    { key: trial.key, state: "SNOOZED", until: "2026-11-22T09:00:00Z", at: "", by: "" },
  ], now);
  assert.ok(!open.some((t) => t.key === renewal.key || t.key === trial.key));
  assert.ok(openTasks(tasks, [{ key: trial.key, state: "SNOOZED", until: "2026-11-21T08:00:00Z", at: "", by: "" }], now).some((t) => t.key === trial.key));
});

test("CSV round trip with quotes, commas and formula guard", () => {
  const csv = toCsv(["a", "b"], [['He said "hi", ok', "=SUM(A1)"], ["-5", "x\ny"]]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [["a", "b"], ['He said "hi", ok', "'=SUM(A1)"], ["-5", "x\ny"]]);
});

test("import matches by id, subdomain, email; flags errors, duplicates and unmatched rows", () => {
  const institutes = [inst("a"), inst("b", { subdomain: "bee" }), inst("c", { email: "c@school.in" })];
  const records = new Map([["a", rec("a", { classification: "TRIAL" })]]);
  const csv = [
    "Institute ID,Subdomain,Institute email,Classification,Start date,Final price,Subscription type,Contact name",
    "a,,,PRODUCTION,01/04/2026,60000,ANNUAL,Priya",
    ",bee,,PRODUCTION,2026-05-01,,,",
    ",,c@school.in,production,not a date,,,",
    ",nope,,PRODUCTION,,,,",
    ",bee,,PRODUCTION,,,,",
    "a,,,TRIAL,,,,",
  ].join("\n");
  const { rows } = planImport(csv, institutes, records);
  assert.deepEqual(rows.map((r) => r.status), ["update", "new", "error", "unmatched", "error", "error"]);
  assert.equal(rows[0].matchedBy, "id");
  assert.equal(rows[1].matchedBy, "subdomain");
  assert.equal(rows[0].patch.startDate, "01/04/2026");
  assert.ok(rows[0].changedFields.includes("classification"));
  assert.match(rows[2].errors[0], /isn't a date/);
  assert.match(rows[4].errors[0], /earlier in the file/);
});

test("register export re-imports as unchanged", () => {
  const institutes = [inst("a")];
  const r = rec("a", { classification: "PRODUCTION", planName: "Growth", subscriptionType: "ANNUAL", startDate: "2026-04-01", finalPrice: 60000, autoRenew: true });
  const records = new Map([["a", r]]);
  const rows = buildAccounts(institutes, [], [], new Map(), records, TODAY);
  const plan = planImport(registerCsv(rows), institutes, records);
  assert.deepEqual(plan.unknownColumns, []);
  assert.equal(plan.rows[0].status, "unchanged", plan.rows[0].changedFields.join(","));
});

test("Genuine is no longer a separate label: old values read as Production", () => {
  assert.equal(sanitizeRecord({ instituteId: "a", classification: "GENUINE" })?.classification, "PRODUCTION");
  assert.equal(sanitizeRecord({ instituteId: "a", classification: "prod" })?.classification, "PRODUCTION");
  assert.equal(sanitizeRecord({ instituteId: "a", classification: "GOLD" })?.classification, null);
});

test("trial follow-ups come from usage: no login, stuck on setup, ending, update due, planned check-in", () => {
  const trial = (id: string, daysLeft: number, sources: ("DEMO" | "TAG")[] = ["DEMO"]) => ({ instituteId: id, name: id, sources, startedAt: "2026-11-15T00:00:00Z", endsAt: `2026-12-${String(1 + daysLeft).padStart(2, "0")}T00:00:00Z`, daysLeft, contact: null });
  const rows = buildAccounts(
    [inst("nologin"), inst("setup"), inst("ending"), inst("active", { course_count: 2, student_count: 40 }), inst("a"), inst("plan")],
    [],
    [trial("nologin", 10), trial("setup", 10), { ...trial("ending", 0), endsAt: "2026-11-21T18:00:00Z" }, trial("active", 10)],
    new Map(),
    new Map([
      ["a", rec("a", { classification: "PRODUCTION", renewalDate: "2026-11-18", finalPrice: 120000, subscriptionType: "ANNUAL" })],
      ["plan", rec("plan", { classification: "PRODUCTION", nextFollowUp: "2026-11-20", followUps: [{ date: "2026-11-10", outcome: "EVALUATING", note: "asking principal", by: "" }] })],
    ]),
    TODAY,
    {
      usage: new Map([
        ["nologin", { users: 1, loggedIn: 0, lastLogin: null }],
        ["setup", { users: 3, loggedIn: 2, lastLogin: "2026-11-20T10:00:00Z" }],
      ]),
    }
  );
  const stage = (id: string) => rows.find((r) => r.id === id)!.trialStage;
  assert.equal(stage("nologin"), "NOT_LOGGED_IN");
  assert.equal(stage("setup"), "SETTING_UP");
  assert.equal(stage("active"), "ACTIVE");
  assert.equal(stage("a"), null);
  assert.equal(rows.find((r) => r.id === "nologin")!.credentialsSentAt, "2026-11-15T00:00:00Z");

  const tasks = buildInbox(rows, TODAY, { platformActivityZero: true });
  for (const t of tasks) assert.ok(t.action.length > 5 && t.group && t.when, t.key);
  const byKey = (p: string) => tasks.find((t) => t.key.startsWith(p));
  assert.equal(byKey("trial-nologin:nologin")!.when, "OVERDUE");
  assert.match(byKey("trial-nologin:nologin")!.action, /login details/);
  assert.equal(byKey("trial-setup:setup")!.group, "TRIALS");
  assert.match(byKey("trial-end:ending")!.action, /decision/);
  assert.ok(byKey("trial-update:active"), "active trial with no update gets a check-in task");
  assert.equal(byKey("followup:plan")!.when, "OVERDUE");
  assert.equal(byKey("followup:plan")!.group, "RETAIN");
  assert.equal(byKey("renewal:a")!.impact, 10000);
  assert.ok(!tasks.some((t) => t.key.startsWith("quote:") || t.key.startsWith("signup:")), "no sales tasks");
  const top = topFocus(tasks);
  assert.ok(top.length === 3 && top.every((t) => t.group !== "HOUSEKEEPING"));
  assert.equal(whenOf(-1), "OVERDUE");
  assert.equal(whenOf(12), "LATER");
});

test("a recorded update clears the check-in task until it's a week old", () => {
  const t = { instituteId: "x", name: "x", sources: ["TAG" as const], startedAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-20T00:00:00Z", daysLeft: 29, contact: null };
  const build = (date: string) =>
    buildInbox(buildAccounts([inst("x", { course_count: 1 })], [], [t], new Map(), new Map([["x", rec("x", { followUps: [{ date, outcome: "POSITIVE", note: "", by: "" }] })]]), TODAY), TODAY);
  assert.ok(!build("2026-11-18").some((k) => k.key.startsWith("trial-update:")));
  assert.ok(build("2026-11-10").some((k) => k.key.startsWith("trial-update:")));
});

test("follow-up updates are validated and kept newest first", () => {
  const r = sanitizeRecord({ instituteId: "a", followUps: [{ date: "2026-11-01", outcome: "POSITIVE" }, { date: "2026-11-10", outcome: "needs help", note: "x" }, { date: "bad", outcome: "POSITIVE" }, { date: "2026-11-05", outcome: "MAYBE" }], nextFollowUp: "25/11/2026" })!;
  assert.deepEqual(r.followUps.map((f) => [f.date, f.outcome]), [["2026-11-10", "NEEDS_HELP"], ["2026-11-01", "POSITIVE"]]);
  assert.equal(r.nextFollowUp, "2026-11-25");
});

test("insights read the numbers and say where to focus, worst first", () => {
  const insights = buildInsights({
    days: 30, gaConfigured: true, visitors: 3245, leads: 2, newInstitutes: 53, activated: 10, trialsStarted: 19, paidStarted: 1,
    trialsEndingThisWeek: 4, trialsStuck: 6, topLeadSource: { name: "google / organic", leads: 2 },
    trafficChanges: [{ product: "Voomsales", changePct: -45 }], renewals30: 2, renewalValue30: 15000, unreviewedPaying: 3,
  });
  assert.equal(insights[0].key, "trial-conversion");
  assert.equal(insights[0].tone, "bad");
  assert.match(insights[0].focus, /4 trials end this week/);
  const keys = insights.map((i) => i.key);
  for (const k of ["activation", "lead-rate", "traffic-down:Voomsales", "top-source", "renewals", "unreviewed"]) assert.ok(keys.includes(k), k);
  assert.deepEqual(buildInsights({ days: 30, gaConfigured: false, visitors: 0, leads: 0, newInstitutes: 0, activated: 0, trialsStarted: 0, paidStarted: 0, trialsEndingThisWeek: 0, trialsStuck: 0, topLeadSource: null, trafficChanges: [], renewals30: 0, renewalValue30: 0, unreviewedPaying: 0 }), []);
});

test("weekly traffic change compares the last 7 days with the 7 before", () => {
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, activeUsers: i < 7 ? 20 : 10 }));
  assert.deepEqual(weeklyTrafficChange([{ product: "voomsales", daily }], (p) => p.toUpperCase()), [{ product: "VOOMSALES", changePct: -50 }]);
  assert.deepEqual(weeklyTrafficChange([{ product: "x", daily: daily.slice(0, 10) }], (p) => p), []);
});

test("product comes from the register first, then the demo quote's selections", () => {
  assert.deepEqual(productsFromSelections('[{"productCode":"LMS_PRO"},{"productCode":"AI_CALLING"}]'), ["vacademy", "telleo"]);
  assert.deepEqual(productsFromSelections('{"EVALEZY":{"quantity":1}}'), ["evalezy"]);
  assert.deepEqual(productsFromSelections("not json"), []);
  assert.equal(productFromCode("CRM_STARTER"), "voomsales");
  const rows = buildAccounts(
    [inst("a"), inst("b"), inst("c")],
    [],
    [],
    new Map(),
    new Map([["a", rec("a", { products: ["Telleo"] })]]),
    TODAY,
    { quoteProducts: new Map([["a", ["vacademy"]], ["b", ["evalezy"]]]), credits: new Map([["b", { total: 1000, used: 250, balance: 750, low: false }]]) }
  );
  const by = (id: string) => rows.find((r) => r.id === id)!;
  assert.deepEqual([by("a").products, by("a").productSource], [["telleo"], "register"]);
  assert.deepEqual([by("b").products, by("b").productSource], [["evalezy"], "quote"]);
  assert.deepEqual([by("c").products, by("c").productSource], [[], null]);
  assert.equal(by("b").credits?.balance, 750);
  assert.deepEqual(filterAccounts(rows, ["noproduct"], "").map((r) => r.id), ["c"]);
});

test("demo → paid: quotes joined to their workspace, trials without quotes added, tests left out", () => {
  const trial = (id: string, daysLeft: number) => ({ instituteId: id, name: id, sources: ["DEMO" as const], startedAt: "2026-10-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z", daysLeft, contact: null });
  const rows = buildAccounts(
    [inst("paid"), inst("using", { course_count: 1 }), inst("idle"), inst("expired"), inst("tagged"), inst("test", { lead_tag: "TEST" })],
    [sub("paid", { start_at: "2026-10-11T00:00:00Z" })],
    [trial("paid", 5), trial("using", 5), trial("idle", 5), trial("expired", -3), { ...trial("tagged", 9), sources: ["TAG" as const] }, trial("test", 5)],
    new Map(),
    new Map([["tagged", rec("tagged", { source: "LinkedIn" })]]),
    TODAY
  );
  const conv = buildConversions(rows, [
    { id: "q1", source: "STANDALONE", createdAt: "2026-10-01T00:00:00Z", provisionedInstituteId: "paid" },
    { id: "q2", source: "STANDALONE", createdAt: "2026-10-02T00:00:00Z", provisionedInstituteId: "using" },
    { id: "q3", source: "ONBOARDING", createdAt: "2026-10-03T00:00:00Z", provisionedInstituteId: "idle" },
    { id: "q4", source: "ONBOARDING", createdAt: "2026-10-04T00:00:00Z", provisionedInstituteId: "expired" },
    { id: "q5", source: "STANDALONE", createdAt: "2026-11-20T00:00:00Z", organizationName: "Waiting Co", selections: '[{"productCode":"CRM"}]' },
    { id: "q6", source: "STANDALONE", createdAt: "2026-10-05T00:00:00Z", provisionedInstituteId: "test" },
  ]);
  const by = (k: string) => conv.find((r) => r.key === k)!;
  assert.equal(conv.length, 6, "5 quotes (test skipped) + 1 tagged trial");
  assert.equal(by("quote:q1").step, "PAID");
  assert.equal(by("quote:q1").daysToPaid, 10);
  assert.equal(by("quote:q2").step, "USING");
  assert.equal(by("quote:q3").step, "TRIAL");
  assert.equal(by("quote:q4").lost, true);
  assert.equal(by("quote:q5").step, "REQUESTED");
  assert.deepEqual(by("quote:q5").products, ["voomsales"]);
  assert.equal(by("trial:tagged").source, "LinkedIn");
  assert.equal(conv[0].key, "quote:q5", "newest first");

  const src = summarizeConversions(conv, (r) => [r.source]);
  const web = src.find((s) => s.name === "Website pricing page")!;
  assert.deepEqual([web.requests, web.trials, web.using, web.paid, web.rate, web.medianDaysToPaid], [3, 2, 2, 1, 33.3, 10]);
  const onboarding = src.find((s) => s.name === "Onboarding form")!;
  assert.deepEqual([onboarding.requests, onboarding.paid, onboarding.lost], [2, 0, 1]);
});

test("dashboard counts leave out test accounts and link to the right lists", () => {
  const trial = (id: string, daysLeft: number) => ({ instituteId: id, name: id, sources: ["DEMO" as const], startedAt: "2026-11-18T00:00:00Z", endsAt: "2026-12-01T00:00:00Z", daysLeft, contact: null });
  const rows = buildAccounts(
    [
      inst("new", { created_at: "2026-11-20T00:00:00Z", course_count: 2, student_count: 30 }),
      inst("old", { created_at: "2026-10-01T00:00:00Z", lead_tag: "PROD", course_count: 5, student_count: 100 }),
      inst("lastweek", { created_at: "2026-11-12T00:00:00Z" }),
      inst("ending", { created_at: "2026-11-18T00:00:00Z" }),
      inst("test", { created_at: "2026-11-20T00:00:00Z", lead_tag: "TEST", course_count: 9 }),
    ],
    [],
    [trial("ending", 2), trial("test", 5)],
    new Map([["old", 3], ["test", 4]]),
    new Map([["old", rec("old", { renewalDate: "2026-12-10", nextFollowUp: "2026-11-20" })]]),
    TODAY,
    { usage: new Map([["ending", { users: 1, loggedIn: 0, lastLogin: null }]]), credits: new Map([["old", { total: 100, used: 95, balance: 5, low: true }]]) }
  );
  const d = dashboardStats(rows, TODAY);
  assert.equal(d.institutes, 4);
  assert.equal(d.newThisWeek, 2);
  assert.equal(d.newLastWeek, 1);
  assert.equal(d.onTrial, 1);
  assert.equal(d.paying, 1);
  assert.equal(d.courses, 7);
  assert.equal(d.institutesWithCourses, 2);
  assert.equal(d.students, 130);
  assert.deepEqual([d.onlineInstitutes, d.onlinePeople], [1, 3]);
  assert.equal(d.aiCreditsUsed, 95);
  assert.deepEqual(d.attention, { notLoggedIn: 1, noCourse: 0, endingIn3: 1, endedNotPaying: 0, followUpsDue: 1, lowCredits: 1, renewals30: 1 });
  assert.equal(d.weekly.length, 12);
  assert.equal(d.weekly[11].week, "2026-11-16");
  assert.deepEqual([d.weekly[11].institutes, d.weekly[11].trials], [2, 1]);
  assert.equal(weekStart("2026-11-22"), "2026-11-16");
});

test("AI calls are counted per institute, most first, with minutes and connected calls", () => {
  const call = (id: string | null, start: string, secs: number, billed = 0) => ({ institute_id: id, institute_name: id ? `Inst ${id}` : null, call_start: start, duration_seconds: secs, billed_inr: billed });
  const calls = [
    call("a", "2026-11-20T10:00:00Z", 120, 5),
    call("a", "2026-11-21T09:00:00Z", 0),
    call("a", "2026-11-21T11:00:00Z", 60, 2),
    call("b", "2026-11-19T10:00:00Z", 300, 10),
    call(null, "2026-11-21T10:00:00Z", 30),
  ];
  const rows = callsByInstitute(calls);
  assert.deepEqual(rows.map((r) => [r.instituteId, r.calls, r.connected, r.minutes, r.billedInr]), [["a", 3, 2, 3, 7], ["b", 1, 1, 5, 10], ["none", 1, 1, 0.5, 0]]);
  assert.equal(rows[0].lastCall, "2026-11-21T11:00:00Z");
  assert.equal(rows[2].name, "No institute");
  const days = callsPerDay(calls, 3, TODAY);
  assert.deepEqual(days.map((d) => [d.date, d.calls]), [["2026-11-19", 1], ["2026-11-20", 1], ["2026-11-21", 3]]);

  const accounts = buildAccounts([inst("a"), inst("c")], [], [], new Map(), new Map(), TODAY, { calls30: new Map(rows.map((r) => [r.instituteId, r])) });
  assert.equal(accounts.find((x) => x.id === "a")!.calls30!.calls, 3);
  assert.equal(accounts.find((x) => x.id === "c")!.calls30!.calls, 0, "loaded but no calls = 0, not unknown");
});

test("contract helpers: end date from plan length, readable duration, phone links", () => {
  assert.equal(endDateFor("2026-04-01", "ANNUAL"), "2027-03-31");
  assert.equal(endDateFor("2026-01-31", "MONTHLY"), "2026-02-28");
  assert.equal(endDateFor("2026-04-01", "QUARTERLY"), "2026-06-30");
  assert.equal(endDateFor("2026-04-01", "ONE_TIME"), "");
  assert.equal(durationText("2026-04-01", "2027-03-31"), "1 year");
  assert.equal(durationText("2026-04-01", "2027-05-31"), "1 year 2 months");
  assert.equal(durationText("2026-11-01", "2026-11-14"), "14 days");
  assert.equal(durationText("2026-11-01", ""), "");
  assert.equal(phoneDigits("98765 43210"), "919876543210");
  assert.equal(phoneDigits("+44 20 7946 0958"), "442079460958");
});
