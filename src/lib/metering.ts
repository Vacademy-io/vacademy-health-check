// Pure helpers for the Metering page. No React and no "@/" imports, so
// `node --test tests/` can run them directly (see tests/metering.test.ts).
import type {
  CatalogPatch,
  CoverageResponse,
  MappableRoleClass,
  ParityRow,
  RoleMapResponse,
  RoleMapRow,
  UnmappedRole,
  UseCaseCatalogRow,
} from "../types/metering";

/** Platform setting that turns on the History v2 UI per institute (JSON array of ids, or ["*"]). */
export const HISTORY_V2_SETTING_KEY = "metering.history_v2_institutes";

export const ROLE_CLASSES: readonly MappableRoleClass[] = ["ADMIN", "TEACHER", "STAFF", "PARENT", "LEARNER"];

/** Precedence the design seeds per class: lower wins when a user holds several roles. */
export const DEFAULT_PRECEDENCE: Record<MappableRoleClass, number> = {
  ADMIN: 10,
  TEACHER: 20,
  STAFF: 30,
  PARENT: 40,
  LEARNER: 50,
};

/** What an unmapped custom role counts as today, until someone maps it. */
export const UNMAPPED_CLASS: MappableRoleClass = "STAFF";
export const UNMAPPED_PRECEDENCE = 35;

/** Feature groups the catalog uses (d_credits §1.2). A row may carry one this list does not know. */
export const FEATURE_GROUPS: readonly string[] = [
  "tutor",
  "video",
  "calling",
  "content",
  "assessment",
  "analytics",
  "kb",
  "crm",
  "engagement",
  "agent",
  "media",
  "platform",
];

export const COVERAGE_DAY_OPTIONS = [7, 30] as const;

/** NUMERIC columns can arrive as strings; anything unparseable becomes `fallback`. */
export function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

function countMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(raw))) out[k] = toNumber(v);
  return out;
}

/** Same rule as ai-service security.py: upper case, spaces and hyphens become '_'. */
export function normalizeRoleName(raw: string): string {
  return raw.trim().toUpperCase().replace(/[-\s]/g, "_");
}

export function isMappableRoleClass(v: unknown): v is MappableRoleClass {
  return typeof v === "string" && (ROLE_CLASSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------- catalog

export function normalizeCatalogRow(raw: unknown): UseCaseCatalogRow {
  const r = obj(raw);
  return {
    use_case: String(r.use_case ?? ""),
    feature_group: str(r.feature_group) ?? "platform",
    label: str(r.label) ?? String(r.use_case ?? ""),
    label_template: str(r.label_template),
    count_unit_label: str(r.count_unit_label),
    model_use_case: str(r.model_use_case),
    legacy_request_types: strList(r.legacy_request_types),
    tool_keys: strList(r.tool_keys),
    capability_key: str(r.capability_key),
    default_surface: str(r.default_surface) ?? "UNKNOWN",
    actor_kind: str(r.actor_kind) ?? "USER",
    unit_kind: str(r.unit_kind) ?? "TOKENS",
    billing_policy: str(r.billing_policy) ?? "AS_TODAY",
    plan_eligible: bool(r.plan_eligible, true),
    limit_eligible: bool(r.limit_eligible, true),
    // A row without the flag is treated as active, like the column default.
    is_active: bool(r.is_active, true),
    display_order: toNumber(r.display_order, 100),
    updated_by: str(r.updated_by),
    updated_at: str(r.updated_at),
  };
}

/** Rows ordered the way tenants see them: display_order, then key. Rows with no key are dropped. */
export function normalizeCatalog(raw: unknown): UseCaseCatalogRow[] {
  const list = obj(raw).use_cases;
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeCatalogRow)
    .filter((r) => r.use_case !== "")
    .sort((a, b) => a.display_order - b.display_order || a.use_case.localeCompare(b.use_case));
}

export interface CatalogDraft {
  label: string;
  label_template: string;
  feature_group: string;
  display_order: string;
}

export function draftFromRow(row: UseCaseCatalogRow): CatalogDraft {
  return {
    label: row.label,
    label_template: row.label_template ?? "",
    feature_group: row.feature_group,
    display_order: String(row.display_order),
  };
}

const LABEL_MAX = 128;
const TEMPLATE_MAX = 255;
const GROUP_MAX = 48;

/**
 * The PATCH body for an inline catalog edit: only the fields that changed, plus the reason.
 * Returns an error string instead when the edit cannot be sent.
 */
export function buildCatalogPatch(
  row: UseCaseCatalogRow,
  draft: CatalogDraft,
  reason: string
): { patch: CatalogPatch } | { error: string } {
  const why = reason.trim();
  const patch: CatalogPatch = { reason: why };
  let changed = false;

  const label = draft.label.trim();
  if (label === "") return { error: "Label cannot be empty" };
  if (label.length > LABEL_MAX) return { error: `Label is too long (max ${LABEL_MAX})` };
  if (label !== row.label) {
    patch.label = label;
    changed = true;
  }

  const template = draft.label_template.trim();
  if (template.length > TEMPLATE_MAX) return { error: `Label template is too long (max ${TEMPLATE_MAX})` };
  if (template !== (row.label_template ?? "")) {
    patch.label_template = template === "" ? null : template;
    changed = true;
  }

  const group = draft.feature_group.trim().toLowerCase();
  if (group === "") return { error: "Feature group cannot be empty" };
  if (group.length > GROUP_MAX || !/^[a-z0-9_]+$/.test(group)) {
    return { error: "Feature group: lower-case letters, digits and _ only" };
  }
  if (group !== row.feature_group) {
    patch.feature_group = group;
    changed = true;
  }

  const orderText = draft.display_order.trim();
  const order = Number(orderText);
  if (orderText === "" || !Number.isInteger(order) || order < 0 || order > 100_000) {
    return { error: "Display order must be a whole number from 0 to 100000" };
  }
  if (order !== row.display_order) {
    patch.display_order = order;
    changed = true;
  }

  if (!changed) return { error: "Nothing changed" };
  if (why === "") return { error: "Say why (it lands in the change log)" };
  return { patch };
}

// ---------------------------------------------------------------- role map

export function normalizeRoleMap(raw: unknown): RoleMapResponse {
  const r = obj(raw);
  const roles: RoleMapRow[] = (Array.isArray(r.roles) ? r.roles : [])
    .map((x) => {
      const o = obj(x);
      return {
        role_name: String(o.role_name ?? ""),
        role_class: str(o.role_class) ?? UNMAPPED_CLASS,
        precedence: toNumber(o.precedence, UNMAPPED_PRECEDENCE),
      };
    })
    .filter((x) => x.role_name !== "")
    .sort((a, b) => a.precedence - b.precedence || a.role_name.localeCompare(b.role_name));
  const mapped = new Set(roles.map((x) => x.role_name));
  const unmapped: UnmappedRole[] = (Array.isArray(r.unmapped) ? r.unmapped : [])
    .map((x) => {
      const o = obj(x);
      return { role_name: String(o.role_name ?? ""), events: toNumber(o.events) };
    })
    // A role mapped since the list was computed must not be offered twice.
    .filter((x) => x.role_name !== "" && !mapped.has(x.role_name))
    .sort((a, b) => b.events - a.events || a.role_name.localeCompare(b.role_name));
  return { roles, unmapped };
}

/** Precedence must be a whole number 1..999; returns the parsed value or an error. */
export function parsePrecedence(text: string): { value: number } | { error: string } {
  const t = text.trim();
  const n = Number(t);
  if (t === "" || !Number.isInteger(n) || n < 1 || n > 999) {
    return { error: "Precedence must be a whole number from 1 to 999" };
  }
  return { value: n };
}

// ---------------------------------------------------------------- coverage

export function normalizeCoverage(raw: unknown): CoverageResponse {
  const r = obj(raw);
  return {
    days: toNumber(r.days, 7),
    events: toNumber(r.events),
    ledger_rows: toNumber(r.ledger_rows),
    ledger_without_event: toNumber(r.ledger_without_event),
    use_case_source: countMap(r.use_case_source),
    role_source: countMap(r.role_source),
    unknown_use_case_events: toNumber(r.unknown_use_case_events),
    null_actor_events: toNumber(r.null_actor_events),
    by_use_case: (Array.isArray(r.by_use_case) ? r.by_use_case : [])
      .map((x) => {
        const o = obj(x);
        return { use_case: String(o.use_case ?? "unknown"), events: toNumber(o.events), credits: toNumber(o.credits) };
      })
      .sort((a, b) => b.credits - a.credits || b.events - a.events || a.use_case.localeCompare(b.use_case)),
  };
}

/** Share as a 0-100 number, or null when there is nothing to divide by. */
export function pct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** "97.3%" (one decimal under 100, never rounds a gap up to "100%"), or an em dash for null. */
export function formatPct(p: number | null): string {
  if (p === null) return "—";
  if (p >= 100) return "100%";
  const floored = Math.floor(p * 10) / 10;
  return `${floored.toFixed(1)}%`;
}

export function formatCredits(n: number): string {
  const abs = Math.abs(n);
  const digits = abs !== 0 && abs < 10 ? 2 : abs < 1000 ? 1 : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export type Tone = "ok" | "warn" | "error" | "off";

export interface CoverageStats {
  knownUseCasePct: number | null;
  resolvedRolePct: number | null;
  /** Ledger usage rows with an event, as a share of all ledger usage rows. */
  ledgerCoveredPct: number | null;
  unresolvedRoles: number;
  tone: Tone;
}

/**
 * Headline numbers for the coverage card. "Resolved role" counts every event whose
 * role_source is not UNRESOLVED (a SYSTEM job's CATALOG_DEFAULT counts as resolved).
 */
export function coverageStats(c: CoverageResponse): CoverageStats {
  const unresolved = c.role_source.UNRESOLVED ?? 0;
  const knownUseCasePct = pct(c.events - c.unknown_use_case_events, c.events);
  const resolvedRolePct = pct(c.events - unresolved, c.events);
  const ledgerCoveredPct = pct(c.ledger_rows - c.ledger_without_event, c.ledger_rows);
  let tone: Tone = "off";
  if (c.events > 0 || c.ledger_rows > 0) {
    if (c.ledger_rows > 0 && c.events === 0) tone = "error";
    else if (c.ledger_without_event > 0 || c.unknown_use_case_events > 0) tone = "warn";
    else tone = "ok";
  }
  return { knownUseCasePct, resolvedRolePct, ledgerCoveredPct, unresolvedRoles: unresolved, tone };
}

/** A count map as rows, biggest first, for the small source breakdowns. */
export function sourceRows(m: Record<string, number>): { key: string; count: number; share: number | null }[] {
  const total = Object.values(m).reduce((s, v) => s + v, 0);
  return Object.entries(m)
    .map(([key, count]) => ({ key, count, share: pct(count, total) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------- parity

export function normalizeParity(raw: unknown): ParityRow[] {
  const list = obj(raw).rows;
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => {
      const o = obj(x);
      return {
        day: String(o.day ?? ""),
        ledger_rows: toNumber(o.ledger_rows),
        ledger_credits: toNumber(o.ledger_credits),
        event_rows: toNumber(o.event_rows),
        event_credits: toNumber(o.event_credits),
        missing_events: toNumber(o.missing_events),
      };
    })
    .filter((r) => r.day !== "")
    // Newest day first: today's gap is the one someone acts on.
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Credits are compared to 4 decimals (the ledger's NUMERIC scale). */
export function creditDiff(row: ParityRow): number {
  return Math.round((row.ledger_credits - row.event_credits) * 10_000) / 10_000;
}

export function parityTone(row: ParityRow): Tone {
  if (row.ledger_rows === 0 && row.event_rows === 0) return "off";
  if (row.missing_events > 0 && row.event_rows === 0) return "error";
  if (row.missing_events > 0 || creditDiff(row) !== 0) return "warn";
  return "ok";
}

export function parityTotals(rows: ParityRow[]) {
  return rows.reduce(
    (t, r) => ({
      ledger_rows: t.ledger_rows + r.ledger_rows,
      ledger_credits: t.ledger_credits + r.ledger_credits,
      event_rows: t.event_rows + r.event_rows,
      event_credits: t.event_credits + r.event_credits,
      missing_events: t.missing_events + r.missing_events,
    }),
    { ledger_rows: 0, ledger_credits: 0, event_rows: 0, event_credits: 0, missing_events: 0 }
  );
}

// ---------------------------------------------------------------- History v2 rollout list

export interface InstituteList {
  ids: string[];
  /** "*" is in the list: every institute has History v2. */
  all: boolean;
  /** The stored value is not a JSON array of strings; the helper refuses to overwrite it. */
  error: string | null;
}

/**
 * Read the setting's value. It is stored as a JSON string (the settings API keeps
 * JSON-valued settings as text), but an already-decoded array is accepted too.
 */
export function parseInstituteList(value: unknown): InstituteList {
  let parsed: unknown = value;
  if (value === null || value === undefined) return { ids: [], all: false, error: null };
  if (typeof value === "string") {
    if (value.trim() === "") return { ids: [], all: false, error: null };
    try {
      parsed = JSON.parse(value);
    } catch {
      return { ids: [], all: false, error: "The stored value is not valid JSON" };
    }
  }
  if (!Array.isArray(parsed)) return { ids: [], all: false, error: "The stored value is not a JSON array" };
  if (!parsed.every((x) => typeof x === "string")) {
    return { ids: [], all: false, error: "The stored array holds something other than institute ids" };
  }
  const ids: string[] = [];
  for (const raw of parsed as string[]) {
    const id = raw.trim();
    if (id !== "" && !ids.includes(id)) ids.push(id);
  }
  return { ids, all: ids.includes("*"), error: null };
}

/** Institute ids are UUIDs on prod; accept any 1-64 char id without spaces or quotes, or "*". */
export function validateInstituteId(raw: string): string | null {
  const id = raw.trim();
  if (id === "") return "Enter an institute id";
  if (id === "*") return null;
  if (id.length > 64) return "Institute ids are at most 64 characters";
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return "Institute ids are letters, digits, '-' and '_' only";
  return null;
}

export function addInstitute(ids: string[], raw: string): string[] {
  const id = raw.trim();
  return ids.includes(id) ? ids : [...ids, id];
}

export function removeInstitute(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * The value to PUT back. A "string"-typed setting takes the JSON text; any other type
 * (a future native JSON type) takes the array itself.
 */
export function serializeInstituteList(settingType: string | undefined, ids: string[]): string | string[] {
  return settingType === "string" || settingType === undefined ? JSON.stringify(ids) : ids;
}
