// Pure helpers for Institute Modules & Configuration (spec §12): response
// normalizers, the catalogue governance index and the Modules-tab draft logic.
// No React and no "@/" imports, so `node --test tests/` can run them directly.
import type {
  CapabilityCatalog,
  CatalogFeature,
  CatalogGoverns,
  CatalogModule,
  CatalogResponse,
  EntitlementChange,
  EntitlementRow,
  InstituteModules,
  InstituteRole,
  InstituteRoleKind,
  ModuleHistoryEntry,
  ModuleMode,
  ModulePreset,
  ModulesOverview,
  NavCategory,
  NavManifest,
  NavSubOrgModule,
  NavSubTab,
  NavTab,
  PageResponse,
  ApplyPresetResult,
  ResolvedEntitlements,
  RestoreSettingResult,
  RoleDisplaySettings,
  RoleDefaults,
  SettingHistoryDetail,
  SettingHistoryEntry,
} from "../types/modules";

// ── tiny coercers ───────────────────────────────────────────────────────────

export function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

function strOrNull(v: unknown): string | null {
  const s = str(v, "");
  return s === "" ? null : s;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
}

function boolMap(v: unknown): Record<string, boolean> {
  const o = obj(v);
  const out: Record<string, boolean> = {};
  if (!o) return out;
  for (const [k, val] of Object.entries(o)) if (typeof val === "boolean") out[k] = val;
  return out;
}

// ── errors ──────────────────────────────────────────────────────────────────

export function httpStatus(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } })?.response?.status;
  return typeof s === "number" ? s : null;
}

/** The backend for this feature is not deployed yet (route missing). */
export function isApiUnavailable(err: unknown): boolean {
  const s = httpStatus(err);
  return s === 404 || s === 501;
}

/** 409 VERSION_CONFLICT from the display-settings PUT. */
export function isVersionConflict(err: unknown): boolean {
  if (httpStatus(err) !== 409) return false;
  const code = obj((err as { response?: { data?: unknown } })?.response?.data)?.code;
  return code === undefined || code === "VERSION_CONFLICT";
}

export function errorMessage(err: unknown, fallback = "Request failed"): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 300);
  const d = obj(data);
  if (d) {
    for (const k of ["message", "ex", "error", "detail", "code"]) {
      const v = d[k];
      if (typeof v === "string" && v) return v;
    }
  }
  const msg = (err as { message?: unknown })?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

// ── catalogue + nav manifest ────────────────────────────────────────────────

function normalizeGoverns(v: unknown): CatalogGoverns {
  const g = obj(v) ?? {};
  return {
    nav: strArr(g.nav),
    widgets: strArr(g.widgets),
    quick_actions: strArr(g.quick_actions),
    assistant_groups: strArr(g.assistant_groups),
    setup_steps: strArr(g.setup_steps),
    routes: strArr(g.routes),
  };
}

function normalizeFeature(v: unknown): CatalogFeature | null {
  const f = obj(v);
  if (!f || !str(f.key)) return null;
  return {
    key: str(f.key),
    label: str(f.label, str(f.key)),
    description: strOrNull(f.description),
    default_on: bool(f.default_on, true),
    governs: normalizeGoverns(f.governs),
    setting_keys: strArr(f.setting_keys),
  };
}

function normalizeModule(v: unknown): CatalogModule | null {
  const m = obj(v);
  if (!m || !str(m.key)) return null;
  return {
    key: str(m.key),
    label: str(m.label, str(m.key)),
    description: strOrNull(m.description),
    rail: strOrNull(m.rail),
    core: bool(m.core, false),
    features: (Array.isArray(m.features) ? m.features : [])
      .map(normalizeFeature)
      .filter((f): f is CatalogFeature => !!f),
  };
}

export function normalizeCatalog(v: unknown): CapabilityCatalog | null {
  const c = obj(v);
  if (!c || !Array.isArray(c.modules)) return null;
  return {
    version: num(c.version, 0),
    modules: c.modules.map(normalizeModule).filter((m): m is CatalogModule => !!m),
  };
}

function normalizeRoleDefaults(v: unknown, fallback: boolean): RoleDefaults {
  if (typeof v === "boolean") return { ADMIN: v, TEACHER: v };
  const o = obj(v) ?? {};
  return { ADMIN: bool(o.ADMIN, fallback), TEACHER: bool(o.TEACHER, fallback) };
}

function normalizeSubTab(v: unknown, index: number): NavSubTab | null {
  const s = obj(v);
  if (!s || !str(s.id)) return null;
  return {
    id: str(s.id),
    label: str(s.label, str(s.id)),
    route: strOrNull(s.route),
    order: num(s.order, index),
    admin_only: bool(s.admin_only, false),
    default_visible: normalizeRoleDefaults(s.default_visible, true),
  };
}

function normalizeTab(v: unknown, index: number): NavTab | null {
  const t = obj(v);
  if (!t || !str(t.id)) return null;
  return {
    id: str(t.id),
    label: str(t.label, str(t.id)),
    category: str(t.category, "CRM"),
    route: strOrNull(t.route),
    order: num(t.order, index),
    default_visible: normalizeRoleDefaults(t.default_visible, true),
    sub_tabs: (Array.isArray(t.sub_tabs) ? t.sub_tabs : [])
      .map(normalizeSubTab)
      .filter((s): s is NavSubTab => !!s),
  };
}

function normalizeSubOrgModule(v: unknown): NavSubOrgModule | null {
  const o = obj(v);
  if (!o || !str(o.tab_id) || !str(o.sub_tab_id)) return null;
  return { tab_id: str(o.tab_id), sub_tab_id: str(o.sub_tab_id), role_setting: str(o.role_setting, "subOrganizations.moduleEnabled") };
}

export function normalizeNav(v: unknown): NavManifest | null {
  const n = obj(v);
  if (!n || !Array.isArray(n.tabs)) return null;
  return {
    generated_at: strOrNull(n.generated_at),
    categories: (Array.isArray(n.categories) ? n.categories : [])
      .map((c, i): NavCategory | null => {
        const o = obj(c);
        if (!o || !str(o.id)) return null;
        return {
          id: str(o.id),
          label: str(o.label, str(o.id)),
          default_visible: bool(o.default_visible, true),
          order: num(o.order, i),
          is_default_landing: bool(o.is_default_landing, false),
        };
      })
      .filter((c): c is NavCategory => !!c),
    always_admin_only_tab_ids: strArr(n.always_admin_only_tab_ids),
    non_admin_opt_in_tab_ids: strArr(n.non_admin_opt_in_tab_ids),
    admin_only_sub_tabs_never_opt_in_tab_ids: strArr(n.admin_only_sub_tabs_never_opt_in_tab_ids),
    sub_org_module: normalizeSubOrgModule(n.sub_org_module),
    tabs: n.tabs.map(normalizeTab).filter((t): t is NavTab => !!t),
  };
}

export function normalizeCatalogResponse(v: unknown): CatalogResponse {
  const o = obj(v) ?? {};
  return { catalog: normalizeCatalog(o.catalog), nav: normalizeNav(o.nav) };
}

// ── institute modules ───────────────────────────────────────────────────────

function mode(v: unknown): ModuleMode {
  return v === "MANAGED" ? "MANAGED" : "LEGACY";
}

export function normalizeEntitlementRow(v: unknown): EntitlementRow | null {
  const r = obj(v);
  if (!r || !str(r.key)) return null;
  return {
    key: str(r.key),
    enabled: bool(r.enabled, false),
    expires_at: strOrNull(r.expires_at),
    note: strOrNull(r.note),
    updated_by: strOrNull(r.updated_by),
    updated_at: strOrNull(r.updated_at),
  };
}

export function normalizeInstituteModules(v: unknown, instituteId: string): InstituteModules {
  const o = obj(v) ?? {};
  const resolved = obj(o.resolved) ?? {};
  return {
    institute_id: str(o.institute_id, instituteId),
    mode: mode(o.mode),
    mode_updated_by: strOrNull(o.mode_updated_by),
    mode_updated_at: strOrNull(o.mode_updated_at),
    catalog_version: typeof o.catalog_version === "number" ? o.catalog_version : null,
    entitlements: (Array.isArray(o.entitlements) ? o.entitlements : [])
      .map(normalizeEntitlementRow)
      .filter((r): r is EntitlementRow => !!r),
    resolved: { modules: boolMap(resolved.modules), features: boolMap(resolved.features) },
  };
}

export function normalizePage<T>(v: unknown, item: (x: unknown) => T | null): PageResponse<T> {
  const o = obj(v);
  const raw = Array.isArray(v) ? v : Array.isArray(o?.content) ? (o!.content as unknown[]) : [];
  const content = raw.map(item).filter((x): x is T => x !== null);
  return {
    content,
    total_elements: num(o?.total_elements, content.length),
    total_pages: num(o?.total_pages, content.length > 0 ? 1 : 0),
    number: num(o?.number, 0),
    size: num(o?.size, content.length),
  };
}

export function normalizeModuleHistoryEntry(v: unknown): ModuleHistoryEntry | null {
  const e = obj(v);
  if (!e) return null;
  return {
    id: str(e.id, ""),
    key: str(e.key, ""),
    old_value: typeof e.old_value === "string" ? e.old_value : e.old_value == null ? null : JSON.stringify(e.old_value),
    new_value: typeof e.new_value === "string" ? e.new_value : e.new_value == null ? null : JSON.stringify(e.new_value),
    reason: strOrNull(e.reason),
    note: strOrNull(e.note),
    actor_user_id: strOrNull(e.actor_user_id),
    created_at: strOrNull(e.created_at),
  };
}

export function normalizeOverview(v: unknown): ModulesOverview {
  const o = obj(v) ?? {};
  const out: ModulesOverview = {};
  for (const [id, raw] of Object.entries(o)) {
    const e = obj(raw);
    if (!e) continue;
    out[id] = { mode: mode(e.mode), enabled_modules: strArr(e.enabled_modules) };
  }
  return out;
}

export function normalizePresets(v: unknown): ModulePreset[] {
  return (Array.isArray(v) ? v : [])
    .map((raw): ModulePreset | null => {
      const p = obj(raw);
      if (!p || !str(p.key)) return null;
      return {
        key: str(p.key),
        name: str(p.name, str(p.key)),
        description: strOrNull(p.description),
        modules: strArr(p.modules),
        updated_by: strOrNull(p.updated_by),
        updated_at: strOrNull(p.updated_at),
      };
    })
    .filter((p): p is ModulePreset => !!p);
}

export function normalizeApplyResult(v: unknown, requested: string[]): ApplyPresetResult {
  const o = obj(v);
  if (!o) return { applied: requested, failed: [] };
  return {
    applied: strArr(o.applied),
    failed: (Array.isArray(o.failed) ? o.failed : [])
      .map((f) => {
        const e = obj(f);
        return e ? { institute_id: str(e.institute_id), error: str(e.error, "failed") } : null;
      })
      .filter((f): f is { institute_id: string; error: string } => !!f),
  };
}

const ROLE_KINDS: InstituteRoleKind[] = ["ADMIN", "TEACHER", "SYSTEM", "CUSTOM"];

export function normalizeRoles(v: unknown): InstituteRole[] {
  return (Array.isArray(v) ? v : [])
    .map((raw): InstituteRole | null => {
      const r = obj(raw);
      if (!r || !str(r.role_id)) return null;
      const kind = ROLE_KINDS.includes(r.kind as InstituteRoleKind) ? (r.kind as InstituteRoleKind) : "CUSTOM";
      return {
        role_id: str(r.role_id),
        role_name: str(r.role_name, str(r.role_id)),
        kind,
        user_count: typeof r.user_count === "number" ? r.user_count : null,
      };
    })
    .filter((r): r is InstituteRole => !!r);
}

/** Display-settings role key per spec §12.3. SYSTEM roles have none (they use TEACHER). */
export function roleKeyFor(role: InstituteRole): string | null {
  if (role.kind === "ADMIN") return "ADMIN";
  if (role.kind === "TEACHER") return "TEACHER";
  if (role.kind === "CUSTOM") return `CUSTOM:${role.role_id}`;
  return null;
}

export interface RoleColumn {
  id: string;
  name: string;
  kind: InstituteRole["kind"];
  /** Display-settings key the column reads (SYSTEM roles read TEACHER). */
  roleKey: string;
  readOnly: boolean;
  userCount: number | null;
}

/** Roles → matrix columns. ADMIN and TEACHER always exist even if the roles API is missing. */
export function roleColumns(roles: InstituteRole[] | undefined): RoleColumn[] {
  const cols: RoleColumn[] = [];
  const list = roles ?? [];
  const pushBuiltIn = (kind: "ADMIN" | "TEACHER") => {
    const r = list.find((x) => x.kind === kind);
    cols.push({
      id: r?.role_id ?? kind,
      name: kind === "ADMIN" ? "Admin" : "Teacher",
      kind,
      roleKey: kind,
      readOnly: false,
      userCount: r?.user_count ?? null,
    });
  };
  pushBuiltIn("ADMIN");
  pushBuiltIn("TEACHER");
  for (const r of list.filter((x) => x.kind === "CUSTOM")) {
    cols.push({ id: r.role_id, name: r.role_name, kind: "CUSTOM", roleKey: roleKeyFor(r)!, readOnly: false, userCount: r.user_count });
  }
  for (const r of list.filter((x) => x.kind === "SYSTEM")) {
    cols.push({ id: r.role_id, name: r.role_name, kind: "SYSTEM", roleKey: "TEACHER", readOnly: true, userCount: r.user_count });
  }
  return cols;
}

export function normalizeDisplaySettings(v: unknown, roleKey: string): RoleDisplaySettings {
  const o = obj(v) ?? {};
  let data: unknown = o.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  return {
    role_key: str(o.role_key, roleKey),
    data: obj(data),
    version: strOrNull(o.version),
  };
}

export function normalizeSettingHistoryEntry(v: unknown): SettingHistoryEntry | null {
  const e = obj(v);
  if (!e) return null;
  return {
    id: str(e.id, ""),
    setting_key: str(e.setting_key, ""),
    actor_user_id: strOrNull(e.actor_user_id),
    source: str(e.source, "TENANT"),
    created_at: strOrNull(e.created_at),
    reason: strOrNull(e.reason),
  };
}

export function normalizeSettingHistoryDetail(v: unknown): SettingHistoryDetail | null {
  const base = normalizeSettingHistoryEntry(v);
  const e = obj(v);
  if (!base || !e) return null;
  const text = (x: unknown) => (typeof x === "string" ? x : x == null ? null : JSON.stringify(x));
  return { ...base, old_value: text(e.old_value), new_value: text(e.new_value) };
}

// ── governance index ────────────────────────────────────────────────────────

export interface Governance {
  modules: CatalogModule[];
  moduleByKey: Map<string, CatalogModule>;
  featureByKey: Map<string, CatalogFeature>;
  /** feature key → module key */
  moduleOfFeature: Map<string, string>;
  /** Feature keys governing a nav id ("tab" or "tab/sub"); wildcards ending in "*" match by prefix. */
  featuresFor: (navId: string) => string[];
  /** Tab row: features governing the tab. */
  featuresForTab: (tabId: string) => string[];
  /** Sub-tab row: features governing the tab plus those governing "tab/sub". */
  featuresForSub: (tabId: string, subId: string) => string[];
}

export function buildGovernance(catalog: CapabilityCatalog | null): Governance {
  const modules = catalog?.modules ?? [];
  const moduleByKey = new Map<string, CatalogModule>();
  const featureByKey = new Map<string, CatalogFeature>();
  const moduleOfFeature = new Map<string, string>();
  const exact = new Map<string, string[]>();
  const wildcards: Array<{ prefix: string; feature: string }> = [];

  for (const m of modules) {
    moduleByKey.set(m.key, m);
    for (const f of m.features) {
      featureByKey.set(f.key, f);
      moduleOfFeature.set(f.key, m.key);
      for (const navId of f.governs.nav) {
        if (navId.endsWith("*")) {
          wildcards.push({ prefix: navId.slice(0, -1), feature: f.key });
        } else {
          const list = exact.get(navId) ?? [];
          if (!list.includes(f.key)) list.push(f.key);
          exact.set(navId, list);
        }
      }
    }
  }

  const featuresFor = (navId: string) => {
    const out = new Set(exact.get(navId) ?? []);
    for (const w of wildcards) if (navId.startsWith(w.prefix)) out.add(w.feature);
    return [...out];
  };

  return {
    modules,
    moduleByKey,
    featureByKey,
    moduleOfFeature,
    featuresFor,
    featuresForTab: (tabId) => featuresFor(tabId),
    featuresForSub: (tabId, subId) => [...new Set([...featuresFor(tabId), ...featuresFor(`${tabId}/${subId}`)])],
  };
}

/** Module keys owning any of these features (for the matrix module badge). */
export function modulesOf(features: string[], gov: Governance): string[] {
  const out: string[] = [];
  for (const f of features) {
    const m = gov.moduleOfFeature.get(f);
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

export type EntitlementBlock = "MODULE_OFF" | "FEATURE_OFF";

/**
 * Why governed features block an element, or null when all are on. A feature
 * missing from `resolved` counts as on (fail-open, as the admin app does).
 */
export function entitlementBlock(
  features: string[],
  resolved: ResolvedEntitlements,
  gov: Governance
): { reason: EntitlementBlock; feature: string } | null {
  let featureOff: string | null = null;
  for (const f of features) {
    if (resolved.features[f] !== false) continue;
    const m = gov.moduleOfFeature.get(f);
    if (m && resolved.modules[m] === false) return { reason: "MODULE_OFF", feature: f };
    featureOff ??= f;
  }
  return featureOff ? { reason: "FEATURE_OFF", feature: featureOff } : null;
}

// ── Modules tab draft ───────────────────────────────────────────────────────

export interface EntitlementState {
  enabled: boolean;
  expires_at: string | null;
  note: string | null;
}

/** Stored state of a module/feature key; no row → off for modules, `default_on` for features; core is always on. */
export function storedState(key: string, rows: EntitlementRow[], gov: Governance): EntitlementState {
  const row = rows.find((r) => r.key === key);
  const mod = gov.moduleByKey.get(key);
  if (mod?.core) return { enabled: true, expires_at: null, note: row?.note ?? null };
  if (row) return { enabled: row.enabled, expires_at: row.expires_at, note: row.note };
  const feature = gov.featureByKey.get(key);
  return { enabled: feature ? feature.default_on : false, expires_at: null, note: null };
}

const blankToNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

function sameInstant(a: string | null, b: string | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Batched `changes` for PUT …/modules: only keys whose state differs from what
 * is stored, each sent with its full state (enabled, expires_at, note) so the
 * request never depends on how the server treats an omitted field.
 */
export function diffChanges(
  draft: Record<string, EntitlementState>,
  rows: EntitlementRow[],
  gov: Governance
): EntitlementChange[] {
  const out: EntitlementChange[] = [];
  for (const [key, next] of Object.entries(draft)) {
    if (gov.moduleByKey.get(key)?.core) continue;
    const cur = storedState(key, rows, gov);
    const note = blankToNull(next.note);
    const hasRow = rows.some((r) => r.key === key);
    if (hasRow && cur.enabled === next.enabled && sameInstant(cur.expires_at, next.expires_at) && blankToNull(cur.note) === note) {
      continue;
    }
    // Without a row the key resolves to its default; only an actual difference is a change.
    if (!hasRow && cur.enabled === next.enabled && !next.expires_at && !note) continue;
    out.push({ key, enabled: next.enabled, expires_at: next.expires_at ?? null, note });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function isExpired(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/** <input type="date"> value → end of that day, UTC. */
export function dateInputToIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T23:59:59Z`;
}

export function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Counts for the "resolved" summary (what MANAGED mode applies). */
export function resolvedCounts(resolved: ResolvedEntitlements, catalog: CapabilityCatalog | null) {
  const modules = catalog?.modules ?? [];
  const features = modules.flatMap((m) => m.features);
  return {
    modulesOn: modules.filter((m) => m.core || resolved.modules[m.key] === true).length,
    modulesTotal: modules.length,
    featuresOn: features.filter((f) => resolved.features[f.key] === true).length,
    featuresTotal: features.length,
  };
}

/** Parse a module-history value string ({"enabled":true,"expires_at":null} or a mode). */
export function describeHistoryValue(v: string | null): string {
  if (v == null || v === "") return "none";
  try {
    const parsed: unknown = JSON.parse(v);
    if (typeof parsed === "string") return parsed;
    const o = obj(parsed);
    if (!o) return String(parsed);
    const parts: string[] = [];
    if (typeof o.mode === "string") parts.push(o.mode);
    if (typeof o.enabled === "boolean") parts.push(o.enabled ? "on" : "off");
    if (typeof o.expires_at === "string" && o.expires_at) parts.push(`until ${o.expires_at.slice(0, 10)}`);
    if (typeof o.note === "string" && o.note) parts.push(`“${o.note}”`);
    return parts.length > 0 ? parts.join(" · ") : v;
  } catch {
    return v;
  }
}

export function normalizeRestoreResult(v: unknown, historyId: string): RestoreSettingResult {
  const o = obj(v) ?? {};
  return {
    restored_from: str(o.restored_from, historyId),
    setting_key: str(o.setting_key, ""),
    changed: bool(o.changed, true),
  };
}

/** The server's current version from a 409 VERSION_CONFLICT body, if sent. */
export function conflictCurrentVersion(err: unknown): string | null {
  return strOrNull(obj((err as { response?: { data?: unknown } })?.response?.data)?.current_version);
}

/** Overview chips: core is implied, so only non-core enabled modules are listed. */
export function overviewModules(enabled: string[], catalog: CapabilityCatalog | null): string[] {
  const core = new Set((catalog?.modules ?? []).filter((m) => m.core).map((m) => m.key));
  return enabled.filter((k) => !core.has(k));
}

/** Preset keys are permanent identifiers: lowercase snake case. */
export function isValidPresetKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{1,62}$/.test(key);
}
