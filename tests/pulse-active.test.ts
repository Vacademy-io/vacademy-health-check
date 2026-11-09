// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInstituteId, summarizeActive } from "../src/lib/pulse-active.ts";

const all = () => true;

test("normalizeInstituteId treats blank, null and undefined strings as missing", () => {
  for (const v of [null, undefined, "", "  ", "null", "NULL", " undefined "]) {
    assert.equal(normalizeInstituteId(v), null, String(v));
  }
  assert.equal(normalizeInstituteId(" abc "), "abc");
});

test("a learner seen under their institute and a blank one counts once, under the institute", () => {
  const { rows, total } = summarizeActive(
    [
      { user_id: "u1", institute_id: "parcham" },
      { user_id: "u1", institute_id: null },
      { user_id: "u1", institute_id: "null" },
      { user_id: "u2", institute_id: "parcham" },
      { user_id: "u3", institute_id: "sn" },
    ],
    all,
  );
  assert.deepEqual(rows, [
    { institute_id: "parcham", users: 2 },
    { institute_id: "sn", users: 1 },
  ]);
  assert.equal(total, 3);
});

test("users seen only without an institute stay visible as one unattributed row", () => {
  const { rows, total } = summarizeActive(
    [
      { user_id: "u1", institute_id: "sn" },
      { user_id: "u9", institute_id: null },
      { user_id: "u9", institute_id: "undefined" },
    ],
    all,
  );
  assert.deepEqual(rows, [
    { institute_id: "sn", users: 1 },
    { institute_id: null, users: 1 },
  ]);
  assert.equal(total, 2);
});

test("hidden test institutes also hide their users' blank rows", () => {
  const isShown = (id: string) => id !== "test-inst";
  const { rows, total } = summarizeActive(
    [
      { user_id: "t1", institute_id: "test-inst" },
      { user_id: "t1", institute_id: null },
      { user_id: "u1", institute_id: "sn" },
    ],
    isShown,
  );
  assert.deepEqual(rows, [{ institute_id: "sn", users: 1 }]);
  assert.equal(total, 1);
});

test("a user active in two real institutes appears in both rows but counts once in the total", () => {
  const { rows, total } = summarizeActive(
    [
      { user_id: "u1", institute_id: "a" },
      { user_id: "u1", institute_id: "b" },
    ],
    all,
  );
  assert.equal(rows.length, 2);
  assert.equal(total, 1);
});
