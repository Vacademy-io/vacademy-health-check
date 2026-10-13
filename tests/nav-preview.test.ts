// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
// Fixture: tests/fixtures/nav-manifest.json is a copy of the generated
// admin_core capabilities/nav-manifest.json (refresh it when that changes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCatalog, normalizeNav } from "../src/lib/modules-catalog.ts";
import {
  blobFlag,
  importModulesFromSettings,
  mergeRoleNav,
  resolvePreview,
  type PreviewResult,
  type PreviewTab,
} from "../src/lib/nav-preview.ts";
import type { ResolvedEntitlements } from "../src/types/modules.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const NAV = normalizeNav(fixture("nav-manifest.json"))!;
const CATALOG = normalizeCatalog(fixture("catalog.sample.json"))!;

function tab(r: PreviewResult, id: string): PreviewTab {
  for (const c of r.categories) {
    const t = c.tabs.find((x) => x.id === id);
    if (t) return t;
  }
  throw new Error(`tab ${id} not in preview`);
}
const sub = (r: PreviewResult, tabId: string, subId: string) => {
  const s = tab(r, tabId).sub_tabs.find((x) => x.id === subId);
  if (!s) throw new Error(`sub ${tabId}/${subId} not in preview`);
  return s;
};
const cat = (r: PreviewResult, id: string) => r.categories.find((c) => c.id === id)!;
const preview = (roleKey: string, blob: Record<string, unknown> | null = null, resolved: ResolvedEntitlements | null = null) =>
  resolvePreview({ nav: NAV, catalog: CATALOG, blob, roleKey, resolved });

test("real manifest normalizes with its extra rule fields", () => {
  assert.equal(NAV.categories.length, 4);
  assert.equal(NAV.tabs.length, 40);
  assert.deepEqual(NAV.non_admin_opt_in_tab_ids, ["manage-institute"]);
  assert.deepEqual(NAV.admin_only_sub_tabs_never_opt_in_tab_ids, ["engagement-engines"]);
  assert.equal(NAV.sub_org_module?.sub_tab_id, "manage-institute-suborgs");
  assert.equal(NAV.categories.find((c) => c.is_default_landing)?.id, "CRM");
});

test("default fill: no stored blob → role defaults from the manifest", () => {
  const admin = preview("ADMIN");
  assert.equal(admin.is_admin, true);
  assert.equal(tab(admin, "automations").hidden, false);
  assert.equal(tab(admin, "admissions").reason, "HIDDEN_FOR_ROLE"); // ADMIN default off
  assert.equal(sub(admin, "communications", "announcement-history").hidden, false);
  // ERP ships hidden: its tabs carry CATEGORY_HIDDEN and the rail skips it.
  assert.deepEqual(tab(admin, "erp-people").reasons, ["CATEGORY_HIDDEN"]);
  assert.equal(cat(admin, "ERP").in_rail, false);
  assert.equal(cat(admin, "ERP").hidden_reason, "CATEGORY_HIDDEN");
  assert.equal(cat(admin, "CRM").is_default_landing, true);

  const teacher = preview("TEACHER");
  assert.equal(teacher.is_admin, false);
  assert.equal(tab(teacher, "automations").reason, "HIDDEN_FOR_ROLE");
  assert.equal(tab(teacher, "courses").hidden, false);
  assert.equal(sub(teacher, "leads", "counsellors").hidden, false); // TEACHER-only default
  assert.equal(sub(admin, "leads", "counsellors").reason, "HIDDEN_FOR_ROLE");
});

test("custom roles use the TEACHER defaults", () => {
  const custom = preview("CUSTOM:r-1");
  assert.equal(custom.is_admin, false);
  assert.equal(tab(custom, "automations").reason, "HIDDEN_FOR_ROLE");
});

test("saved blob overrides defaults by id (tabs and sub-tabs), defaults fill the rest", () => {
  const blob = {
    sidebar: [
      { id: "courses", visible: false, order: 24 },
      { id: "automations", visible: true },
      { id: "leads", subTabs: [{ id: "call-log", visible: false }] },
    ],
  };
  const r = preview("TEACHER", blob);
  assert.equal(tab(r, "courses").reason, "HIDDEN_FOR_ROLE");
  assert.equal(tab(r, "automations").hidden, false);
  assert.equal(sub(r, "leads", "call-log").reason, "HIDDEN_FOR_ROLE");
  assert.equal(sub(r, "leads", "lead-list-leads").hidden, false);
  assert.equal(tab(r, "assessments-tests").hidden, false);

  const merged = mergeRoleNav(NAV, blob, "TEACHER");
  assert.equal(merged.tabs.find((t) => t.id === "courses")!.explicit, true);
  assert.equal(merged.tabs.find((t) => t.id === "assessments-tests")!.explicit, false);
});

test("custom tabs and custom sub-tabs from the blob are kept; stale unknown ids are dropped", () => {
  const blob = {
    sidebar: [
      {
        id: "custom-portal",
        isCustom: true,
        label: "Partner portal",
        route: "https://partner.example",
        category: "LMS",
        order: 99,
        visible: true,
        subTabs: [{ id: "custom-sub-a", label: "Docs", route: "/docs", order: 0, visible: true }],
      },
      { id: "leads", subTabs: [{ id: "custom-sub-help", label: "Help", route: "/help", visible: true }] },
      { id: "removed-old-tab", visible: true },
    ],
  };
  const r = preview("TEACHER", blob);
  const custom = tab(r, "custom-portal");
  assert.equal(custom.custom, true);
  assert.equal(custom.label, "Partner portal");
  assert.equal(custom.hidden, false);
  assert.ok(cat(r, "LMS").tabs.some((t) => t.id === "custom-portal"));
  assert.equal(custom.sub_tabs[0].id, "custom-sub-a");
  assert.ok(tab(r, "leads").sub_tabs.some((s) => s.id === "custom-sub-help" && s.custom));
  assert.throws(() => tab(r, "removed-old-tab"));
});

test("admin vs non-admin: always-admin-only tabs and admin_only sub-tabs", () => {
  const admin = preview("ADMIN");
  assert.equal(tab(admin, "settings").hidden, false);
  assert.equal(sub(admin, "manage-institute", "manage-packages").hidden, false);

  const teacher = preview("TEACHER");
  assert.ok(tab(teacher, "settings").reasons.includes("ADMIN_ONLY"));
  assert.equal(sub(teacher, "communications", "announcement-history").reason, "ADMIN_ONLY");

  // Explicit opt-in unlocks admin_only sub-tabs, never the always-admin-only tabs.
  const opted = preview("TEACHER", {
    sidebar: [
      { id: "settings", visible: true },
      { id: "communications", visible: true, subTabs: [{ id: "announcement-history", visible: true }] },
    ],
  });
  assert.equal(sub(opted, "communications", "announcement-history").hidden, false);
  assert.deepEqual(tab(opted, "settings").reasons, ["ADMIN_ONLY"]);
});

test("non_admin_opt_in tabs show for non-admins only when switched on", () => {
  const off = preview("TEACHER");
  assert.equal(tab(off, "manage-institute").reason, "HIDDEN_FOR_ROLE");
  assert.ok(tab(off, "manage-institute").note);

  const on = preview("TEACHER", {
    sidebar: [{ id: "manage-institute", visible: true, subTabs: [{ id: "manage-packages", visible: true }] }],
  });
  assert.equal(tab(on, "manage-institute").hidden, false);
  assert.equal(sub(on, "manage-institute", "batches").hidden, false);
  assert.equal(sub(on, "manage-institute", "manage-packages").hidden, false); // admin_only, opted in
  // Without the Sub-Organizations grant the sub-org entry stays hidden.
  assert.equal(sub(on, "manage-institute", "manage-institute-suborgs").hidden, true);
});

test("admin_only sub-tabs under never-opt-in tabs stay admin-only even when switched on", () => {
  const r = preview("TEACHER", {
    sidebar: [
      {
        id: "engagement-engines",
        visible: true,
        subTabs: [
          { id: "engagement-engines-list", visible: true },
          { id: "engagement-task-inbox", visible: true },
        ],
      },
    ],
  });
  assert.equal(sub(r, "engagement-engines", "engagement-engines-list").reason, "ADMIN_ONLY");
  assert.equal(sub(r, "engagement-engines", "engagement-task-inbox").reason, "ADMIN_ONLY");
  assert.equal(sub(preview("ADMIN"), "engagement-engines", "engagement-engines-list").hidden, false);
});

test("sub-org grant alone keeps Manage Institute showing just the sub-org entry", () => {
  const blob = { subOrganizations: { moduleEnabled: true } };
  assert.equal(blobFlag(blob, "subOrganizations.moduleEnabled"), true);
  const r = preview("TEACHER", blob);
  const mi = tab(r, "manage-institute");
  assert.equal(mi.hidden, false);
  const visible = mi.sub_tabs.filter((s) => !s.hidden).map((s) => s.id);
  assert.deepEqual(visible, ["manage-institute-suborgs"]);
  assert.equal(sub(r, "manage-institute", "batches").reason, "HIDDEN_FOR_ROLE");
  // Admins ignore the grant: the sub-org entry follows its own flag (default off).
  assert.equal(sub(preview("ADMIN", blob), "manage-institute", "manage-institute-suborgs").reason, "HIDDEN_FOR_ROLE");
});

test("category hidden hides its tabs and drops it from the rail; an empty category is not drawn", () => {
  const r = preview("ADMIN", { sidebarCategories: [{ id: "LMS", visible: false }] });
  assert.equal(tab(r, "courses").reason, "CATEGORY_HIDDEN");
  assert.equal(tab(r, "assessments-tests").reason, "CATEGORY_HIDDEN");
  assert.equal(cat(r, "LMS").in_rail, false);
  assert.equal(cat(r, "LMS").hidden_reason, "CATEGORY_HIDDEN");
  assert.equal(cat(r, "CRM").in_rail, true);

  const aiTabs = NAV.tabs.filter((t) => t.category === "AI").map((t) => ({ id: t.id, visible: false }));
  const empty = preview("TEACHER", { sidebar: aiTabs });
  assert.equal(cat(empty, "AI").in_rail, false);
  assert.equal(cat(empty, "AI").hidden_reason, "EMPTY");
});

test("module off and feature off (incl. wildcard governance and all-sub-tabs-off groups)", () => {
  const resolved: ResolvedEntitlements = {
    modules: { lms: false, crm: true, ai: false, communications: false },
    features: {
      "lms.courses": false,
      "lms.batches": false,
      "crm.leads": true,
      "crm.call_intelligence": false,
      "ai.tools": false,
      "comms.all": false,
    },
  };
  const r = preview("ADMIN", null, resolved);
  assert.equal(tab(r, "courses").reason, "MODULE_OFF");
  assert.deepEqual(tab(r, "courses").modules, ["lms"]);
  assert.equal(sub(r, "leads", "ai-intelligence").reason, "FEATURE_OFF");
  assert.equal(sub(r, "leads", "lead-list-leads").hidden, false);
  assert.equal(tab(r, "ai-tools-tab").reason, "MODULE_OFF"); // via "ai-*"
  assert.equal(tab(r, "knowledge-base-tab").reason, "MODULE_OFF");
  assert.equal(sub(r, "manage-institute", "batches").reason, "MODULE_OFF");
  assert.equal(sub(r, "manage-institute", "teams").hidden, false); // core
  assert.equal(tab(r, "manage-institute").hidden, false);
  // Every sub-tab of Communications is off ("communications/*") → the group itself is gone.
  assert.equal(tab(r, "communications").reason, "MODULE_OFF");
  assert.ok(tab(r, "communications").note);

  // resolved = null (LEGACY view) applies no entitlement at all.
  assert.equal(tab(preview("ADMIN"), "courses").hidden, false);
  // A feature missing from `resolved` counts as on.
  assert.equal(tab(preview("ADMIN", null, { modules: {}, features: {} }), "courses").hidden, false);
});

test("reasons are ordered: entitlement before role before category", () => {
  const blob = { sidebar: [{ id: "courses", visible: false }], sidebarCategories: [{ id: "LMS", visible: false }] };
  const r = preview("ADMIN", blob, { modules: { lms: false }, features: { "lms.courses": false } });
  assert.deepEqual(tab(r, "courses").reasons, ["MODULE_OFF", "HIDDEN_FOR_ROLE", "CATEGORY_HIDDEN"]);
});

test("sub-tabs of a hidden tab inherit its reasons", () => {
  const r = preview("ADMIN", { sidebar: [{ id: "leads", visible: false }] });
  assert.equal(sub(r, "leads", "call-log").hidden, true);
  assert.equal(sub(r, "leads", "call-log").reason, "HIDDEN_FOR_ROLE");
});

test("locked rows are marked locked but stay visible", () => {
  const r = preview("ADMIN", {
    sidebar: [{ id: "leads", locked: true, subTabs: [{ id: "call-log", locked: true }] }],
    sidebarCategories: [{ id: "AI", locked: true }],
  });
  assert.equal(tab(r, "leads").locked, true);
  assert.equal(tab(r, "leads").hidden, false);
  assert.equal(sub(r, "leads", "call-log").locked, true);
  assert.equal(sub(r, "leads", "lead-list-leads").locked, false);
  assert.equal(cat(r, "AI").locked, true);
  assert.equal(cat(r, "AI").in_rail, true);
});

test("a malformed blob does not throw", () => {
  const blob = { sidebar: "nope", sidebarCategories: [null, 3, { id: 7 }], subOrganizations: "yes" } as unknown as Record<string, unknown>;
  const r = preview("TEACHER", blob);
  assert.equal(tab(r, "dashboard").hidden, false);
});

test("import from current settings: module on iff a governed item is visible and its rail category is visible", () => {
  const blob = {
    sidebar: [
      { id: "courses", visible: false },
      { id: "manage-institute", subTabs: [{ id: "batches", visible: false }] },
      { id: "leads", visible: true },
    ],
    sidebarCategories: [{ id: "AI", visible: false }, { id: "ERP", visible: true }],
  };
  const r = importModulesFromSettings(CATALOG, NAV, blob);
  assert.equal(r.modules.lms, false); // courses + batches hidden
  assert.equal(r.modules.assessments, true);
  assert.equal(r.modules.crm, true);
  assert.equal(r.features["crm.leads"], true);
  assert.equal(r.modules.ai, false); // rail category hidden
  assert.equal(r.modules.erp, true); // ERP category switched on
  assert.equal(r.modules.communications, true); // "communications/*"
  assert.equal("core" in r.modules, false); // core is never imported
  assert.ok(r.evidence.crm.length > 0);
  assert.equal("lms.reports" in r.features, false); // governs no nav → left alone
});

test("import with no stored blob uses the admin defaults", () => {
  const r = importModulesFromSettings(CATALOG, NAV, null);
  assert.equal(r.modules.lms, true);
  assert.equal(r.modules.erp, false); // ERP category hidden by default
});
