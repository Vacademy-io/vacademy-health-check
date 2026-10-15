// Run: npm test  (node --test with native TypeScript stripping, Node >= 22.18; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRECEDENCE,
  addInstitute,
  buildCatalogPatch,
  coverageStats,
  creditDiff,
  draftFromRow,
  formatPct,
  normalizeCatalog,
  normalizeCoverage,
  normalizeParity,
  normalizeRoleMap,
  normalizeRoleName,
  parityTone,
  parityTotals,
  parseInstituteList,
  parsePrecedence,
  pct,
  removeInstitute,
  serializeInstituteList,
  sourceRows,
  validateInstituteId,
} from "../src/lib/metering.ts";
import type { ParityRow } from "../src/types/metering.ts";

test("normalizeCatalog coerces, defaults and orders rows; drops keyless rows", () => {
  const rows = normalizeCatalog({
    use_cases: [
      { use_case: "tutor_chat", feature_group: "tutor", label: "AI tutor chat", display_order: "20", legacy_request_types: ["conversation", 5] },
      { use_case: "ai_calling", feature_group: "calling", label: "AI calling minutes", display_order: 10, is_active: false, tool_keys: ["x"] },
      { use_case: "", label: "junk" },
      { use_case: "unknown" },
    ],
  });
  assert.deepEqual(rows.map((r) => r.use_case), ["ai_calling", "tutor_chat", "unknown"]);
  assert.equal(rows[1].display_order, 20);
  assert.deepEqual(rows[1].legacy_request_types, ["conversation"]);
  assert.equal(rows[0].is_active, false);
  assert.equal(rows[2].is_active, true);
  assert.equal(rows[2].label, "unknown");
  assert.equal(rows[2].feature_group, "platform");
  assert.equal(rows[2].display_order, 100);
  assert.deepEqual(normalizeCatalog(null), []);
  assert.deepEqual(normalizeCatalog({ use_cases: "nope" }), []);
});

test("buildCatalogPatch sends only changed fields and requires a reason", () => {
  const [row] = normalizeCatalog({
    use_cases: [{ use_case: "content", feature_group: "content", label: "Course content", label_template: null, display_order: 50 }],
  });
  const d = draftFromRow(row);
  assert.deepEqual(buildCatalogPatch(row, d, "x"), { error: "Nothing changed" });
  assert.deepEqual(buildCatalogPatch(row, { ...d, label: "Course text" }, "  "), { error: "Say why (it lands in the change log)" });
  assert.deepEqual(buildCatalogPatch(row, { ...d, label: "  Course text " }, " rename "), {
    patch: { reason: "rename", label: "Course text" },
  });
  assert.deepEqual(buildCatalogPatch(row, { ...d, label_template: "{label} — {course_name}", display_order: "12" }, "r"), {
    patch: { reason: "r", label_template: "{label} — {course_name}", display_order: 12 },
  });
  // Clearing a template sends null; upper-case group is folded.
  const [withTpl] = normalizeCatalog({ use_cases: [{ use_case: "c", feature_group: "content", label: "C", label_template: "{label}" }] });
  assert.deepEqual(buildCatalogPatch(withTpl, { ...draftFromRow(withTpl), label_template: "", feature_group: "Video" }, "r"), {
    patch: { reason: "r", label_template: null, feature_group: "video" },
  });
  assert.ok("error" in buildCatalogPatch(row, { ...d, label: "" }, "r"));
  assert.ok("error" in buildCatalogPatch(row, { ...d, display_order: "1.5" }, "r"));
  assert.ok("error" in buildCatalogPatch(row, { ...d, display_order: "-1" }, "r"));
  assert.ok("error" in buildCatalogPatch(row, { ...d, feature_group: "bad group" }, "r"));
});

test("normalizeRoleMap sorts by precedence and hides roles that are already mapped", () => {
  const res = normalizeRoleMap({
    roles: [
      { role_name: "TEACHER", role_class: "TEACHER", precedence: 20 },
      { role_name: "ADMIN", role_class: "ADMIN", precedence: "10" },
      { role_name: "" },
    ],
    unmapped: [
      { role_name: "COUNSELLOR_X", events: 3 },
      { role_name: "TEACHER", events: 99 },
      { role_name: "CONTENT_CREATOR_2", events: "40" },
    ],
  });
  assert.deepEqual(res.roles.map((r) => r.role_name), ["ADMIN", "TEACHER"]);
  assert.equal(res.roles[0].precedence, 10);
  assert.deepEqual(res.unmapped, [
    { role_name: "CONTENT_CREATOR_2", events: 40 },
    { role_name: "COUNSELLOR_X", events: 3 },
  ]);
  assert.deepEqual(normalizeRoleMap(undefined), { roles: [], unmapped: [] });
});

test("role helpers: normalisation matches security.py, precedence bounds, class defaults", () => {
  assert.equal(normalizeRoleName(" content creator "), "CONTENT_CREATOR");
  assert.equal(normalizeRoleName("school-admin"), "SCHOOL_ADMIN");
  assert.deepEqual(parsePrecedence("35"), { value: 35 });
  assert.ok("error" in parsePrecedence("0"));
  assert.ok("error" in parsePrecedence("2.5"));
  assert.ok("error" in parsePrecedence(""));
  assert.equal(DEFAULT_PRECEDENCE.ADMIN < DEFAULT_PRECEDENCE.LEARNER, true);
});

test("coverage: percentages, unresolved roles and tone", () => {
  const c = normalizeCoverage({
    days: 7,
    events: "1000",
    ledger_rows: 900,
    ledger_without_event: 9,
    use_case_source: { EXPLICIT: 600, REQUEST_TYPE: 380, UNKNOWN: 20 },
    role_source: { JWT: 700, UNRESOLVED: 50, CATALOG_DEFAULT: 250 },
    unknown_use_case_events: 20,
    null_actor_events: 4,
    by_use_case: [
      { use_case: "a", events: 5, credits: "1.5" },
      { use_case: "b", events: 3, credits: 9 },
    ],
  });
  const s = coverageStats(c);
  assert.equal(s.knownUseCasePct, 98);
  assert.equal(s.resolvedRolePct, 95);
  assert.equal(s.ledgerCoveredPct, 99);
  assert.equal(s.unresolvedRoles, 50);
  assert.equal(s.tone, "warn");
  assert.deepEqual(c.by_use_case.map((r) => r.use_case), ["b", "a"]);
  assert.equal(coverageStats(normalizeCoverage({ events: 0, ledger_rows: 10, ledger_without_event: 10 })).tone, "error");
  assert.equal(coverageStats(normalizeCoverage({ events: 10, ledger_rows: 10 })).tone, "ok");
  const empty = coverageStats(normalizeCoverage({}));
  assert.equal(empty.tone, "off");
  assert.equal(empty.knownUseCasePct, null);
});

test("pct and formatPct never round a gap up to 100%", () => {
  assert.equal(pct(1, 0), null);
  assert.equal(formatPct(null), "—");
  assert.equal(formatPct(pct(9999, 10000)), "99.9%");
  assert.equal(formatPct(100), "100%");
  assert.equal(formatPct(pct(1, 3)), "33.3%");
  assert.deepEqual(sourceRows({ B: 1, A: 3 }).map((r) => r.key), ["A", "B"]);
});

test("parity: newest first, tones and credit differences at ledger scale", () => {
  const rows = normalizeParity({
    rows: [
      { day: "2026-10-13", ledger_rows: 10, ledger_credits: "12.5", event_rows: 10, event_credits: 12.5, missing_events: 0 },
      { day: "2026-10-14", ledger_rows: 10, ledger_credits: 12.5, event_rows: 8, event_credits: 10, missing_events: 2 },
      { day: "2026-10-15", ledger_rows: 4, ledger_credits: 3, event_rows: 0, event_credits: 0, missing_events: 4 },
      { day: "2026-10-12", ledger_rows: 0, ledger_credits: 0, event_rows: 0, event_credits: 0, missing_events: 0 },
      { day: "2026-10-11", ledger_rows: 1, ledger_credits: 0.30001, event_rows: 1, event_credits: 0.3, missing_events: 0 },
      { ledger_rows: 3 },
    ],
  });
  assert.deepEqual(rows.map((r) => r.day), ["2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12", "2026-10-11"]);
  assert.deepEqual(rows.map(parityTone), ["error", "warn", "ok", "off", "ok"]);
  const drift: ParityRow = { day: "d", ledger_rows: 1, ledger_credits: 2, event_rows: 1, event_credits: 1.5, missing_events: 0 };
  assert.equal(creditDiff(drift), 0.5);
  assert.equal(parityTone(drift), "warn");
  const t = parityTotals(rows);
  assert.equal(t.missing_events, 6);
  assert.equal(t.ledger_rows, 25);
  assert.deepEqual(normalizeParity(null), []);
});

test("History v2 list: parses JSON text or arrays, refuses junk, dedupes", () => {
  assert.deepEqual(parseInstituteList(null), { ids: [], all: false, error: null });
  assert.deepEqual(parseInstituteList(""), { ids: [], all: false, error: null });
  assert.deepEqual(parseInstituteList('["a", "b", "a", " "]'), { ids: ["a", "b"], all: false, error: null });
  assert.deepEqual(parseInstituteList(["*"]), { ids: ["*"], all: true, error: null });
  assert.ok(parseInstituteList("{nope").error);
  assert.ok(parseInstituteList('{"a": 1}').error);
  assert.ok(parseInstituteList("[1, 2]").error);
});

test("History v2 list: add/remove and the value written back", () => {
  assert.deepEqual(addInstitute(["a"], " b "), ["a", "b"]);
  assert.deepEqual(addInstitute(["a"], "a"), ["a"]);
  assert.deepEqual(removeInstitute(["a", "b"], "a"), ["b"]);
  assert.equal(serializeInstituteList("string", ["a", "b"]), '["a","b"]');
  assert.equal(serializeInstituteList(undefined, []), "[]");
  assert.deepEqual(serializeInstituteList("json", ["a"]), ["a"]);
  assert.equal(validateInstituteId("*"), null);
  assert.equal(validateInstituteId("c61e1d3a-2b4f-4a1e-9b22-0b8d5c1e2f33"), null);
  assert.ok(validateInstituteId(""));
  assert.ok(validateInstituteId("has space"));
  assert.ok(validateInstituteId('x"]'));
  assert.ok(validateInstituteId("x".repeat(65)));
});
