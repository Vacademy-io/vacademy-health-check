// Role navigation preview (spec §12.4): what a role at an institute sees in the
// admin app's rail and sidebar, computed from the nav manifest + the role's
// stored display-settings blob + resolved entitlements. Mirrors the admin app:
//   - mergeDisplayWithDefaults(): saved entries override role defaults by id;
//     unknown ids survive only when custom (isCustom / "custom…" prefix)
//   - filterSidebarByRole(): admins see every tab; non-admins never get
//     always_admin_only_tab_ids, get non_admin_opt_in_tab_ids only when switched
//     on, get admin_only sub-tabs only when the tab AND the sub-tab are visible
//     (never under admin_only_sub_tabs_never_opt_in_tab_ids), and see the
//     sub-org entry only with the role's Sub-Organizations grant — which alone
//     keeps the opt-in tab showing just that entry
//   - mySidebar: visible:false hides, hidden categories hide their tabs, a rail
//     category with no visible tab is not drawn.
// Pure: no React, no "@/" imports (run by `node --test tests/`).
import type { CapabilityCatalog, NavManifest, ResolvedEntitlements } from "../types/modules";
import { buildGovernance, entitlementBlock, modulesOf, obj, type Governance } from "./modules-catalog.ts";

export type RoleDefaultsKey = "ADMIN" | "TEACHER";

/** ADMIN uses the admin defaults; TEACHER, CUSTOM:<id> and system roles use the teacher defaults. */
export function defaultsKeyFor(roleKey: string): RoleDefaultsKey {
  return roleKey === "ADMIN" ? "ADMIN" : "TEACHER";
}

export type HiddenReason = "MODULE_OFF" | "FEATURE_OFF" | "ADMIN_ONLY" | "HIDDEN_FOR_ROLE" | "CATEGORY_HIDDEN";

/** Most fundamental first: entitlement is a ceiling, then role rules, then the category switch. */
export const REASON_PRIORITY: HiddenReason[] = [
  "MODULE_OFF",
  "FEATURE_OFF",
  "ADMIN_ONLY",
  "HIDDEN_FOR_ROLE",
  "CATEGORY_HIDDEN",
];

export const REASON_LABELS: Record<HiddenReason, string> = {
  MODULE_OFF: "Module off",
  FEATURE_OFF: "Feature off",
  ADMIN_ONLY: "Admin only",
  HIDDEN_FOR_ROLE: "Hidden for role",
  CATEGORY_HIDDEN: "Category hidden",
};

// ── stored blob readers (defensive: the blob is tenant-written JSON) ────────

export interface BlobSub {
  id: string;
  label?: string;
  route?: string;
  order?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface BlobTab extends BlobSub {
  isCustom?: boolean;
  category?: string;
  subTabs: BlobSub[];
}

export interface BlobCategory {
  id: string;
  visible?: boolean;
  locked?: boolean;
  order?: number;
}

function readEntry(v: unknown): BlobSub | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !o.id) return null;
  const e: BlobSub = { id: o.id };
  if (typeof o.label === "string" && o.label) e.label = o.label;
  if (typeof o.route === "string" && o.route) e.route = o.route;
  if (typeof o.order === "number" && Number.isFinite(o.order)) e.order = o.order;
  if (typeof o.visible === "boolean") e.visible = o.visible;
  if (typeof o.locked === "boolean") e.locked = o.locked;
  return e;
}

export function readBlobSidebar(blob: Record<string, unknown> | null | undefined): BlobTab[] {
  const raw = blob?.sidebar;
  if (!Array.isArray(raw)) return [];
  const out: BlobTab[] = [];
  for (const item of raw) {
    const base = readEntry(item);
    if (!base) continue;
    const o = obj(item)!;
    const tab: BlobTab = { ...base, subTabs: [] };
    if (o.isCustom === true) tab.isCustom = true;
    if (typeof o.category === "string" && o.category) tab.category = o.category;
    if (Array.isArray(o.subTabs)) tab.subTabs = o.subTabs.map(readEntry).filter((s): s is BlobSub => !!s);
    out.push(tab);
  }
  return out;
}

export function readBlobCategories(blob: Record<string, unknown> | null | undefined): BlobCategory[] {
  const raw = blob?.sidebarCategories;
  if (!Array.isArray(raw)) return [];
  return raw.map(readEntry).filter((c): c is BlobCategory => !!c);
}

const isCustomId = (id: string) => id.startsWith("custom");

// ── merge (blob over role defaults) ─────────────────────────────────────────

export interface MergedSub {
  id: string;
  label: string;
  route: string | null;
  order: number;
  visible: boolean;
  locked: boolean;
  admin_only: boolean;
  custom: boolean;
  /** The stored blob has an explicit visible/locked for this id (vs the role default). */
  explicit: boolean;
}

export interface MergedTab extends Omit<MergedSub, "admin_only"> {
  category: string;
  sub_tabs: MergedSub[];
}

export interface MergedCategory {
  id: string;
  label: string;
  order: number;
  is_default_landing: boolean;
  visible: boolean;
  locked: boolean;
  explicit: boolean;
}

export interface MergedNav {
  categories: MergedCategory[];
  tabs: MergedTab[];
}

const hasExplicit = (e: BlobSub | undefined) => !!e && (typeof e.visible === "boolean" || typeof e.locked === "boolean");
const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function mergeRoleNav(
  nav: NavManifest,
  blob: Record<string, unknown> | null | undefined,
  roleKey: string
): MergedNav {
  const dk = defaultsKeyFor(roleKey);
  const saved = readBlobSidebar(blob);
  const savedById = new Map(saved.map((t) => [t.id, t]));
  const manifestIds = new Set(nav.tabs.map((t) => t.id));

  const tabs: MergedTab[] = nav.tabs.map((tab) => {
    const s = savedById.get(tab.id);
    const savedSubs = new Map((s?.subTabs ?? []).map((x) => [x.id, x]));
    const manifestSubIds = new Set(tab.sub_tabs.map((x) => x.id));
    const subs: MergedSub[] = tab.sub_tabs.map((sub) => {
      const ss = savedSubs.get(sub.id);
      return {
        id: sub.id,
        label: ss?.label && ss.label !== sub.label ? ss.label : sub.label,
        route: ss?.route ?? sub.route,
        order: ss?.order ?? sub.order,
        visible: ss?.visible ?? sub.default_visible[dk],
        locked: ss?.locked ?? false,
        admin_only: sub.admin_only,
        custom: false,
        explicit: hasExplicit(ss),
      };
    });
    // Admin-added custom sub-tabs under a built-in tab.
    for (const ss of s?.subTabs ?? []) {
      if (manifestSubIds.has(ss.id) || !isCustomId(ss.id)) continue;
      subs.push({
        id: ss.id,
        label: ss.label || ss.id,
        route: ss.route ?? null,
        order: ss.order ?? 0,
        visible: ss.visible ?? true,
        locked: ss.locked ?? false,
        admin_only: false,
        custom: true,
        explicit: hasExplicit(ss),
      });
    }
    return {
      id: tab.id,
      label: s?.label && s.label !== tab.label ? s.label : tab.label,
      route: s?.route ?? tab.route,
      order: s?.order ?? tab.order,
      visible: s?.visible ?? tab.default_visible[dk],
      locked: s?.locked ?? false,
      custom: false,
      explicit: hasExplicit(s),
      category: tab.category,
      sub_tabs: subs.sort(byOrder),
    };
  });

  // Custom tabs the institute added in its own Settings.
  for (const s of saved) {
    if (manifestIds.has(s.id) || !(s.isCustom || isCustomId(s.id))) continue;
    tabs.push({
      id: s.id,
      label: s.label || s.id,
      route: s.route ?? null,
      order: s.order ?? 0,
      visible: s.visible ?? true,
      locked: s.locked ?? false,
      custom: true,
      explicit: hasExplicit(s),
      category: s.category ?? "CRM",
      sub_tabs: s.subTabs
        .map((ss) => ({
          id: ss.id,
          label: ss.label || ss.id,
          route: ss.route ?? null,
          order: ss.order ?? 0,
          visible: ss.visible ?? true,
          locked: ss.locked ?? false,
          admin_only: false,
          custom: true,
          explicit: hasExplicit(ss),
        }))
        .sort(byOrder),
    });
  }

  const savedCats = new Map(readBlobCategories(blob).map((c) => [c.id, c]));
  const categories: MergedCategory[] = nav.categories.map((c) => {
    const s = savedCats.get(c.id);
    return {
      id: c.id,
      label: c.label,
      order: s?.order ?? c.order,
      is_default_landing: c.is_default_landing,
      visible: s?.visible ?? c.default_visible,
      locked: s?.locked ?? false,
      explicit: hasExplicit(s),
    };
  });
  // A tab whose category the manifest does not list still needs a bucket.
  for (const t of tabs) {
    if (!categories.some((c) => c.id === t.category)) {
      categories.push({
        id: t.category,
        label: t.category,
        order: categories.length,
        is_default_landing: false,
        visible: true,
        locked: false,
        explicit: false,
      });
    }
  }

  return { categories: categories.sort(byOrder), tabs: tabs.sort(byOrder) };
}

// ── preview ─────────────────────────────────────────────────────────────────

export interface PreviewRow {
  id: string;
  label: string;
  route: string | null;
  hidden: boolean;
  /** Primary reason (first by REASON_PRIORITY), null when visible. */
  reason: HiddenReason | null;
  reasons: HiddenReason[];
  locked: boolean;
  custom: boolean;
  /** Feature keys that govern this row (catalogue `governs.nav`). */
  features: string[];
  /** Modules owning those features. */
  modules: string[];
  /** Extra context for the reason chip (e.g. "all sub-tabs off"). */
  note: string | null;
}

export interface PreviewTab extends PreviewRow {
  category: string;
  sub_tabs: PreviewRow[];
}

export interface PreviewCategory {
  id: string;
  label: string;
  /** Drawn on the rail: visible in settings and at least one visible tab. */
  in_rail: boolean;
  hidden_reason: "CATEGORY_HIDDEN" | "EMPTY" | null;
  locked: boolean;
  is_default_landing: boolean;
  tabs: PreviewTab[];
}

export interface PreviewInput {
  nav: NavManifest;
  catalog: CapabilityCatalog | null;
  blob: Record<string, unknown> | null | undefined;
  roleKey: string;
  /** null = do not apply entitlements (LEGACY behaviour: everything entitled). */
  resolved: ResolvedEntitlements | null;
}

export interface PreviewResult {
  is_admin: boolean;
  categories: PreviewCategory[];
  visible_tabs: number;
  hidden_tabs: number;
}

const sortReasons = (r: Iterable<HiddenReason>) =>
  [...new Set(r)].sort((a, b) => REASON_PRIORITY.indexOf(a) - REASON_PRIORITY.indexOf(b));

function finish(row: Omit<PreviewRow, "hidden" | "reason" | "reasons">, reasons: HiddenReason[]): PreviewRow {
  const sorted = sortReasons(reasons);
  return { ...row, hidden: sorted.length > 0, reason: sorted[0] ?? null, reasons: sorted };
}

/** Read a dotted path (e.g. "subOrganizations.moduleEnabled") from the role blob. */
export function blobFlag(blob: Record<string, unknown> | null | undefined, path: string): boolean {
  let cur: unknown = blob;
  for (const part of path.split(".")) {
    const o = obj(cur);
    if (!o) return false;
    cur = o[part];
  }
  return cur === true;
}

export function resolvePreview(input: PreviewInput, govIn?: Governance): PreviewResult {
  const { nav, blob, roleKey, resolved } = input;
  const gov = govIn ?? buildGovernance(input.catalog);
  const isAdmin = roleKey === "ADMIN";
  const merged = mergeRoleNav(nav, blob, roleKey);
  const alwaysAdminOnly = new Set(nav.always_admin_only_tab_ids);
  const optInTabs = new Set(nav.non_admin_opt_in_tab_ids);
  const neverOptInSubs = new Set(nav.admin_only_sub_tabs_never_opt_in_tab_ids);
  const subOrg = nav.sub_org_module;
  // The Sub-Organizations grant is a role setting, not a sidebar flag.
  const subOrgGranted = !isAdmin && !!subOrg && blobFlag(blob, subOrg.role_setting);
  const catById = new Map(merged.categories.map((c) => [c.id, c]));

  const block = (features: string[]): HiddenReason[] => {
    if (!resolved) return [];
    const b = entitlementBlock(features, resolved, gov);
    return b ? [b.reason] : [];
  };

  const tabs: PreviewTab[] = merged.tabs.map((tab) => {
    const tabFeatures = tab.custom ? [] : gov.featuresForTab(tab.id);
    const own: HiddenReason[] = [];
    let note: string | null = null;
    const isSubOrgTab = !!subOrg && subOrg.tab_id === tab.id;
    // Non-admin, opt-in tab not switched on, but the role holds the sub-org grant:
    // the tab stays, carrying ONLY the sub-org entry (admin app filterSidebarByRole).
    const subOrgOnly = !isAdmin && isSubOrgTab && optInTabs.has(tab.id) && tab.visible !== true && subOrgGranted;

    if (!isAdmin && alwaysAdminOnly.has(tab.id)) own.push("ADMIN_ONLY");
    own.push(...block(tabFeatures));
    if (subOrgOnly) {
      note = "shown only for the Sub-Organizations grant";
    } else if (!tab.visible) {
      own.push("HIDDEN_FOR_ROLE");
      if (!isAdmin && optInTabs.has(tab.id)) note = "non-admins get this tab only when switched on";
    }

    const subs = tab.sub_tabs.map((sub) => {
      const features = sub.custom ? tabFeatures : gov.featuresForSub(tab.id, sub.id);
      const r: HiddenReason[] = [];
      let subNote: string | null = null;
      const isSubOrgSub = isSubOrgTab && subOrg!.sub_tab_id === sub.id;
      if (!isAdmin && sub.admin_only) {
        if (neverOptInSubs.has(tab.id)) {
          r.push("ADMIN_ONLY");
          subNote = "never available to non-admins";
        } else if (!(tab.visible === true && sub.visible === true)) {
          // Non-admins get an admin_only sub-tab only when its tab and itself are explicitly visible.
          r.push("ADMIN_ONLY");
        }
      }
      if (!isAdmin && isSubOrgSub && !subOrgGranted) {
        r.push("HIDDEN_FOR_ROLE");
        subNote = "needs the Sub-Organizations grant for this role";
      }
      if (subOrgOnly && !isSubOrgSub) {
        r.push("HIDDEN_FOR_ROLE");
        subNote = "tab is shown only for the Sub-Organizations entry";
      }
      // The tab's own block is inherited below; only the sub-tab's extra governance counts here.
      const subOnly = features.filter((f) => !tabFeatures.includes(f));
      r.push(...block(subOnly));
      if (!sub.visible && !(subOrgOnly && isSubOrgSub)) r.push("HIDDEN_FOR_ROLE");
      return { sub, features, own: r, note: subNote };
    });

    // A group whose every sub-tab is switched off by entitlement has nothing left to open.
    const isEntitlement = (r: HiddenReason) => r === "MODULE_OFF" || r === "FEATURE_OFF";
    if (subs.length > 0 && !tab.custom && subs.every((s) => s.own.some(isEntitlement))) {
      own.push(subs.every((s) => s.own.includes("MODULE_OFF")) ? "MODULE_OFF" : "FEATURE_OFF");
      note = "every sub-tab is switched off";
    }

    const cat = catById.get(tab.category);
    if (cat && !cat.visible) own.push("CATEGORY_HIDDEN");

    const tabRow = finish(
      {
        id: tab.id,
        label: tab.label,
        route: tab.route,
        locked: tab.locked,
        custom: tab.custom,
        features: tabFeatures,
        modules: modulesOf(tabFeatures, gov),
        note,
      },
      own
    );

    const subRows = subs.map(({ sub, features, own: subOwn, note: subNote }) =>
      finish(
        {
          id: sub.id,
          label: sub.label,
          route: sub.route,
          locked: sub.locked,
          custom: sub.custom,
          features,
          modules: modulesOf(features, gov),
          note: subNote,
        },
        // Hidden with the tab: carry the tab's reasons too.
        [...subOwn, ...(tabRow.hidden ? tabRow.reasons : [])]
      )
    );
    return { ...tabRow, category: tab.category, sub_tabs: subRows };
  });

  const categories: PreviewCategory[] = merged.categories.map((c) => {
    const catTabs = tabs.filter((t) => t.category === c.id);
    const anyVisible = catTabs.some((t) => !t.hidden);
    return {
      id: c.id,
      label: c.label,
      in_rail: c.visible && anyVisible,
      hidden_reason: !c.visible ? "CATEGORY_HIDDEN" : anyVisible ? null : "EMPTY",
      locked: c.locked,
      is_default_landing: c.is_default_landing,
      tabs: catTabs,
    };
  });

  return {
    is_admin: isAdmin,
    categories,
    visible_tabs: tabs.filter((t) => !t.hidden).length,
    hidden_tabs: tabs.filter((t) => t.hidden).length,
  };
}

// ── "Import from current settings" ──────────────────────────────────────────

export interface ImportedModules {
  /** module key → on/off; absent when the module governs no sidebar item. */
  modules: Record<string, boolean>;
  /** feature key → on/off; absent when the feature governs no sidebar item. */
  features: Record<string, boolean>;
  /** module key → labels of the visible items that switched it on. */
  evidence: Record<string, string[]>;
  /** Modules with no sidebar item to judge by (left as they are). */
  no_evidence: string[];
}

/**
 * Pre-fill module toggles from the ADMIN role's stored display settings: a
 * module is on when any sidebar item it governs is visible (tab and sub-tab
 * flags, its own category) and the module's rail category is visible. Core
 * modules are skipped (always on).
 */
export function importModulesFromSettings(
  catalog: CapabilityCatalog,
  nav: NavManifest,
  adminBlob: Record<string, unknown> | null | undefined
): ImportedModules {
  const merged = mergeRoleNav(nav, adminBlob, "ADMIN");
  const catVisible = new Map(merged.categories.map((c) => [c.id, c.visible]));

  // Every concrete nav id → visible?, label
  const items: Array<{ id: string; visible: boolean; label: string }> = [];
  for (const t of merged.tabs) {
    if (t.custom) continue;
    const tabVisible = t.visible && catVisible.get(t.category) !== false;
    items.push({ id: t.id, visible: tabVisible, label: t.label });
    for (const s of t.sub_tabs) {
      if (s.custom) continue;
      items.push({ id: `${t.id}/${s.id}`, visible: tabVisible && s.visible, label: `${t.label} › ${s.label}` });
    }
  }
  const match = (entry: string) =>
    entry.endsWith("*")
      ? items.filter((i) => i.id.startsWith(entry.slice(0, -1)))
      : items.filter((i) => i.id === entry);

  const out: ImportedModules = { modules: {}, features: {}, evidence: {}, no_evidence: [] };
  for (const m of catalog.modules) {
    if (m.core) continue;
    const railOk = !m.rail || catVisible.get(m.rail) !== false;
    let governsAny = false;
    const seen: string[] = [];
    for (const f of m.features) {
      const hits = f.governs.nav.flatMap(match);
      if (f.governs.nav.length === 0 || hits.length === 0) continue;
      governsAny = true;
      const visible = hits.filter((h) => h.visible);
      out.features[f.key] = railOk && visible.length > 0;
      for (const v of visible) if (!seen.includes(v.label)) seen.push(v.label);
    }
    if (!governsAny) {
      out.no_evidence.push(m.key);
      continue;
    }
    out.modules[m.key] = railOk && seen.length > 0;
    out.evidence[m.key] = railOk ? seen : [];
  }
  return out;
}
