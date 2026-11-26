// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURE_CATALOG } from "../src/lib/pm-feature-catalog.ts";
import { accountFeatures, byUsage, FEATURE_GROUPS, featureState, featureStats, stuckRanking, type FeatureDef } from "../src/lib/pm-features.ts";
import { isReadOnlySql } from "../src/lib/pm-insights.ts";
import { buildAccounts } from "../src/lib/pm-view.ts";
import type { InstituteListItemDTO } from "../src/types/api.ts";

const TODAY = "2026-11-21";
const inst = (id: string, over: Partial<InstituteListItemDTO> = {}): InstituteListItemDTO => ({ id, name: `Inst ${id}`, email: "", city: "", state: "", type: "SCHOOL", logo_file_id: null, subdomain: id, created_at: "2026-11-01T00:00:00Z", student_count: 0, course_count: 0, batch_count: 0, lead_tag: null, ...over });
const def = (key: string, main?: "completed"): FeatureDef => ({ key, group: "LMS", label: key, started: "Started", completed: "finished", unit: "items", secondary: "done", main, db: "admin_core_service", sql: "SELECT 1" });

test("every feature query is a single read-only SELECT with the expected columns", () => {
  const keys = new Set<string>();
  const groups = new Set(FEATURE_GROUPS.map((g) => g.key));
  for (const f of FEATURE_CATALOG) {
    assert.ok(isReadOnlySql(f.sql), `${f.key} is not read-only`);
    for (const col of ["institute_id", "started", "completed", "d30", "last_at"]) assert.match(f.sql, new RegExp(`\\b${col}\\b`), `${f.key} misses ${col}`);
    assert.ok(!keys.has(f.key), `duplicate key ${f.key}`);
    keys.add(f.key);
    assert.ok(groups.has(f.group), `${f.key} has unknown group`);
    assert.ok(f.unit && f.secondary, `${f.key} needs a unit and a secondary label`);
  }
  for (const g of groups) assert.ok(FEATURE_CATALOG.some((f) => f.group === g), `no features in ${g}`);
});

test("state: finished beats started; no row means not started", () => {
  assert.equal(featureState(undefined), "NOT_STARTED");
  assert.equal(featureState({ started: 0, completed: 0, d30: 0, lastAt: null }), "NOT_STARTED");
  assert.equal(featureState({ started: 3, completed: 0, d30: 0, lastAt: null }), "STUCK");
  assert.equal(featureState({ started: 3, completed: 1, d30: 0, lastAt: null }), "COMPLETED");
});

test("feature stats split real institutes into using, stuck and not started", () => {
  const accounts = buildAccounts([inst("a"), inst("b"), inst("c"), inst("t", { lead_tag: "TEST" })], [], [], new Map(), new Map(), TODAY);
  const rows = {
    courses: new Map([
      ["a", { started: 2, completed: 1, d30: 1, lastAt: "2026-11-20" }],
      ["b", { started: 1, completed: 0, d30: 0, lastAt: "2026-10-01" }],
      ["t", { started: 5, completed: 5, d30: 5, lastAt: null }],
    ]),
    live: new Map([["a", { started: 1, completed: 0, d30: 0, lastAt: null }]]),
  };
  const [courses, live, missing] = featureStats([def("courses"), def("live"), def("missing")], accounts, rows);
  assert.deepEqual([courses.base, courses.completed.length, courses.stuck.length, courses.notStarted.length, courses.active30], [3, 1, 1, 1, 1]);
  assert.equal(courses.stuckRate, 0.5);
  assert.equal(live.stuckRate, 1);
  assert.equal(missing.loaded, false);
  assert.deepEqual([courses, live].sort(byUsage).map((s) => s.def.key), ["courses", "live"]);
  assert.deepEqual(stuckRanking([courses, live], 1).map((s) => s.def.key), ["live", "courses"]);
  // Volume is what the feature does (e.g. calls made), and institutes are ranked by it.
  assert.deepEqual([courses.total, courses.totalSecondary, courses.total30], [3, 1, 1]);
  assert.deepEqual(courses.ranking.map((r) => [r.account.id, r.value]), [["a", 2], ["b", 1]]);
  const [paid] = featureStats([def("courses", "completed")], accounts, rows);
  assert.deepEqual([paid.total, paid.totalSecondary], [1, 3]);
  assert.deepEqual(accountFeatures([def("courses"), def("live")], "b", rows).map((x) => x.state), ["STUCK", "NOT_STARTED"]);
});
