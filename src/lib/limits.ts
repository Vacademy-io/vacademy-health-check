// Pure helpers for the AI limits screens (LimitsOverviewPage + the institute
// "AI limits" tab). No React and no "@/" imports, so `node --test tests/` can
// run them directly (see tests/limits.test.ts).
import { formatCredits, normalizeRoleName, toNumber, type Tone } from "./metering.ts";
import type { AiSettingEntry } from "../types/ai-settings";
import type {
  InstituteLimits,
  LimitMetric,
  LimitOrigin,
  LimitPeriod,
  LimitRow,
  LimitRowCreate,
  LimitRowPatch,
  LimitScopeKind,
  LimitSubjectKind,
  LimitUsageMeter,
  LimitsMode,
  LimitsOverview,
  LimitsOverviewRow,
  LimitsPolicy,
  LimitsPolicyPut,
} from "../types/limits";
import type { UseCaseCatalogRow } from "../types/metering";

/** Platform setting (ai_platform_settings): false makes every ENFORCE policy behave as SHADOW. */
export const ENFORCE_SETTING_KEY = "metering.limits.enforce";
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const LIMITS_MODES: readonly LimitsMode[] = ["OFF", "SHADOW", "ENFORCE"];
export const SUBJECT_KINDS: readonly LimitSubjectKind[] = ["INSTITUTE", "ROLE_CLASS", "ROLE", "USER"];
export const SCOPE_KINDS: readonly LimitScopeKind[] = ["ALL", "GROUP", "USE_CASE"];
/** Periods a new row may use. PLAN_PERIOD exists in the schema but stays unused until AI plans ship. */
export const ROW_PERIODS: readonly LimitPeriod[] = ["DAY", "WEEK", "MONTH"];
export const USAGE_PERIODS: readonly LimitPeriod[] = ["DAY", "WEEK", "MONTH"];
export const METRICS: readonly LimitMetric[] = ["CREDITS", "COUNT", "COST_USD"];
export const ORIGINS: readonly LimitOrigin[] = ["PLATFORM", "TENANT"];
/** Role classes a ROLE_CLASS row can name. SYSTEM covers scheduled / on-behalf work (analytics, reports, AI calls). */
export const LIMIT_ROLE_CLASSES: readonly string[] = ["ADMIN", "TEACHER", "STAFF", "PARENT", "LEARNER", "SYSTEM"];

/** NUMERIC(14,4) holds up to 10^10 - 0.0001. */
export const MAX_LIMIT = 9_999_999_999;

export const MODE_LABEL: Record<LimitsMode, string> = { OFF: "Off", SHADOW: "Shadow", ENFORCE: "Enforce" };
export const MODE_HINT: Record<LimitsMode, string> = {
  OFF: "Nothing is counted against a cap and nothing is blocked (today's behaviour).",
  SHADOW: "Counts usage and logs what would have been blocked; every call still goes through.",
  ENFORCE: "Refuses AI calls with 429 AI_USAGE_LIMIT once a hard limit is reached.",
};
export const SUBJECT_LABEL: Record<LimitSubjectKind, string> = {
  INSTITUTE: "Whole institute",
  ROLE_CLASS: "Role class",
  ROLE: "Role",
  USER: "One user",
};
export const SCOPE_LABEL: Record<LimitScopeKind, string> = { ALL: "All AI", GROUP: "Feature group", USE_CASE: "Use case" };
export const PERIOD_LABEL: Record<string, string> = { DAY: "Day", WEEK: "Week", MONTH: "Month", PLAN_PERIOD: "Plan period" };
export const METRIC_LABEL: Record<LimitMetric, string> = { CREDITS: "Credits", COUNT: "Requests", COST_USD: "Cost (USD)" };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = toNumber(v, Number.NaN);
  return Number.isNaN(n) ? null : n;
};
const includes = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function isLimitsMode(v: unknown): v is LimitsMode {
  return includes(LIMITS_MODES, v);
}

// ---------------------------------------------------------------- normalisers

export function defaultPolicy(): LimitsPolicy {
  return {
    mode: "OFF",
    tenant_may_enforce: false,
    timezone: DEFAULT_TIMEZONE,
    notify_admins_on_soft: true,
    show_numbers_to_learners: false,
    updated_by: null,
    updated_at: null,
    reason: null,
    is_default: true,
  };
}

/** A policy object, or null / {} for "no policy row" (the OFF default). */
export function normalizePolicy(raw: unknown): LimitsPolicy {
  const p = obj(raw);
  if (Object.keys(p).length === 0) return defaultPolicy();
  const d = defaultPolicy();
  const mode = typeof p.mode === "string" && p.mode !== "" ? p.mode.toUpperCase() : d.mode;
  return {
    mode,
    tenant_may_enforce: bool(p.tenant_may_enforce, d.tenant_may_enforce),
    timezone: str(p.timezone) ?? d.timezone,
    notify_admins_on_soft: bool(p.notify_admins_on_soft, d.notify_admins_on_soft),
    show_numbers_to_learners: bool(p.show_numbers_to_learners, d.show_numbers_to_learners),
    updated_by: str(p.updated_by),
    updated_at: str(p.updated_at),
    reason: str(p.reason),
    // ai-service says `exists`; otherwise a policy without updated_at was never saved.
    is_default:
      typeof p.exists === "boolean"
        ? !p.exists
        : typeof p.is_default === "boolean"
          ? p.is_default
          : p.updated_at == null && p.updated_by == null,
  };
}

export function normalizeRow(raw: unknown): LimitRow | null {
  const r = obj(raw);
  const id = r.id == null ? null : String(r.id);
  if (!id) return null;
  return {
    id,
    subject_kind: typeof r.subject_kind === "string" ? r.subject_kind.toUpperCase() : "INSTITUTE",
    subject_value: str(r.subject_value),
    subject_label: str(r.subject_label),
    per_member: bool(r.per_member, true),
    scope_kind: typeof r.scope_kind === "string" ? r.scope_kind.toUpperCase() : "ALL",
    scope_value: str(r.scope_value),
    scope_label: str(r.scope_label),
    period: typeof r.period === "string" ? r.period.toUpperCase() : "DAY",
    metric: typeof r.metric === "string" ? r.metric.toUpperCase() : "CREDITS",
    soft_limit: numOrNull(r.soft_limit),
    hard_limit: numOrNull(r.hard_limit),
    origin: typeof r.origin === "string" ? r.origin.toUpperCase() : "TENANT",
    locked: bool(r.locked, false),
    is_active: bool(r.is_active, true),
    reason: str(r.reason),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

/** A bare array, or {rows} / {items}; rows without an id are dropped. */
export function normalizeRows(raw: unknown): LimitRow[] {
  const list = Array.isArray(raw) ? raw : (obj(raw).rows ?? obj(raw).items);
  if (!Array.isArray(list)) return [];
  return list.map(normalizeRow).filter((r): r is LimitRow => r !== null);
}

/** GET /{institute_id}/rows: a bare array, {rows}, or {rows, platform_rows}. */
export function normalizeAllRows(raw: unknown): LimitRow[] {
  const all = [...normalizeRows(raw), ...normalizeRows(obj(raw).platform_rows)];
  const { tenant, platform } = splitRows(all);
  return [...platform, ...tenant];
}

/**
 * Splits rows by origin. A PLATFORM row in the tenant list (or the reverse) is moved,
 * and a row present in both lists is kept once.
 */
export function splitRows(rows: LimitRow[]): { tenant: LimitRow[]; platform: LimitRow[] } {
  const seen = new Set<string>();
  const tenant: LimitRow[] = [];
  const platform: LimitRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    (r.origin === "PLATFORM" ? platform : tenant).push(r);
  }
  return { tenant: sortRows(tenant), platform: sortRows(platform) };
}

const SUBJECT_ORDER: Record<string, number> = { INSTITUTE: 0, ROLE_CLASS: 1, ROLE: 2, USER: 3 };
const SCOPE_ORDER: Record<string, number> = { ALL: 0, GROUP: 1, USE_CASE: 2 };
const PERIOD_ORDER: Record<string, number> = { DAY: 0, WEEK: 1, MONTH: 2, PLAN_PERIOD: 3 };

/** Active first, then subject (institute → user), scope (all → use case), period (day → month). */
export function sortRows(rows: LimitRow[]): LimitRow[] {
  const o = (m: Record<string, number>, k: string) => m[k] ?? 9;
  return [...rows].sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      o(SUBJECT_ORDER, a.subject_kind) - o(SUBJECT_ORDER, b.subject_kind) ||
      (a.subject_value ?? "").localeCompare(b.subject_value ?? "") ||
      o(SCOPE_ORDER, a.scope_kind) - o(SCOPE_ORDER, b.scope_kind) ||
      (a.scope_value ?? "").localeCompare(b.scope_value ?? "") ||
      o(PERIOD_ORDER, a.period) - o(PERIOD_ORDER, b.period) ||
      a.metric.localeCompare(b.metric)
  );
}

function boolOrNull(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/**
 * GET /{institute_id}/policy. Accepts the tenant-style envelope {policy, rows, platform_rows,
 * enforce_globally_enabled} or a bare policy object (rows then come from GET /{institute_id}/rows).
 */
export function normalizeInstituteLimits(raw: unknown): InstituteLimits {
  const r = obj(raw);
  const hasEnvelope = "policy" in r || "rows" in r || "platform_rows" in r;
  const policy = normalizePolicy(hasEnvelope ? r.policy : r);
  const { tenant, platform } = splitRows([...normalizeRows(r.rows), ...normalizeRows(r.platform_rows)]);
  return {
    policy,
    rows: tenant,
    platform_rows: platform,
    enforce_globally_enabled: boolOrNull(r.enforce_globally_enabled),
  };
}

const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : toNumber(v));

/** GET /overview: a bare array or {institutes}; sorted by blocked, then would-block, then name. */
export function normalizeOverview(raw: unknown): LimitsOverviewRow[] {
  const list = Array.isArray(raw) ? raw : (obj(raw).institutes ?? obj(raw).rows);
  if (!Array.isArray(list)) return [];
  const out: LimitsOverviewRow[] = [];
  for (const item of list) {
    const r = obj(item);
    const id = str(r.institute_id);
    if (!id) continue;
    out.push({
      institute_id: id,
      institute_name: str(r.institute_name),
      mode: typeof r.mode === "string" && r.mode ? r.mode.toUpperCase() : "OFF",
      tenant_may_enforce: bool(r.tenant_may_enforce, false),
      rows: countOf(r.rows),
      platform_rows: countOf(r.platform_rows),
      would_block_7d: toNumber(r.would_block_7d),
      blocked_7d: toNumber(r.blocked_7d),
      overrun_7d: toNumber(r.overrun_7d),
    });
  }
  return out.sort(
    (a, b) =>
      b.blocked_7d - a.blocked_7d ||
      b.would_block_7d - a.would_block_7d ||
      (a.institute_name ?? a.institute_id).localeCompare(b.institute_name ?? b.institute_id)
  );
}

/** GET /overview envelope: {institutes, enforce_globally_enabled}, or a bare list. */
export function normalizeOverviewResponse(raw: unknown): LimitsOverview {
  return { institutes: normalizeOverview(raw), enforce_globally_enabled: boolOrNull(obj(raw).enforce_globally_enabled) };
}

export interface OverviewTotals {
  institutes: number;
  byMode: Record<string, number>;
  tenantMayEnforce: number;
  would_block_7d: number;
  blocked_7d: number;
  overrun_7d: number;
}

export function overviewTotals(rows: LimitsOverviewRow[]): OverviewTotals {
  const t: OverviewTotals = { institutes: rows.length, byMode: {}, tenantMayEnforce: 0, would_block_7d: 0, blocked_7d: 0, overrun_7d: 0 };
  for (const r of rows) {
    t.byMode[r.mode] = (t.byMode[r.mode] ?? 0) + 1;
    if (r.tenant_may_enforce) t.tenantMayEnforce += 1;
    t.would_block_7d += r.would_block_7d;
    t.blocked_7d += r.blocked_7d;
    t.overrun_7d += r.overrun_7d;
  }
  return t;
}

/** GET /{institute_id}/usage: a bare array or {usage} / {counters} / {meters}. */
export function normalizeUsage(raw: unknown): LimitUsageMeter[] {
  const r = obj(raw);
  const list = Array.isArray(raw) ? raw : (r.usage ?? r.counters ?? r.meters ?? r.rows);
  if (!Array.isArray(list)) return [];
  const out: LimitUsageMeter[] = [];
  for (const item of list) {
    const m = obj(item);
    const key = str(m.key) ?? str(m.counter_key);
    if (!key) continue;
    out.push({
      key,
      label: str(m.label) ?? key,
      period: typeof m.period === "string" ? m.period.toUpperCase() : "DAY",
      credits_used: toNumber(m.credits_used),
      count_used: toNumber(m.count_used),
      cost_usd: numOrNull(m.cost_usd),
      soft: numOrNull(m.soft),
      hard: numOrNull(m.hard),
      metric: typeof m.metric === "string" && m.metric ? m.metric.toUpperCase() : null,
      pct: numOrNull(m.pct),
      window_start: str(m.window_start),
    });
  }
  return out.sort((a, b) => (meterPct(b) ?? -1) - (meterPct(a) ?? -1) || a.label.localeCompare(b.label));
}

/** What the binding row counts: credits, requests or vendor dollars. */
export function meterUsed(m: LimitUsageMeter): number {
  if (m.metric === "COUNT") return m.count_used;
  if (m.metric === "COST_USD") return m.cost_usd ?? 0;
  return m.credits_used;
}

/** Percentage of the hard limit used: the server's figure, else used / hard in the row's metric. */
export function meterPct(m: LimitUsageMeter): number | null {
  if (m.pct !== null) return Math.max(0, m.pct);
  if (m.hard === null) return null;
  const used = meterUsed(m);
  if (m.hard === 0) return used > 0 ? 100 : 0;
  return Math.max(0, (used / m.hard) * 100);
}

/** Where the soft limit sits on the bar (0-100), or null. */
export function softMarkPct(m: LimitUsageMeter): number | null {
  if (m.soft === null || m.hard === null || m.hard <= 0) return null;
  return Math.max(0, Math.min(100, (m.soft / m.hard) * 100));
}

export function meterTone(m: LimitUsageMeter): Tone {
  const p = meterPct(m);
  if (p === null) return m.soft !== null && meterUsed(m) >= m.soft ? "warn" : "off";
  if (p >= 100) return "error";
  const soft = softMarkPct(m);
  if (soft !== null && p >= soft) return "warn";
  return "ok";
}

// ---------------------------------------------------------------- global switch

/** metering.limits.enforce from the AI settings list: what the answering replica resolves, else the stored value. */
export function enforceSettingValue(entry: AiSettingEntry | null | undefined): boolean | null {
  if (!entry) return null;
  return boolOrNull(entry.effective) ?? boolOrNull(entry.value) ?? boolOrNull(entry.default);
}

/** The policy response's flag wins (it is what ai-service applies); the setting is the fallback; default on. */
export function resolveGlobalEnforce(
  fromPolicy: boolean | null,
  fromSetting: boolean | null
): { enabled: boolean; known: boolean } {
  if (fromPolicy !== null) return { enabled: fromPolicy, known: true };
  if (fromSetting !== null) return { enabled: fromSetting, known: true };
  return { enabled: true, known: false };
}

/** What a policy mode does right now: ENFORCE acts as SHADOW while the global switch is off. */
export function effectiveMode(mode: string, globalEnforce: boolean): LimitsMode | string {
  return mode === "ENFORCE" && !globalEnforce ? "SHADOW" : mode;
}

// ---------------------------------------------------------------- labels

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** ai-service's subject_label already says "Each teacher" / "All teachers together"; this is the fallback. */
export function describeSubject(row: Pick<LimitRow, "subject_kind" | "subject_value" | "subject_label" | "per_member">): string {
  if (row.subject_label) return row.subject_label;
  const pool = row.per_member ? "each member" : "pooled";
  const base = (() => {
    switch (row.subject_kind) {
      case "INSTITUTE":
        return "Whole institute";
      case "ROLE_CLASS":
        return `${titleCase(row.subject_value ?? "?")} (class)`;
      case "ROLE":
        return `Role ${row.subject_value ?? "?"}`;
      case "USER":
        return `User ${row.subject_value ?? "?"}`;
      default:
        return `${row.subject_kind} ${row.subject_value ?? ""}`.trim();
    }
  })();
  if (row.subject_kind === "ROLE_CLASS" || row.subject_kind === "ROLE") return `${base} · ${pool}`;
  if (row.subject_kind === "INSTITUTE") return `${base} · pooled`;
  return base;
}

export function describeScope(
  row: Pick<LimitRow, "scope_kind" | "scope_value" | "scope_label">,
  useCaseLabels?: Map<string, string>
): string {
  if (row.scope_label) return row.scope_label;
  switch (row.scope_kind) {
    case "ALL":
      return "All AI";
    case "GROUP":
      return `Group: ${row.scope_value ?? "?"}`;
    case "USE_CASE":
      return useCaseLabels?.get(row.scope_value ?? "") ?? row.scope_value ?? "?";
    default:
      return `${row.scope_kind} ${row.scope_value ?? ""}`.trim();
  }
}

export function metricUnit(metric: string): string {
  return metric === "COUNT" ? "requests" : metric === "COST_USD" ? "USD" : "credits";
}

/** "120 cr", "40 req", "$1.50", or "no cap" for null. */
export function formatLimit(value: number | null, metric: string): string {
  if (value === null) return "no cap";
  if (metric === "COST_USD") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (metric === "COUNT") return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} req`;
  return `${formatCredits(value)} cr`;
}

/** "Every day" style label for the period column. */
export function periodLabel(period: string): string {
  return PERIOD_LABEL[period] ?? period;
}

// ---------------------------------------------------------------- policy form

export interface PolicyDraft {
  mode: LimitsMode;
  tenant_may_enforce: boolean;
  timezone: string;
  notify_admins_on_soft: boolean;
  show_numbers_to_learners: boolean;
}

export function policyDraft(p: LimitsPolicy): PolicyDraft {
  return {
    mode: isLimitsMode(p.mode) ? p.mode : "OFF",
    tenant_may_enforce: p.tenant_may_enforce,
    timezone: p.timezone,
    notify_admins_on_soft: p.notify_admins_on_soft,
    show_numbers_to_learners: p.show_numbers_to_learners,
  };
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.trim() !== tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Builds the PUT body. Saving the untouched default is allowed: it creates the policy row. */
export function buildPolicyPut(
  current: LimitsPolicy,
  draft: PolicyDraft,
  reason: string
): { body: LimitsPolicyPut } | { error: string } {
  if (!isLimitsMode(draft.mode)) return { error: "Pick a mode" };
  const timezone = draft.timezone.trim();
  if (!isValidTimeZone(timezone)) return { error: `"${draft.timezone}" is not a time zone (use an IANA name such as Asia/Kolkata)` };
  const base = policyDraft(current);
  const changed =
    current.is_default ||
    current.mode !== draft.mode ||
    base.tenant_may_enforce !== draft.tenant_may_enforce ||
    base.timezone !== timezone ||
    base.notify_admins_on_soft !== draft.notify_admins_on_soft ||
    base.show_numbers_to_learners !== draft.show_numbers_to_learners;
  if (!changed) return { error: "Nothing changed" };
  const why = reason.trim();
  if (!why) return { error: "Say why (it lands in the change log)" };
  return {
    body: {
      mode: draft.mode,
      tenant_may_enforce: draft.tenant_may_enforce,
      timezone,
      notify_admins_on_soft: draft.notify_admins_on_soft,
      show_numbers_to_learners: draft.show_numbers_to_learners,
      reason: why,
    },
  };
}

// ---------------------------------------------------------------- row form

export interface RowDraft {
  subject_kind: LimitSubjectKind;
  subject_value: string;
  per_member: boolean;
  scope_kind: LimitScopeKind;
  scope_value: string;
  period: LimitPeriod;
  metric: LimitMetric;
  soft_limit: string;
  hard_limit: string;
  origin: LimitOrigin;
  locked: boolean;
}

/** A new row starts as a locked platform cap on the whole institute's AI credits per month. */
export function emptyRowDraft(origin: LimitOrigin = "PLATFORM"): RowDraft {
  return {
    subject_kind: "INSTITUTE",
    subject_value: "",
    per_member: true,
    scope_kind: "ALL",
    scope_value: "",
    period: "MONTH",
    metric: "CREDITS",
    soft_limit: "",
    hard_limit: "",
    origin,
    locked: origin === "PLATFORM",
  };
}

export function rowDraftFromRow(row: LimitRow): RowDraft {
  return {
    subject_kind: includes(SUBJECT_KINDS, row.subject_kind) ? row.subject_kind : "INSTITUTE",
    subject_value: row.subject_value ?? "",
    per_member: row.per_member,
    scope_kind: includes(SCOPE_KINDS, row.scope_kind) ? row.scope_kind : "ALL",
    scope_value: row.scope_value ?? "",
    period: (row.period as LimitPeriod) ?? "DAY",
    metric: includes(METRICS, row.metric) ? row.metric : "CREDITS",
    soft_limit: row.soft_limit === null ? "" : String(row.soft_limit),
    hard_limit: row.hard_limit === null ? "" : String(row.hard_limit),
    origin: row.origin === "PLATFORM" ? "PLATFORM" : "TENANT",
    locked: row.locked,
  };
}

/** Blank = no limit (null). Otherwise a finite number from 0 up to MAX_LIMIT. */
export function parseLimit(text: string, what: string): { value: number | null } | { error: string } {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: `${what} must be a number` };
  if (n < 0) return { error: `${what} cannot be negative` };
  if (n > MAX_LIMIT) return { error: `${what} is too large` };
  return { value: Math.round(n * 10_000) / 10_000 };
}

function checkLimits(draft: Pick<RowDraft, "soft_limit" | "hard_limit">): { soft: number | null; hard: number | null } | { error: string } {
  const soft = parseLimit(draft.soft_limit, "Soft limit");
  if ("error" in soft) return soft;
  const hard = parseLimit(draft.hard_limit, "Hard limit");
  if ("error" in hard) return hard;
  if (soft.value !== null && hard.value !== null && soft.value > hard.value) {
    return { error: "The soft limit must not be above the hard limit" };
  }
  return { soft: soft.value, hard: hard.value };
}

/** The columns the open-row unique index covers; two active rows may not share them. */
export function rowIdentity(r: {
  subject_kind: string;
  subject_value: string | null;
  per_member: boolean;
  scope_kind: string;
  scope_value: string | null;
  period: string;
  metric: string;
  origin: string;
}): string {
  return [r.subject_kind, r.subject_value ?? "", r.per_member, r.scope_kind, r.scope_value ?? "", r.period, r.metric, r.origin].join("|");
}

export interface RowValidationContext {
  /** The institute's active rows (both origins), to refuse a duplicate. */
  existing: LimitRow[];
  /** Use-case catalog, when loaded: a USE_CASE scope must be a known, limit-eligible use case. */
  catalog?: UseCaseCatalogRow[];
}

export function buildRowCreate(draft: RowDraft, reason: string, ctx: RowValidationContext): { body: LimitRowCreate } | { error: string } {
  if (!includes(SUBJECT_KINDS, draft.subject_kind)) return { error: "Pick who the limit applies to" };
  let subjectValue: string | null = null;
  if (draft.subject_kind === "ROLE_CLASS") {
    if (!LIMIT_ROLE_CLASSES.includes(draft.subject_value)) return { error: "Pick a role class" };
    subjectValue = draft.subject_value;
  } else if (draft.subject_kind === "ROLE") {
    subjectValue = normalizeRoleName(draft.subject_value);
    if (!subjectValue) return { error: "Enter the role name" };
  } else if (draft.subject_kind === "USER") {
    subjectValue = draft.subject_value.trim();
    if (!subjectValue) return { error: "Enter the user id" };
    if (subjectValue.length > 255 || /\s/.test(subjectValue)) return { error: "That does not look like a user id" };
  }

  if (!includes(SCOPE_KINDS, draft.scope_kind)) return { error: "Pick what the limit counts" };
  let scopeValue: string | null = null;
  if (draft.scope_kind === "GROUP") {
    scopeValue = draft.scope_value.trim();
    if (!scopeValue) return { error: "Pick a feature group" };
  } else if (draft.scope_kind === "USE_CASE") {
    scopeValue = draft.scope_value.trim();
    if (!scopeValue) return { error: "Pick a use case" };
    if (ctx.catalog && ctx.catalog.length > 0) {
      const uc = ctx.catalog.find((c) => c.use_case === scopeValue);
      if (!uc) return { error: `"${scopeValue}" is not in the use-case catalog` };
      if (!uc.limit_eligible) return { error: `${uc.label} is not limit-eligible, so a limit on it would never apply` };
    }
  }

  if (!includes(ROW_PERIODS, draft.period)) {
    return { error: draft.period === "PLAN_PERIOD" ? "Plan period is reserved for AI plans (not shipped yet)" : "Pick a period" };
  }
  if (!includes(METRICS, draft.metric)) return { error: "Pick a metric" };
  if (!includes(ORIGINS, draft.origin)) return { error: "Pick an origin" };

  const limits = checkLimits(draft);
  if ("error" in limits) return limits;
  // A row with no numbers is only meaningful as an exemption: a tenant USER / ROLE row that lifts a role cap.
  const exemptionAllowed = draft.origin === "TENANT" && (draft.subject_kind === "USER" || draft.subject_kind === "ROLE");
  if (limits.soft === null && limits.hard === null && !exemptionAllowed) {
    return { error: "Set a soft limit, a hard limit or both" };
  }

  const roleRow = draft.subject_kind === "ROLE" || draft.subject_kind === "ROLE_CLASS";
  const body: LimitRowCreate = {
    subject_kind: draft.subject_kind,
    subject_value: subjectValue,
    ...(roleRow ? { per_member: draft.per_member } : {}),
    scope_kind: draft.scope_kind,
    scope_value: scopeValue,
    period: draft.period,
    metric: draft.metric,
    soft_limit: limits.soft,
    hard_limit: limits.hard,
    origin: draft.origin,
    locked: draft.locked,
    reason: reason.trim(),
  };

  // The server's default for per_member is true; compare with what it will store.
  const key = rowIdentity({ ...body, per_member: roleRow ? draft.per_member : true });
  if (ctx.existing.some((r) => r.is_active && rowIdentity(r) === key)) {
    return { error: "An active row with the same subject, scope, period, metric and origin exists — edit that one" };
  }
  if (!body.reason) return { error: "Say why (it lands in the change log)" };
  return { body };
}

/** PATCH body: the soft / hard limit and lock that changed, plus the reason (ai-service patches nothing else). */
export function buildRowPatch(row: LimitRow, draft: RowDraft, reason: string): { patch: LimitRowPatch } | { error: string } {
  const limits = checkLimits(draft);
  if ("error" in limits) return limits;
  const patch: LimitRowPatch = { reason: reason.trim() };
  if (limits.soft !== row.soft_limit) patch.soft_limit = limits.soft;
  if (limits.hard !== row.hard_limit) patch.hard_limit = limits.hard;
  if (draft.locked !== row.locked) patch.locked = draft.locked;
  if (Object.keys(patch).length === 1) return { error: "Nothing changed" };
  // Same rule as ai-service check_soft_hard: only USER / ROLE rows may carry no numbers (an exemption).
  if (limits.soft === null && limits.hard === null && row.subject_kind !== "USER" && row.subject_kind !== "ROLE") {
    return { error: "Set a soft limit, a hard limit or both (or remove the row)" };
  }
  if (!patch.reason) return { error: "Say why (it lands in the change log)" };
  return { patch };
}
