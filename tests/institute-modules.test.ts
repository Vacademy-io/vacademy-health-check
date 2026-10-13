// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGovernance,
  dateInputToIso,
  describeHistoryValue,
  diffChanges,
  entitlementBlock,
  isApiUnavailable,
  isExpired,
  isVersionConflict,
  isoToDateInput,
  normalizeCatalog,
  normalizeCatalogResponse,
  normalizeDisplaySettings,
  normalizeInstituteModules,
  normalizeNav,
  normalizeRoles,
  resolvedCounts,
  roleKeyFor,
  storedState,
} from "../src/lib/modules-catalog.ts";
import { applyRoleEdits, cellOf, nextCellState, uiToggleOf, postLoginRouteOf } from "../src/lib/role-nav-edits.ts";
import { mergeRoleNav } from "../src/lib/nav-preview.ts";
import { jsonDiff, parseJsonish } from "../src/lib/json-diff.ts";
import type { EntitlementRow } from "../src/types/modules.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const NAV = normalizeNav(fixture("nav-manifest.json"))!;
const CATALOG = normalizeCatalog(fixture("catalog.sample.json"))!;
const GOV = buildGovernance(CATALOG);

test("catalog response: nav may be null; garbage does not throw", () => {
  const r = normalizeCatalogResponse({ catalog: fixture("catalog.sample.json"), nav: null });
  assert.equal(r.catalog?.modules.length, 13);
  assert.equal(r.catalog?.modules.flatMap((m) => m.features).length, 53);
  assert.equal(r.nav, null);
  assert.deepEqual(normalizeCatalogResponse("<html>"), { catalog: null, nav: null });
});

test("governance: tab and tab/sub entries of the real catalogue", () => {
  assert.deepEqual(GOV.featuresForTab("courses"), ["lms.courses"]);
  assert.deepEqual(GOV.featuresForSub("leads", "ai-intelligence").sort(), ["crm.call_intelligence", "crm.leads"]);
  assert.deepEqual(GOV.featuresForSub("leads", "call-log").sort(), ["crm.calling", "crm.leads"]);
  assert.deepEqual(GOV.featuresForTab("ai-tools-tab"), ["ai.tools"]);
  assert.deepEqual(GOV.featuresForSub("communications", "chat"), ["communications.chat"]);
  assert.deepEqual(GOV.featuresForTab("communications"), []);
  assert.deepEqual(GOV.featuresForTab("manage-institute"), ["core.teams"]);
  assert.deepEqual(GOV.featuresForSub("manage-institute", "batches").sort(), ["core.teams", "lms.batches"]);
  assert.deepEqual(GOV.featuresForSub("automations", "blog"), ["website.blog"]);
  assert.equal(GOV.moduleOfFeature.get("communications.email"), "communications");
});

test("governance: trailing-* wildcards still match by prefix (harmless when unused)", () => {
  const gov = buildGovernance({
    version: 1,
    modules: [
      {
        key: "erp",
        label: "ERP",
        description: null,
        rail: "ERP",
        core: false,
        features: [
          {
            key: "erp.all",
            label: "All",
            description: null,
            default_on: true,
            governs: { nav: ["erp-*"], widgets: [], quick_actions: [], assistant_groups: [], setup_steps: [], routes: [] },
            setting_keys: [],
          },
        ],
      },
    ],
  });
  assert.deepEqual(gov.featuresForTab("erp-people"), ["erp.all"]);
  assert.deepEqual(gov.featuresForTab("courses"), []);
});

test("entitlementBlock prefers MODULE_OFF and fails open on unknown features", () => {
  const resolved = { modules: { crm: true, lms: false }, features: { "crm.call_intelligence": false, "lms.courses": false } };
  assert.equal(entitlementBlock(["crm.call_intelligence"], resolved, GOV)?.reason, "FEATURE_OFF");
  assert.equal(entitlementBlock(["crm.call_intelligence", "lms.courses"], resolved, GOV)?.reason, "MODULE_OFF");
  assert.equal(entitlementBlock(["nope.unknown"], resolved, GOV), null);
});

const ROWS: EntitlementRow[] = [
  { key: "crm", enabled: true, expires_at: null, note: "contract #12", updated_by: "u1", updated_at: null },
  { key: "crm.call_intelligence", enabled: false, expires_at: null, note: null, updated_by: null, updated_at: null },
];

test("storedState: no row → module off / feature default_on; core always on", () => {
  assert.equal(storedState("lms", ROWS, GOV).enabled, false);
  assert.equal(storedState("lms.courses", ROWS, GOV).enabled, true);
  assert.equal(storedState("crm.call_intelligence", ROWS, GOV).enabled, false);
  assert.equal(storedState("core", ROWS, GOV).enabled, true);
  assert.equal(storedState("crm", ROWS, GOV).note, "contract #12");
});

test("diffChanges sends only real changes, each with its full state, never core", () => {
  const changes = diffChanges(
    {
      crm: { enabled: true, expires_at: null, note: "contract #12" }, // unchanged
      lms: { enabled: true, expires_at: "2026-12-31T23:59:59Z", note: "trial" },
      "lms.courses": { enabled: true, expires_at: null, note: "" }, // default, no row → no change
      "crm.call_intelligence": { enabled: true, expires_at: null, note: null },
      core: { enabled: false, expires_at: null, note: null },
      assessments: { enabled: false, expires_at: null, note: null }, // off by default → no change
    },
    ROWS,
    GOV
  );
  assert.deepEqual(changes, [
    { key: "crm.call_intelligence", enabled: true, expires_at: null, note: null },
    { key: "lms", enabled: true, expires_at: "2026-12-31T23:59:59Z", note: "trial" },
  ]);
});

test("expiry helpers", () => {
  assert.equal(dateInputToIso("2026-12-31"), "2026-12-31T23:59:59Z");
  assert.equal(dateInputToIso(""), null);
  assert.equal(isoToDateInput("2026-12-31T23:59:59Z"), "2026-12-31");
  assert.equal(isExpired("2020-01-01T00:00:00Z"), true);
  assert.equal(isExpired(null), false);
});

test("resolvedCounts counts core modules as on", () => {
  const c = resolvedCounts({ modules: { crm: true }, features: { "crm.leads": true } }, CATALOG);
  assert.equal(c.modulesOn, 2);
  assert.equal(c.modulesTotal, 13);
  assert.equal(c.featuresTotal, 53);
  assert.equal(c.featuresOn, 1);
});

test("institute modules normalizer defaults to LEGACY", () => {
  const m = normalizeInstituteModules({ entitlements: [{ key: "crm", enabled: true }, { nope: 1 }] }, "inst-1");
  assert.equal(m.mode, "LEGACY");
  assert.equal(m.institute_id, "inst-1");
  assert.equal(m.entitlements.length, 1);
  assert.deepEqual(m.resolved, { modules: {}, features: {} });
});

test("roles map to display-settings role keys", () => {
  const roles = normalizeRoles([
    { role_id: "a", role_name: "ADMIN", kind: "ADMIN", user_count: 2 },
    { role_id: "t", role_name: "TEACHER", kind: "TEACHER" },
    { role_id: "e", role_name: "EVALUATOR", kind: "SYSTEM" },
    { role_id: "c-9", role_name: "Operations", kind: "CUSTOM" },
  ]);
  assert.deepEqual(roles.map(roleKeyFor), ["ADMIN", "TEACHER", null, "CUSTOM:c-9"]);
});

test("display settings: data may arrive as a JSON string", () => {
  const d = normalizeDisplaySettings({ role_key: "ADMIN", data: '{"sidebar":[]}', version: "abc" }, "ADMIN");
  assert.deepEqual(d.data, { sidebar: [] });
  assert.equal(d.version, "abc");
  assert.equal(normalizeDisplaySettings({ data: null, version: null }, "TEACHER").data, null);
});

test("error classification", () => {
  assert.equal(isApiUnavailable({ response: { status: 404 } }), true);
  assert.equal(isApiUnavailable({ response: { status: 500 } }), false);
  assert.equal(isVersionConflict({ response: { status: 409, data: { code: "VERSION_CONFLICT" } } }), true);
  assert.equal(isVersionConflict({ response: { status: 409, data: { code: "OTHER" } } }), false);
});

test("module history values read as text", () => {
  assert.equal(describeHistoryValue('{"enabled":true,"expires_at":"2026-12-31T23:59:59Z"}'), "on · until 2026-12-31");
  assert.equal(describeHistoryValue('"MANAGED"'), "MANAGED");
  assert.equal(describeHistoryValue(null), "none"); // first row for a key: no old value
});

// ── role nav edits ──────────────────────────────────────────────────────────

test("cell cycle Visible → Hidden → Locked → Visible", () => {
  assert.equal(nextCellState("VISIBLE"), "HIDDEN");
  assert.equal(nextCellState("HIDDEN"), "LOCKED");
  assert.equal(nextCellState("LOCKED"), "VISIBLE");
});

test("cellOf reads the stored entry or the role default", () => {
  const merged = mergeRoleNav(NAV, { sidebar: [{ id: "leads", visible: true, locked: true }] }, "TEACHER");
  assert.deepEqual(cellOf(merged, "tab:leads"), { state: "LOCKED", explicit: true });
  assert.deepEqual(cellOf(merged, "tab:automations"), { state: "HIDDEN", explicit: false });
  assert.deepEqual(cellOf(merged, "cat:ERP"), { state: "HIDDEN", explicit: false });
  assert.deepEqual(cellOf(merged, "sub:leads/call-log"), { state: "VISIBLE", explicit: false });
});

test("applyRoleEdits changes only visible/locked of touched ids and keeps everything else", () => {
  const stored = {
    sidebar: [
      { id: "leads", label: "My Leads", order: 3, visible: true, locked: false, subTabs: [{ id: "call-log", route: "/x", order: 1, visible: true }] },
      { id: "custom-portal", isCustom: true, label: "Portal", category: "LMS", visible: true, subTabs: [] },
    ],
    dashboard: { widgets: [{ id: "kpiBand", visible: true, order: 0 }] },
    someFutureKey: { nested: [1, 2, 3] },
    ui: { showSidebar: true, showAiCredits: false },
    postLoginRedirectRoute: "/leads",
  };
  const frozen = structuredClone(stored);
  const next = applyRoleEdits(stored, {
    cells: {
      "tab:leads": "HIDDEN",
      "sub:leads/call-log": "LOCKED",
      "sub:manage-institute/batches": "HIDDEN",
      "cat:AI": "LOCKED",
    },
    ui: { showAssistDock: true },
    post_login_route: "/dashboard",
  });
  assert.deepEqual(stored, frozen, "input is not mutated");

  const sidebar = next.sidebar as Array<Record<string, unknown>>;
  const leads = sidebar.find((t) => t.id === "leads")!;
  assert.equal(leads.label, "My Leads");
  assert.equal(leads.order, 3);
  assert.equal(leads.visible, false);
  assert.equal(leads.locked, false);
  const callLog = (leads.subTabs as Array<Record<string, unknown>>)[0];
  assert.deepEqual(callLog, { id: "call-log", route: "/x", order: 1, visible: true, locked: true });
  // Custom tab and unknown keys survive untouched.
  assert.deepEqual(sidebar.find((t) => t.id === "custom-portal"), frozen.sidebar[1]);
  assert.deepEqual(next.someFutureKey, frozen.someFutureKey);
  assert.deepEqual(next.dashboard, frozen.dashboard);
  // New entries carry only the id + flags.
  const mi = sidebar.find((t) => t.id === "manage-institute")!;
  assert.deepEqual(mi, { id: "manage-institute", subTabs: [{ id: "batches", visible: false, locked: false }] });
  assert.deepEqual(next.sidebarCategories, [{ id: "AI", visible: true, locked: true }]);
  assert.deepEqual(next.ui, { showSidebar: true, showAiCredits: false, showAssistDock: true });
  assert.equal(next.postLoginRedirectRoute, "/dashboard");
});

test("applyRoleEdits on a never-saved role starts from an empty object", () => {
  const next = applyRoleEdits(null, { cells: { "tab:courses": "HIDDEN" }, ui: {} });
  assert.deepEqual(next, { sidebar: [{ id: "courses", visible: false, locked: false }] });
});

test("ui toggles and post-login route fall back to role defaults", () => {
  assert.deepEqual(uiToggleOf(null, "showAssistDock", "ADMIN"), { value: true, explicit: false });
  assert.deepEqual(uiToggleOf(null, "showAssistDock", "CUSTOM:x"), { value: false, explicit: false });
  assert.deepEqual(uiToggleOf({ ui: { showAssistDock: true } }, "showAssistDock", "TEACHER"), { value: true, explicit: true });
  assert.deepEqual(postLoginRouteOf(null), { value: "/dashboard", explicit: false });
});

// ── json diff ───────────────────────────────────────────────────────────────

test("jsonDiff matches id arrays by id", () => {
  const before = parseJsonish('{"sidebar":[{"id":"a","visible":true},{"id":"b","visible":true}],"x":1}');
  const after = parseJsonish('{"sidebar":[{"id":"b","visible":false},{"id":"a","visible":true},{"id":"c"}],"y":2}');
  assert.deepEqual(jsonDiff(before, after), [
    { path: "sidebar[id=b].visible", kind: "changed", before: true, after: false },
    { path: "sidebar[id=c]", kind: "added", after: { id: "c" } },
    { path: "x", kind: "removed", before: 1 },
    { path: "y", kind: "added", after: 2 },
  ]);
  assert.deepEqual(jsonDiff(parseJsonish("plain"), parseJsonish("other")), [
    { path: "(value)", kind: "changed", before: "plain", after: "other" },
  ]);
  assert.deepEqual(jsonDiff({ a: 1 }, { a: 1 }), []);
});
