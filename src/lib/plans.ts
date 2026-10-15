// Pure helpers for the AI plans screens (Plans, plan detail / version editor, Subscriptions,
// Plan P&L, Simulate, and the institute "AI plan" tab). No React and no "@/" imports, so
// `node --test tests/` can run them directly (see tests/plans.test.ts).
import { toNumber } from "./metering.ts";
import type { AiSettingEntry } from "../types/ai-settings";
import type {
  BillingFeature,
  CapBasis,
  Enforcement,
  FeatureEligibility,
  GraceBehaviour,
  ItemMode,
  ModelPolicy,
  OverrideCreate,
  PaymentStatus,
  Plan,
  PlanCreate,
  PlanItem,
  PlanItemPut,
  PlanVersion,
  PnlResponse,
  PnlRow,
  SimulationResult,
  SimulationRow,
  Subscription,
  SubscriptionCreate,
  SubscriptionEvent,
  SubscriptionOverride,
  SubscriptionPeriod,
  SubscriptionStatus,
  VersionStatus,
  VersionTermsPatch,
  ViolationAction,
} from "../types/plans";

// ---------------------------------------------------------------- vocabulary

/** Platform setting (ai_platform_settings): false = no plan logic runs anywhere (charged as today). */
export const PLANS_ENABLED_SETTING_KEY = "billing.plans.enabled";
/** Platform setting: the rupee rate used to turn vendor USD cost into INR for P&L. */
export const INR_PER_USD_SETTING_KEY = "billing.inr_per_usd";
export const DEFAULT_INR_PER_USD = 86;

export const ELIGIBILITIES: readonly FeatureEligibility[] = ["INCLUDABLE", "ALLOWANCE_ONLY", "ALWAYS_CHARGED"];
export const ITEM_MODES: readonly ItemMode[] = ["INCLUDED", "ALLOWANCE", "CHARGED"];
export const MODEL_POLICIES: readonly ModelPolicy[] = ["DEFAULT_CHAIN", "ANY", "ALLOWLIST", "MAX_PRICE"];
export const VIOLATION_ACTIONS: readonly ViolationAction[] = ["CHARGE", "BLOCK"];
export const CAP_BASES: readonly CapBasis[] = ["ACTOR", "SUBJECT"];
export const GRACE_BEHAVIOURS: readonly GraceBehaviour[] = ["CHARGED", "INCLUDED"];
export const VERSION_STATUSES: readonly VersionStatus[] = ["DRAFT", "PUBLISHED", "RETIRED"];
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = ["SCHEDULED", "TRIAL", "ACTIVE", "GRACE", "EXPIRED", "CANCELLED"];
/** At most one subscription per institute may be in one of these (DB partial unique index ux_ias_live). */
export const LIVE_STATUSES: readonly SubscriptionStatus[] = ["TRIAL", "ACTIVE", "GRACE"];
export const ENFORCEMENTS: readonly Enforcement[] = ["SHADOW", "LIVE"];
/** v1 assigns by hand only; PAYMENT arrives with the Razorpay phase. */
export const ASSIGN_SOURCES: readonly ("MANUAL" | "COMPLIMENTARY")[] = ["MANUAL", "COMPLIMENTARY"];
export const PERIOD_MONTH_OPTIONS: readonly number[] = [1, 3, 6, 12];
export const SIMULATE_DAY_OPTIONS: readonly number[] = [30, 60, 90];
/** Role classes a plan item can include (critique C6: role classes, STUDENT maps to LEARNER). */
export const PLAN_ROLE_CLASSES: readonly string[] = ["ADMIN", "TEACHER", "STAFF", "PARENT", "LEARNER", "SYSTEM", "API_KEY", "PUBLIC"];
/** Features the voice-bot domain owns: always charged, and locked at the platform level. */
export const VOICE_FEATURES: readonly string[] = ["ai_calling", "telephony"];

export const ELIGIBILITY_LABEL: Record<FeatureEligibility, string> = {
  INCLUDABLE: "Can be included",
  ALLOWANCE_ONLY: "Allowance only",
  ALWAYS_CHARGED: "Always charged",
};
export const ELIGIBILITY_HINT: Record<FeatureEligibility, string> = {
  INCLUDABLE: "A plan may include it (fair use), pay it from the allowance, or charge it.",
  ALLOWANCE_ONLY: "A plan may pay it from the monthly allowance, never include it outright.",
  ALWAYS_CHARGED: "Always charged from the wallet, whatever the plan says.",
};
export const MODE_LABEL: Record<ItemMode, string> = {
  INCLUDED: "Included",
  ALLOWANCE: "From allowance",
  CHARGED: "Charged",
};
export const MODE_HINT: Record<ItemMode, string> = {
  INCLUDED: "Free to the institute up to the fair-use caps; past a cap it is charged from credits.",
  ALLOWANCE: "Paid from the plan's monthly allowance, then from the wallet once the allowance runs out.",
  CHARGED: "Charged from the wallet exactly as today.",
};
export const POLICY_LABEL: Record<ModelPolicy, string> = {
  DEFAULT_CHAIN: "Default models only",
  ANY: "Any model",
  ALLOWLIST: "Allow-listed models",
  MAX_PRICE: "Up to a price",
};
export const POLICY_HINT: Record<ModelPolicy, string> = {
  DEFAULT_CHAIN: "Included only when the feature's default model ran. A fallback model or a model the user picked is charged.",
  ANY: "Included whatever model ran (the user's own pick counts too).",
  ALLOWLIST: "Included only for the model ids listed.",
  MAX_PRICE: "Included only for models whose output price is at or below the limit (USD per 1M tokens).",
};
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  RETIRED: "Retired",
  SCHEDULED: "Scheduled",
  TRIAL: "Trial",
  ACTIVE: "Active",
  GRACE: "Grace",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};
export const ENFORCEMENT_LABEL: Record<Enforcement, string> = { SHADOW: "Shadow", LIVE: "Live" };
export const ENFORCEMENT_HINT: Record<Enforcement, string> = {
  SHADOW:
    "Charged exactly as today. Each AI use only records what the plan would have done (shadow_billing_mode), so you can compare before going live. Nothing is reserved and no allowance is used.",
  LIVE:
    "The plan decides who pays: included uses cost the institute nothing, allowance uses draw down the plan allowance, everything else is charged from the wallet. Fair-use caps and the internal cost cap apply.",
};
export const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", COMPLIMENTARY: "Complimentary", PAYMENT: "Payment" };
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { DUE: "Due", PAID: "Paid", COMPLIMENTARY: "Complimentary", WAIVED: "Waived" };
export const VIOLATION_LABEL: Record<ViolationAction, string> = { CHARGE: "Charge", BLOCK: "Block (pre-check)" };
export const BASIS_LABEL: Record<CapBasis, string> = { ACTOR: "Who triggered it", SUBJECT: "Who it is about" };
export const GRACE_LABEL: Record<GraceBehaviour, string> = { CHARGED: "Charge from wallet", INCLUDED: "Keep plan benefits" };

export const EVENT_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  CREATED: "Assigned",
  ACTIVATED: "Activated",
  RENEWED: "Renewed",
  PERIOD_ROLLED: "New period",
  PLAN_CHANGED: "Plan changed",
  PENDING_PLAN_SET: "Plan change scheduled",
  PLAN_CHANGE_SCHEDULED: "Plan change at renewal",
  PERIOD_CREATED: "New period",
  GRACE_STARTED: "Entered grace",
  GRACE_CLEARED: "Left grace",
  ENFORCEMENT_CHANGED: "Enforcement changed",
  UPDATED: "Updated",
  GRACE: "Entered grace",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  CANCEL_SCHEDULED: "Cancel at period end",
  OVERRIDE_SET: "Override added",
  OVERRIDE_ADDED: "Override added",
  OVERRIDE_REMOVED: "Override removed",
  CAP_HIT: "Fair-use cap reached",
};

// ---------------------------------------------------------------- small parsers

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = toNumber(v, Number.NaN);
  return Number.isNaN(n) ? null : n;
};
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n === null ? null : Math.trunc(n);
};
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const strListOrNull = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const l = strList(v);
  return l.length > 0 ? l : null;
};
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const jsonObjOrNull = (v: unknown): Record<string, unknown> | null => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      return obj(JSON.parse(v));
    } catch {
      return null;
    }
  }
  return null;
};

/** A list response may be a bare array or wrapped as { <key>: [...] } / { items: [...] }. */
export function listOf(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = obj(raw);
  for (const k of [...keys, "items", "rows", "data", "results"]) {
    if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  return [];
}

// ---------------------------------------------------------------- normalisers

export function normalizeFeature(raw: unknown): BillingFeature {
  const r = obj(raw);
  const key = str(r.feature_key) ?? str(r.key) ?? "";
  return {
    feature_key: key,
    label: str(r.label) ?? key,
    description: str(r.description),
    eligibility: pick(ELIGIBILITIES, r.eligibility, "ALWAYS_CHARGED"),
    locked: bool(r.locked, false),
    display_order: toNumber(r.display_order, 100),
    is_active: bool(r.is_active, true),
    use_cases: Array.isArray(r.use_cases)
      ? r.use_cases.map((u) => (typeof u === "string" ? u : str(obj(u).use_case))).filter((u): u is string => !!u)
      : [],
    updated_by: str(r.updated_by),
    updated_at: str(r.updated_at),
  };
}

/** Sorted by display_order then label; rows without a key are dropped. */
export function normalizeFeatures(raw: unknown): BillingFeature[] {
  return listOf(raw, "features")
    .map(normalizeFeature)
    .filter((f) => f.feature_key !== "")
    .sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
}

export function defaultItem(featureKey: string): PlanItem {
  return {
    id: null,
    feature_key: featureKey,
    mode: "CHARGED",
    model_policy: "DEFAULT_CHAIN",
    model_allowlist: null,
    max_output_price_per_1m: null,
    on_model_violation: "CHARGE",
    roles_included: null,
    inst_units_cap: null,
    inst_credits_cap: null,
    inst_cost_usd_cap: null,
    user_units_cap: null,
    user_credits_cap: null,
    user_cap_basis: "ACTOR",
    over_cap_action: "CHARGE",
    display_cap_text: null,
  };
}

export function normalizeItem(raw: unknown): PlanItem {
  const r = obj(raw);
  const base = defaultItem(str(r.feature_key) ?? "");
  return {
    ...base,
    id: str(r.id),
    mode: pick(ITEM_MODES, r.mode, "CHARGED"),
    model_policy: pick(MODEL_POLICIES, r.model_policy, "DEFAULT_CHAIN"),
    model_allowlist: strListOrNull(r.model_allowlist),
    max_output_price_per_1m: numOrNull(r.max_output_price_per_1m),
    on_model_violation: pick(VIOLATION_ACTIONS, r.on_model_violation, "CHARGE"),
    roles_included: strListOrNull(r.roles_included),
    inst_units_cap: numOrNull(r.inst_units_cap),
    inst_credits_cap: numOrNull(r.inst_credits_cap),
    inst_cost_usd_cap: numOrNull(r.inst_cost_usd_cap),
    user_units_cap: numOrNull(r.user_units_cap),
    user_credits_cap: numOrNull(r.user_credits_cap),
    user_cap_basis: pick(CAP_BASES, r.user_cap_basis, "ACTOR"),
    over_cap_action: pick(VIOLATION_ACTIONS, r.over_cap_action, "CHARGE"),
    display_cap_text: str(r.display_cap_text),
  };
}

export function normalizeVersion(raw: unknown, planId = ""): PlanVersion {
  const r = obj(raw);
  return {
    id: str(r.id) ?? "",
    plan_id: str(r.plan_id) ?? planId,
    version_no: toNumber(r.version_no ?? r.version, 0),
    status: pick(VERSION_STATUSES, r.status, "DRAFT"),
    currency: str(r.currency) ?? "INR",
    price_minor: toNumber(r.price_minor, 0),
    is_tax_inclusive: bool(r.is_tax_inclusive, false),
    sac_code: str(r.sac_code),
    period_months: toNumber(r.period_months, 1) || 1,
    allowance_credits: toNumber(r.allowance_credits, 0),
    internal_cost_cap_usd: numOrNull(r.internal_cost_cap_usd),
    grace_days: toNumber(r.grace_days, 7),
    grace_behaviour: pick(GRACE_BEHAVIOURS, r.grace_behaviour, "CHARGED"),
    supersedes_version_id: str(r.supersedes_version_id),
    migrate_existing_at_renewal: bool(r.migrate_existing_at_renewal, false),
    published_at: str(r.published_at),
    published_by: str(r.published_by),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    items: listOf(r.items).map(normalizeItem).filter((i) => i.feature_key !== ""),
    subscriber_count: r.subscribers && typeof r.subscribers === "object"
      ? toNumber(obj(r.subscribers).live, 0) + toNumber(obj(r.subscribers).shadow, 0)
      : numOrNull(r.subscriber_count ?? r.subscriptions),
    included_count: numOrNull(r.included_count),
  };
}

/** Newest version first. */
export function sortVersions(versions: PlanVersion[]): PlanVersion[] {
  return [...versions].sort((a, b) => b.version_no - a.version_no);
}

export function normalizePlan(raw: unknown): Plan {
  const wrapped = obj(raw);
  // GET /plans/{id} may answer { plan: {...}, versions: [...] }.
  const r = wrapped.plan && typeof wrapped.plan === "object" ? { ...obj(wrapped.plan), versions: wrapped.versions ?? obj(wrapped.plan).versions } : wrapped;
  const id = str(r.id) ?? "";
  const versions = listOf(r.versions).map((v) => normalizeVersion(v, id));
  // List rows sometimes carry only the latest / live version.
  for (const k of ["latest_version", "published_version", "live_version"]) {
    if (r[k] && typeof r[k] === "object") {
      const v = normalizeVersion(r[k], id);
      if (v.id && !versions.some((x) => x.id === v.id)) versions.push(v);
    }
  }
  return {
    id,
    plan_key: str(r.plan_key) ?? "",
    name: str(r.name) ?? str(r.plan_key) ?? id,
    description: str(r.description),
    is_active: bool(r.is_active, true),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    versions: sortVersions(versions),
    live_subscriptions: numOrNull(obj(r.subscribers).live ?? r.live_subscriptions ?? r.live_count),
    shadow_subscriptions: numOrNull(obj(r.subscribers).shadow ?? r.shadow_subscriptions ?? r.shadow_count),
  };
}

export function normalizePlans(raw: unknown): Plan[] {
  return listOf(raw, "plans")
    .map(normalizePlan)
    .filter((p) => p.id !== "");
}

/** The version subscribers get today: the newest PUBLISHED one. */
export function liveVersion(plan: Pick<Plan, "versions">): PlanVersion | null {
  return sortVersions(plan.versions).find((v) => v.status === "PUBLISHED") ?? null;
}

export function draftVersion(plan: Pick<Plan, "versions">): PlanVersion | null {
  return sortVersions(plan.versions).find((v) => v.status === "DRAFT") ?? null;
}

export function normalizePeriod(raw: unknown): SubscriptionPeriod | null {
  if (!raw || typeof raw !== "object") return null;
  const r = obj(raw);
  return {
    id: str(r.id),
    period_start: str(r.period_start),
    period_end: str(r.period_end),
    plan_version_id: str(r.plan_version_id),
    price_minor_snapshot: numOrNull(r.price_minor_snapshot),
    allowance_credits: toNumber(r.allowance_credits, 0),
    allowance_used: toNumber(r.allowance_used, 0),
    payment_status: str(r.payment_status),
  };
}

export function normalizeSubscription(raw: unknown): Subscription {
  const r = obj(raw);
  const plan = obj(r.plan);
  const version = obj(r.plan_version ?? r.version);
  return {
    id: str(r.id) ?? "",
    institute_id: str(r.institute_id) ?? "",
    institute_name: str(r.institute_name),
    plan_version_id: str(r.plan_version_id) ?? str(version.id) ?? "",
    plan_id: str(r.plan_id) ?? str(plan.id) ?? str(version.plan_id),
    plan_key: str(r.plan_key) ?? str(plan.plan_key),
    plan_name: str(r.plan_name) ?? str(plan.name),
    version_no: intOrNull(r.version_no ?? version.version_no),
    status: str(r.status) ?? "ACTIVE",
    enforcement: pick(ENFORCEMENTS, r.enforcement, "SHADOW"),
    source: str(r.source) ?? "MANUAL",
    anchor_at: str(r.anchor_at),
    start_at: str(r.start_at),
    end_at: str(r.end_at),
    period_months: toNumber(r.period_months, 1) || 1,
    auto_renew: bool(r.auto_renew, true),
    grace_days: toNumber(r.grace_days, 7),
    cancel_at_period_end: bool(r.cancel_at_period_end, false),
    pending_plan_version_id: str(r.pending_plan_version_id),
    price_override_minor: numOrNull(r.price_override_minor),
    version_price_minor: numOrNull(r.price_minor ?? version.price_minor),
    reason: str(r.reason),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    updated_by: str(r.updated_by),
    updated_at: str(r.updated_at),
    current_period: normalizePeriod(r.current_period ?? r.period),
  };
}

export function normalizeSubscriptions(raw: unknown): Subscription[] {
  return listOf(raw, "subscriptions")
    .map(normalizeSubscription)
    .filter((s) => s.id !== "");
}

export function normalizeOverride(raw: unknown): SubscriptionOverride {
  const r = obj(raw);
  return {
    id: str(r.id) ?? "",
    subscription_id: str(r.subscription_id),
    feature_key: str(r.feature_key) ?? "",
    mode: r.mode === null || r.mode === undefined ? null : pick(ITEM_MODES, r.mode, "CHARGED"),
    inst_units_cap: numOrNull(r.inst_units_cap),
    inst_credits_cap: numOrNull(r.inst_credits_cap),
    inst_cost_usd_cap: numOrNull(r.inst_cost_usd_cap),
    user_units_cap: numOrNull(r.user_units_cap),
    user_credits_cap: numOrNull(r.user_credits_cap),
    reason: str(r.reason),
    created_by: str(r.created_by),
    created_at: str(r.created_at),
    is_active: bool(r.is_active, true),
  };
}

export function normalizeOverrides(raw: unknown): SubscriptionOverride[] {
  return listOf(raw, "overrides")
    .map(normalizeOverride)
    .filter((o) => o.id !== "");
}

export function normalizeEvent(raw: unknown): SubscriptionEvent {
  const r = obj(raw);
  return {
    id: str(r.id) ?? "",
    subscription_id: str(r.subscription_id),
    institute_id: str(r.institute_id),
    event_type: str(r.event_type) ?? "UPDATED",
    from_state: jsonObjOrNull(r.from_state),
    to_state: jsonObjOrNull(r.to_state),
    actor: str(r.actor),
    reason: str(r.reason),
    created_at: str(r.created_at),
  };
}

/** Newest first. */
export function normalizeEvents(raw: unknown): SubscriptionEvent[] {
  return listOf(raw, "events")
    .map(normalizeEvent)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

// ---------------------------------------------------------------- money and numbers

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const INR2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 500000 paise -> "₹5,000"; keeps paise when there are any. */
export function formatInrMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const rupees = minor / 100;
  return `₹${Number.isInteger(rupees) ? INR.format(rupees) : INR2.format(rupees)}`;
}

/** Whole rupees, signed: -1234.5 -> "-₹1,235". */
export function formatInr(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || !Number.isFinite(rupees)) return "—";
  const whole = Math.round(Math.abs(rupees));
  return `${rupees < 0 && whole > 0 ? "-" : ""}₹${INR.format(whole)}`;
}

export function formatUsd(usd: number | null | undefined, digits = 2): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(digits)}`;
}

/** "5000" / "5,000.50" -> paise; "" -> null; anything else -> error. */
export function parseRupeesToMinor(raw: string): { value: number | null } | { error: string } {
  const t = raw.replace(/[,₹\s]/g, "");
  if (t === "") return { value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Enter an amount in rupees, up to 2 decimals" };
  return { value: Math.round(Number(t) * 100) };
}

export function minorToRupeesText(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const r = minor / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** "" -> null, a non-negative number -> it, else error (field name in the message). */
export function parseCap(raw: string, field: string, opts: { integer?: boolean; max?: number } = {}): { value: number | null } | { error: string } {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { error: `${field}: enter a number of 0 or more` };
  if (opts.integer && !Number.isInteger(n)) return { error: `${field}: enter a whole number` };
  if (opts.max !== undefined && n > opts.max) return { error: `${field}: at most ${opts.max.toLocaleString("en-IN")}` };
  return { value: n };
}

const numText = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

export function marginPct(margin: number, revenue: number): number | null {
  if (!Number.isFinite(margin) || !Number.isFinite(revenue) || revenue <= 0) return null;
  return (margin / revenue) * 100;
}

export function formatMarginPct(p: number | null): string {
  if (p === null) return "—";
  return `${p.toFixed(0)}%`;
}

export type MarginTone = "ok" | "warn" | "error" | "off";

/** Below 0 = loss; below 50% = thin (the design's worst case is ~51%). */
export function marginTone(margin: number, revenue: number): MarginTone {
  const p = marginPct(margin, revenue);
  if (p === null) return margin < 0 ? "error" : "off";
  if (p < 0) return "error";
  if (p < 50) return "warn";
  return "ok";
}

export function settingNumber(entry: AiSettingEntry | null | undefined, fallback: number): number {
  if (!entry) return fallback;
  for (const v of [entry.effective, entry.value, entry.default]) {
    const n = numOrNull(v);
    if (n !== null && n > 0) return n;
  }
  return fallback;
}

export function settingBool(entry: AiSettingEntry | null | undefined): boolean | null {
  if (!entry) return null;
  for (const v of [entry.effective, entry.value, entry.default]) {
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

// ---------------------------------------------------------------- eligibility

export function allowedModes(eligibility: FeatureEligibility): ItemMode[] {
  if (eligibility === "INCLUDABLE") return ["INCLUDED", "ALLOWANCE", "CHARGED"];
  if (eligibility === "ALLOWANCE_ONLY") return ["ALLOWANCE", "CHARGED"];
  return ["CHARGED"];
}

export function isModeAllowed(eligibility: FeatureEligibility, mode: ItemMode): boolean {
  return allowedModes(eligibility).includes(mode);
}

/** What the server will actually do with an item: the platform guard wins over the plan. */
export function effectiveMode(eligibility: FeatureEligibility | undefined, mode: ItemMode): ItemMode {
  if (!eligibility) return "CHARGED";
  if (isModeAllowed(eligibility, mode)) return mode;
  return eligibility === "ALLOWANCE_ONLY" && mode === "INCLUDED" ? "ALLOWANCE" : "CHARGED";
}

export function isVoiceFeature(featureKey: string): boolean {
  return VOICE_FEATURES.includes(featureKey);
}

// ---------------------------------------------------------------- item drafts

export interface ItemDraft {
  feature_key: string;
  mode: ItemMode;
  model_policy: ModelPolicy;
  /** Comma or newline separated model ids. */
  model_allowlist: string;
  max_output_price_per_1m: string;
  on_model_violation: ViolationAction;
  /** Empty = every role. */
  roles_included: string[];
  inst_units_cap: string;
  inst_credits_cap: string;
  inst_cost_usd_cap: string;
  user_units_cap: string;
  user_credits_cap: string;
  user_cap_basis: CapBasis;
  over_cap_action: ViolationAction;
  display_cap_text: string;
}

export function itemDraft(item: PlanItem): ItemDraft {
  return {
    feature_key: item.feature_key,
    mode: item.mode,
    model_policy: item.model_policy,
    model_allowlist: (item.model_allowlist ?? []).join(", "),
    max_output_price_per_1m: numText(item.max_output_price_per_1m),
    on_model_violation: item.on_model_violation,
    roles_included: item.roles_included ?? [],
    inst_units_cap: numText(item.inst_units_cap),
    inst_credits_cap: numText(item.inst_credits_cap),
    inst_cost_usd_cap: numText(item.inst_cost_usd_cap),
    user_units_cap: numText(item.user_units_cap),
    user_credits_cap: numText(item.user_credits_cap),
    user_cap_basis: item.user_cap_basis,
    over_cap_action: item.over_cap_action,
    display_cap_text: item.display_cap_text ?? "",
  };
}

/** One draft per active feature, in catalogue order; features without an item start as CHARGED. */
export function itemDraftsFor(features: BillingFeature[], items: PlanItem[]): ItemDraft[] {
  const byKey = new Map(items.map((i) => [i.feature_key, i]));
  const keys = new Set<string>();
  const out: ItemDraft[] = [];
  for (const f of features) {
    keys.add(f.feature_key);
    if (!f.is_active && !byKey.has(f.feature_key)) continue;
    out.push(itemDraft(byKey.get(f.feature_key) ?? defaultItem(f.feature_key)));
  }
  // Items for features the catalogue no longer lists stay visible (and are sent back unchanged).
  for (const i of items) if (!keys.has(i.feature_key)) out.push(itemDraft(i));
  return out;
}

export function parseModelList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

const MAX_CAP = 9_999_999_999;

export function buildItem(draft: ItemDraft, feature: BillingFeature | undefined): { item: PlanItemPut } | { error: string } {
  const label = feature?.label ?? draft.feature_key;
  const eligibility = feature?.eligibility ?? "ALWAYS_CHARGED";
  if (!isModeAllowed(eligibility, draft.mode)) {
    return { error: `${label}: ${MODE_LABEL[draft.mode]} is not allowed (${ELIGIBILITY_LABEL[eligibility].toLowerCase()})` };
  }
  const included = draft.mode === "INCLUDED";
  const caps: Record<string, number | null> = {};
  const capFields: [keyof ItemDraft, string, boolean][] = [
    ["inst_units_cap", "institute uses", true],
    ["inst_credits_cap", "institute credits", false],
    ["inst_cost_usd_cap", "institute cost (USD)", false],
    ["user_units_cap", "per-user uses", true],
    ["user_credits_cap", "per-user credits", false],
  ];
  for (const [k, name, integer] of capFields) {
    if (!included) {
      caps[k] = null;
      continue;
    }
    const p = parseCap(String(draft[k]), `${label} ${name}`, { integer, max: MAX_CAP });
    if ("error" in p) return p;
    caps[k] = p.value;
  }
  let allowlist: string[] | null = null;
  let maxPrice: number | null = null;
  if (included && draft.model_policy === "ALLOWLIST") {
    allowlist = parseModelList(draft.model_allowlist);
    if (allowlist.length === 0) return { error: `${label}: list at least one model id, or pick another model policy` };
  }
  if (included && draft.model_policy === "MAX_PRICE") {
    const p = parseCap(draft.max_output_price_per_1m, `${label} max output price`);
    if ("error" in p) return p;
    if (p.value === null || p.value <= 0) return { error: `${label}: enter the highest output price (USD per 1M tokens)` };
    maxPrice = p.value;
  }
  const text = draft.display_cap_text.trim();
  if (text.length > 255) return { error: `${label}: the fair-use text is at most 255 characters` };
  return {
    item: {
      feature_key: draft.feature_key,
      mode: draft.mode,
      model_policy: draft.model_policy,
      model_allowlist: allowlist,
      max_output_price_per_1m: maxPrice,
      on_model_violation: draft.on_model_violation,
      roles_included: included && draft.roles_included.length > 0 ? [...draft.roles_included] : null,
      inst_units_cap: caps.inst_units_cap,
      inst_credits_cap: caps.inst_credits_cap,
      inst_cost_usd_cap: caps.inst_cost_usd_cap,
      user_units_cap: caps.user_units_cap,
      user_credits_cap: caps.user_credits_cap,
      user_cap_basis: draft.user_cap_basis,
      over_cap_action: draft.over_cap_action,
      display_cap_text: text === "" ? null : text,
    },
  };
}

/** The full item list for PUT /versions/{id}/items, or the first problem found. */
export function buildItemsPut(drafts: ItemDraft[], features: BillingFeature[]): { items: PlanItemPut[] } | { error: string } {
  const byKey = new Map(features.map((f) => [f.feature_key, f]));
  const items: PlanItemPut[] = [];
  for (const d of drafts) {
    const built = buildItem(d, byKey.get(d.feature_key));
    if ("error" in built) return built;
    items.push(built.item);
  }
  return { items };
}

export function hasCaps(item: Pick<PlanItem, "inst_units_cap" | "inst_credits_cap" | "inst_cost_usd_cap" | "user_units_cap" | "user_credits_cap">): boolean {
  return [item.inst_units_cap, item.inst_credits_cap, item.inst_cost_usd_cap, item.user_units_cap, item.user_credits_cap].some((v) => v !== null);
}

/** "300 uses · 600 cr · $5" for the institute, "100 uses/user (subject)" for users. */
export function describeCaps(item: PlanItem): string {
  const parts: string[] = [];
  const inst: string[] = [];
  if (item.inst_units_cap !== null) inst.push(`${item.inst_units_cap.toLocaleString("en-IN")} uses`);
  if (item.inst_credits_cap !== null) inst.push(`${item.inst_credits_cap.toLocaleString("en-IN")} cr`);
  if (item.inst_cost_usd_cap !== null) inst.push(formatUsd(item.inst_cost_usd_cap));
  if (inst.length) parts.push(`Institute ${inst.join(" · ")}`);
  const user: string[] = [];
  if (item.user_units_cap !== null) user.push(`${item.user_units_cap.toLocaleString("en-IN")} uses`);
  if (item.user_credits_cap !== null) user.push(`${item.user_credits_cap.toLocaleString("en-IN")} cr`);
  if (user.length) parts.push(`per ${item.user_cap_basis === "SUBJECT" ? "learner (subject)" : "user"} ${user.join(" · ")}`);
  return parts.length ? parts.join("; ") : "No cap";
}

export function modeCounts(items: Pick<PlanItem, "mode">[]): Record<ItemMode, number> {
  const out: Record<ItemMode, number> = { INCLUDED: 0, ALLOWANCE: 0, CHARGED: 0 };
  for (const i of items) out[i.mode] += 1;
  return out;
}

// ---------------------------------------------------------------- version terms

export interface TermsDraft {
  price_rupees: string;
  is_tax_inclusive: boolean;
  sac_code: string;
  period_months: number;
  allowance_credits: string;
  internal_cost_cap_usd: string;
  grace_days: string;
  grace_behaviour: GraceBehaviour;
  supersedes_version_id: string;
  migrate_existing_at_renewal: boolean;
}

export function termsDraft(v: PlanVersion): TermsDraft {
  return {
    price_rupees: minorToRupeesText(v.price_minor),
    is_tax_inclusive: v.is_tax_inclusive,
    sac_code: v.sac_code ?? "",
    period_months: v.period_months,
    allowance_credits: numText(v.allowance_credits),
    internal_cost_cap_usd: numText(v.internal_cost_cap_usd),
    grace_days: String(v.grace_days),
    grace_behaviour: v.grace_behaviour,
    supersedes_version_id: v.supersedes_version_id ?? "",
    migrate_existing_at_renewal: v.migrate_existing_at_renewal,
  };
}

/** Only the changed terms (PATCH), or the first problem. `changed` is false when nothing differs. */
export function buildTermsPatch(
  v: PlanVersion,
  draft: TermsDraft,
  reason: string
): { body: VersionTermsPatch; changed: boolean } | { error: string } {
  const price = parseRupeesToMinor(draft.price_rupees);
  if ("error" in price) return price;
  if (price.value === null) return { error: "Enter the price (0 for a free plan)" };
  if (!PERIOD_MONTH_OPTIONS.includes(draft.period_months)) return { error: "The period must be 1, 3, 6 or 12 months" };
  const allowance = parseCap(draft.allowance_credits, "Allowance", { max: MAX_CAP });
  if ("error" in allowance) return allowance;
  const cap = parseCap(draft.internal_cost_cap_usd, "Internal cost cap", { max: MAX_CAP });
  if ("error" in cap) return cap;
  const grace = parseCap(draft.grace_days, "Grace days", { integer: true, max: 90 });
  if ("error" in grace) return grace;
  const sac = draft.sac_code.trim();
  if (sac.length > 16) return { error: "SAC code: at most 16 characters" };
  if (draft.supersedes_version_id && draft.supersedes_version_id === v.id) return { error: "A version cannot supersede itself" };
  if (reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };

  const next = {
    price_minor: price.value,
    is_tax_inclusive: draft.is_tax_inclusive,
    sac_code: sac === "" ? null : sac,
    period_months: draft.period_months,
    allowance_credits: allowance.value ?? 0,
    internal_cost_cap_usd: cap.value,
    grace_days: grace.value ?? 0,
    grace_behaviour: draft.grace_behaviour,
    supersedes_version_id: draft.supersedes_version_id === "" ? null : draft.supersedes_version_id,
    migrate_existing_at_renewal: draft.migrate_existing_at_renewal,
  };
  const body: VersionTermsPatch = { reason: reason.trim() };
  let changed = false;
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (next[k] !== v[k]) {
      (body as Record<string, unknown>)[k] = next[k];
      changed = true;
    }
  }
  return { body, changed };
}

/** Are two item lists the same (ignoring ids and order)? */
export function sameItems(a: PlanItemPut[], b: PlanItemPut[]): boolean {
  if (a.length !== b.length) return false;
  const key = (i: PlanItemPut) => JSON.stringify({ ...i, model_allowlist: i.model_allowlist ? [...i.model_allowlist].sort() : null, roles_included: i.roles_included ? [...i.roles_included].sort() : null });
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((x, i) => x === sb[i]);
}

export function stripItemId(i: PlanItem): PlanItemPut {
  const { id: _id, ...rest } = i;
  void _id;
  return rest;
}

// ---------------------------------------------------------------- publish diff

export interface DiffLine {
  what: string;
  from: string;
  to: string;
}

function termText(k: string, v: PlanVersion): string {
  switch (k) {
    case "price_minor":
      return `${formatInrMinor(v.price_minor)}${v.is_tax_inclusive ? " incl. tax" : " + GST"}`;
    case "period_months":
      return periodText(v.period_months);
    case "allowance_credits":
      return `${v.allowance_credits.toLocaleString("en-IN")} credits`;
    case "internal_cost_cap_usd":
      return v.internal_cost_cap_usd === null ? "None" : formatUsd(v.internal_cost_cap_usd);
    case "grace_days":
      return `${v.grace_days} days`;
    case "grace_behaviour":
      return GRACE_LABEL[v.grace_behaviour];
    case "sac_code":
      return v.sac_code ?? "—";
    case "migrate_existing_at_renewal":
      return v.migrate_existing_at_renewal ? "Yes" : "No";
    default:
      return "";
  }
}

const TERM_LABEL: Record<string, string> = {
  price_minor: "Price",
  period_months: "Period",
  allowance_credits: "Allowance",
  internal_cost_cap_usd: "Internal cost cap",
  grace_days: "Grace days",
  grace_behaviour: "During grace",
  sac_code: "SAC code",
  migrate_existing_at_renewal: "Move existing subscribers at renewal",
};

function itemText(i: PlanItem | undefined): string {
  if (!i) return "Charged";
  if (i.mode !== "INCLUDED") return MODE_LABEL[i.mode];
  const roles = i.roles_included?.length ? `, ${i.roles_included.join("/")}` : "";
  return `Included (${POLICY_LABEL[i.model_policy].toLowerCase()}${roles}; ${describeCaps(i)})`;
}

/** What publishing `next` changes compared with `prev` (null = first version: everything is new). */
export function diffVersions(prev: PlanVersion | null, next: PlanVersion, features: BillingFeature[]): DiffLine[] {
  const out: DiffLine[] = [];
  const labels = new Map(features.map((f) => [f.feature_key, f.label]));
  for (const k of Object.keys(TERM_LABEL)) {
    const to = termText(k, next);
    const from = prev ? termText(k, prev) : "—";
    if (from !== to) out.push({ what: TERM_LABEL[k], from, to });
  }
  const prevItems = new Map((prev?.items ?? []).map((i) => [i.feature_key, i]));
  const nextItems = new Map(next.items.map((i) => [i.feature_key, i]));
  const keys = [...new Set([...prevItems.keys(), ...nextItems.keys()])];
  for (const k of keys) {
    const from = itemText(prevItems.get(k));
    const to = itemText(nextItems.get(k));
    if (from !== to || (!prev && nextItems.get(k)?.mode !== "CHARGED")) {
      if (!prev && to === "Charged") continue;
      out.push({ what: labels.get(k) ?? k, from: prev ? from : "—", to });
    }
  }
  return out;
}

export function periodText(months: number): string {
  if (months === 1) return "Monthly";
  if (months === 12) return "Yearly";
  return `Every ${months} months`;
}

export function versionLabel(v: Pick<PlanVersion, "version_no" | "status">): string {
  return `v${v.version_no} · ${STATUS_LABEL[v.status] ?? v.status}`;
}

// ---------------------------------------------------------------- plans

const PLAN_KEY_RE = /^[a-z][a-z0-9_]{1,47}$/;

export function buildPlanCreate(draft: { plan_key: string; name: string; description: string; reason: string }): { body: PlanCreate } | { error: string } {
  const key = draft.plan_key.trim();
  if (!PLAN_KEY_RE.test(key)) return { error: "Plan key: 2-48 characters, lower case letters, digits and _ (start with a letter)" };
  const name = draft.name.trim();
  if (name === "" || name.length > 128) return { error: "Name: 1-128 characters" };
  if (draft.reason.trim() === "") return { error: "Give a reason (it lands in the change log)" };
  const description = draft.description.trim();
  return { body: { plan_key: key, name, description: description === "" ? null : description, reason: draft.reason.trim() } };
}


// ---------------------------------------------------------------- subscriptions

export function isLiveStatus(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

/** The subscription the resolver uses for an institute: the one in TRIAL/ACTIVE/GRACE. */
export function liveSubscription(subs: Subscription[]): Subscription | null {
  return subs.find((s) => isLiveStatus(s.status)) ?? null;
}

export interface AllowanceMeter {
  credits: number;
  used: number;
  remaining: number;
  pct: number | null;
}

export function allowanceMeter(p: Pick<SubscriptionPeriod, "allowance_credits" | "allowance_used"> | null | undefined): AllowanceMeter {
  const credits = Math.max(0, p?.allowance_credits ?? 0);
  const used = Math.max(0, p?.allowance_used ?? 0);
  return {
    credits,
    used,
    remaining: Math.max(0, credits - used),
    pct: credits > 0 ? Math.min(100, (used / credits) * 100) : null,
  };
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface AssignDraft {
  institute_id: string;
  plan_version_id: string;
  start_at: string;
  period_months: number;
  auto_renew: boolean;
  grace_days: string;
  enforcement: Enforcement;
  source: "MANUAL" | "COMPLIMENTARY";
  price_override_rupees: string;
  reason: string;
}

export function emptyAssignDraft(now: Date = new Date(), instituteId = ""): AssignDraft {
  return {
    institute_id: instituteId,
    plan_version_id: "",
    start_at: toLocalInput(now),
    period_months: 1,
    auto_renew: true,
    grace_days: "7",
    enforcement: "SHADOW",
    source: "MANUAL",
    price_override_rupees: "",
    reason: "",
  };
}

/** POST /subscriptions body. Only PUBLISHED versions may be assigned. */
export function buildAssign(draft: AssignDraft, version: Pick<PlanVersion, "id" | "status"> | null): { body: SubscriptionCreate } | { error: string } {
  const inst = draft.institute_id.trim();
  if (inst === "") return { error: "Pick an institute" };
  if (!version || version.id !== draft.plan_version_id) return { error: "Pick a plan version" };
  if (version.status !== "PUBLISHED") return { error: "Only a published version can be assigned" };
  const start = new Date(draft.start_at);
  if (draft.start_at.trim() === "" || Number.isNaN(start.getTime())) return { error: "Enter a start date" };
  if (!PERIOD_MONTH_OPTIONS.includes(draft.period_months)) return { error: "The period must be 1, 3, 6 or 12 months" };
  const grace = parseCap(draft.grace_days, "Grace days", { integer: true, max: 90 });
  if ("error" in grace) return grace;
  const price = parseRupeesToMinor(draft.price_override_rupees);
  if ("error" in price) return { error: `Price override: ${price.error.toLowerCase()}` };
  if (draft.reason.trim() === "") return { error: "Give a reason (it lands in the subscription's history)" };
  const body: SubscriptionCreate = {
    institute_id: inst,
    plan_version_id: version.id,
    start_at: start.toISOString(),
    period_months: draft.period_months,
    auto_renew: draft.auto_renew,
    grace_days: grace.value ?? 7,
    enforcement: draft.enforcement,
    source: draft.source,
    reason: draft.reason.trim(),
  };
  if (price.value !== null) body.price_override_minor = price.value;
  return { body };
}

export interface OverrideDraft {
  feature_key: string;
  /** "" = keep the plan's mode, change caps only. */
  mode: ItemMode | "";
  inst_units_cap: string;
  inst_credits_cap: string;
  inst_cost_usd_cap: string;
  user_units_cap: string;
  user_credits_cap: string;
  reason: string;
}

export function emptyOverrideDraft(featureKey = ""): OverrideDraft {
  return { feature_key: featureKey, mode: "", inst_units_cap: "", inst_credits_cap: "", inst_cost_usd_cap: "", user_units_cap: "", user_credits_cap: "", reason: "" };
}

export function buildOverride(draft: OverrideDraft, feature: BillingFeature | undefined): { body: OverrideCreate } | { error: string } {
  if (!feature) return { error: "Pick a feature" };
  if (draft.mode !== "" && !isModeAllowed(feature.eligibility, draft.mode)) {
    return { error: `${feature.label}: ${MODE_LABEL[draft.mode]} is not allowed (${ELIGIBILITY_LABEL[feature.eligibility].toLowerCase()})` };
  }
  const caps: Record<string, number | null> = {};
  for (const [k, name, integer] of [
    ["inst_units_cap", "Institute uses", true],
    ["inst_credits_cap", "Institute credits", false],
    ["inst_cost_usd_cap", "Institute cost (USD)", false],
    ["user_units_cap", "Per-user uses", true],
    ["user_credits_cap", "Per-user credits", false],
  ] as const) {
    const p = parseCap(draft[k], name, { integer, max: MAX_CAP });
    if ("error" in p) return p;
    caps[k] = p.value;
  }
  if (draft.mode === "" && Object.values(caps).every((v) => v === null)) return { error: "Change the mode or at least one cap" };
  if (draft.reason.trim() === "") return { error: "Give a reason (it lands in the subscription's history)" };
  return {
    body: {
      feature_key: feature.feature_key,
      mode: draft.mode === "" ? null : draft.mode,
      inst_units_cap: caps.inst_units_cap,
      inst_credits_cap: caps.inst_credits_cap,
      inst_cost_usd_cap: caps.inst_cost_usd_cap,
      user_units_cap: caps.user_units_cap,
      user_credits_cap: caps.user_credits_cap,
      reason: draft.reason.trim(),
    },
  };
}

/** The item the resolver uses once an override row applies: override fields win, blanks keep the plan's. */
export function applyOverride(item: PlanItem | undefined, o: Pick<SubscriptionOverride, "feature_key" | "mode" | "inst_units_cap" | "inst_credits_cap" | "inst_cost_usd_cap" | "user_units_cap" | "user_credits_cap">): PlanItem {
  const base = item ?? defaultItem(o.feature_key);
  return {
    ...base,
    mode: o.mode ?? base.mode,
    inst_units_cap: o.inst_units_cap ?? base.inst_units_cap,
    inst_credits_cap: o.inst_credits_cap ?? base.inst_credits_cap,
    inst_cost_usd_cap: o.inst_cost_usd_cap ?? base.inst_cost_usd_cap,
    user_units_cap: o.user_units_cap ?? base.user_units_cap,
    user_credits_cap: o.user_credits_cap ?? base.user_credits_cap,
  };
}

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** "enforcement: SHADOW → LIVE; auto_renew: true → false" for keys that differ. */
export function describeStateChange(from: Record<string, unknown> | null, to: Record<string, unknown> | null): string {
  if (!to) return "";
  const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const parts: string[] = [];
  for (const [k, v] of Object.entries(to)) {
    const before = from ? from[k] : undefined;
    if (from && fmt(before) === fmt(v)) continue;
    parts.push(from && k in from ? `${k}: ${fmt(before)} → ${fmt(v)}` : `${k}: ${fmt(v)}`);
    if (parts.length >= 6) break;
  }
  return parts.join("; ");
}

// ---------------------------------------------------------------- simulate

export function normalizeSimulationRow(raw: unknown): SimulationRow {
  const r = obj(raw);
  return {
    feature_key: str(r.feature_key) ?? "unmapped",
    label: str(r.label),
    events: toNumber(r.events ?? r.event_count, 0),
    list_credits: toNumber(r.list_credits, 0),
    included_credits: toNumber(r.included_credits ?? r.included_list_credits, 0),
    allowance_credits: toNumber(r.allowance_credits ?? r.allowance_used, 0),
    charged_credits: toNumber(r.charged_credits, 0),
    real_cost_usd: toNumber(r.real_cost_usd ?? r.cost_usd, 0),
    plan_cost_usd: numOrNull(r.plan_cost_usd),
    over_cap_events: toNumber(r.over_cap_events, 0),
    not_covered_events: toNumber(r.model_not_included_events, 0) + toNumber(r.role_not_included_events, 0),
  };
}

/**
 * The simulate response, with totals. Server totals win; when it sends none, revenue is the price
 * pro-rated over the window (price × days / (period_months × 30)) and margin = revenue − real cost of
 * the work the plan absorbs (included + allowance), converted at inr_per_usd.
 */
export function normalizeSimulation(raw: unknown, fallback: { plan_version_id: string; institute_id: string; days: number; price_minor: number; period_months: number; inr_per_usd: number }): SimulationResult {
  const r = obj(raw);
  const totals = obj(r.totals ?? r.summary);
  const rows = listOf(r, "features", "rows").map(normalizeSimulationRow);
  const inrPerUsd = toNumber(r.inr_per_usd ?? totals.inr_per_usd, 0) || fallback.inr_per_usd;
  const days = toNumber(r.days, 0) || fallback.days;
  const absorbedUsd = rows.reduce((s, x) => {
    if (x.plan_cost_usd !== null) return s + x.plan_cost_usd;
    const share = x.list_credits > 0 ? Math.min(1, (x.included_credits + x.allowance_credits) / x.list_credits) : 0;
    return s + x.real_cost_usd * share;
  }, 0);
  const realUsd = rows.reduce((s, x) => s + x.real_cost_usd, 0);
  const serverRevenue = numOrNull(totals.revenue_inr ?? r.revenue_inr);
  const serverMargin = numOrNull(totals.margin_inr ?? r.margin_inr);
  const revenueMinor = numOrNull(r.revenue_minor);
  const revenue = serverRevenue ?? (revenueMinor !== null ? revenueMinor / 100 : (fallback.price_minor / 100) * (days / (Math.max(1, fallback.period_months) * 30)));
  const absorbedInr = numOrNull(totals.absorbed_cost_inr ?? totals.plan_cost_inr ?? r.absorbed_cost_inr) ?? absorbedUsd * inrPerUsd;
  return {
    plan_version_id: str(r.plan_version_id) ?? fallback.plan_version_id,
    institute_id: str(r.institute_id) ?? fallback.institute_id,
    days,
    rows: rows.sort((a, b) => b.list_credits - a.list_credits),
    revenue_inr: revenue,
    absorbed_cost_inr: absorbedInr,
    real_cost_inr_total: numOrNull(totals.real_cost_inr ?? r.real_cost_inr) ?? realUsd * inrPerUsd,
    margin_inr: serverMargin ?? revenue - absorbedInr,
    inr_per_usd: inrPerUsd,
    server_totals: serverRevenue !== null && serverMargin !== null,
    truncated: bool(r.truncated, false),
    over_cap_events: rows.reduce((t, x) => t + x.over_cap_events, 0),
  };
}

export function simulationTotals(rows: SimulationRow[]) {
  return rows.reduce(
    (t, r) => ({
      events: t.events + r.events,
      list_credits: t.list_credits + r.list_credits,
      included_credits: t.included_credits + r.included_credits,
      allowance_credits: t.allowance_credits + r.allowance_credits,
      charged_credits: t.charged_credits + r.charged_credits,
      real_cost_usd: t.real_cost_usd + r.real_cost_usd,
      over_cap_events: t.over_cap_events + r.over_cap_events,
    }),
    { events: 0, list_credits: 0, included_credits: 0, allowance_credits: 0, charged_credits: 0, real_cost_usd: 0, over_cap_events: 0 }
  );
}

// ---------------------------------------------------------------- P&L

export function normalizePnlRow(raw: unknown, inrPerUsd: number): PnlRow {
  const r = obj(raw);
  const price = toNumber(r.price_minor ?? r.price_minor_snapshot, 0);
  const cost = toNumber(r.real_cost_usd_total ?? r.real_cost_usd, 0);
  const includedCost = toNumber(r.included_cost_usd, 0);
  const allowanceCost = toNumber(r.allowance_cost_usd, 0);
  const planCostInr = numOrNull(r.plan_cost_inr) ?? (includedCost + allowanceCost) * inrPerUsd;
  const margin = numOrNull(r.margin_inr);
  return {
    institute_id: str(r.institute_id) ?? "",
    institute_name: str(r.institute_name),
    subscription_id: str(r.subscription_id),
    plan_name: str(r.plan_name) ?? str(r.plan),
    plan_key: str(r.plan_key),
    version_no: intOrNull(r.version_no),
    enforcement: str(r.enforcement),
    period_start: str(r.period_start),
    period_end: str(r.period_end),
    price_minor: price,
    payment_status: str(r.payment_status),
    included_list_credits: toNumber(r.included_list_credits, 0),
    included_cost_usd: includedCost,
    allowance_used: toNumber(r.allowance_used, 0),
    allowance_cost_usd: allowanceCost,
    charged_credits: toNumber(r.charged_credits, 0),
    real_cost_usd_total: cost,
    plan_cost_inr: planCostInr,
    basis: str(r.basis),
    margin_inr: margin ?? price / 100 - planCostInr,
    cost_basis: str(r.cost_basis),
    cost_estimated_events: toNumber(r.cost_estimated_events, 0),
  };
}

export function normalizePnl(raw: unknown, period: string, fallbackInrPerUsd = DEFAULT_INR_PER_USD): PnlResponse {
  const r = obj(raw);
  const rate = toNumber(r.inr_per_usd, 0) || fallbackInrPerUsd;
  return {
    period: str(r.period) ?? period,
    inr_per_usd: rate,
    rows: listOf(raw, "pnl", "institutes").map((x) => normalizePnlRow(x, rate)),
  };
}

export function pnlTotals(rows: PnlRow[]) {
  return rows.reduce(
    (t, r) => ({
      revenue_inr: t.revenue_inr + r.price_minor / 100,
      included_list_credits: t.included_list_credits + r.included_list_credits,
      included_cost_usd: t.included_cost_usd + r.included_cost_usd,
      allowance_used: t.allowance_used + r.allowance_used,
      charged_credits: t.charged_credits + r.charged_credits,
      real_cost_usd_total: t.real_cost_usd_total + r.real_cost_usd_total,
      plan_cost_inr: t.plan_cost_inr + r.plan_cost_inr,
      margin_inr: t.margin_inr + r.margin_inr,
    }),
    { revenue_inr: 0, included_list_credits: 0, included_cost_usd: 0, allowance_used: 0, charged_credits: 0, real_cost_usd_total: 0, plan_cost_inr: 0, margin_inr: 0 }
  );
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function pnlCsv(rows: PnlRow[]): string {
  const head = [
    "institute_id", "institute_name", "plan", "version", "enforcement", "period_start", "period_end", "payment_status",
    "price_inr", "included_list_credits", "included_cost_usd", "allowance_used", "allowance_cost_usd", "charged_credits", "real_cost_usd_total", "plan_cost_inr", "margin_inr",
    "cost_basis", "cost_estimated_events",
  ];
  const lines = rows.map((r) =>
    [
      r.institute_id, r.institute_name, r.plan_name ?? r.plan_key, r.version_no, r.enforcement, r.period_start, r.period_end, r.payment_status,
      (r.price_minor / 100).toFixed(2), r.included_list_credits.toFixed(2), r.included_cost_usd.toFixed(4), r.allowance_used.toFixed(2),
      r.allowance_cost_usd.toFixed(4), r.charged_credits.toFixed(2), r.real_cost_usd_total.toFixed(4), r.plan_cost_inr.toFixed(2), r.margin_inr.toFixed(2),
      r.cost_basis, r.cost_estimated_events,
    ].map(csvCell).join(",")
  );
  return [head.join(","), ...lines].join("\n");
}

// ---------------------------------------------------------------- dates

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return "—";
  return `${formatDay(start)} – ${end ? formatDay(end) : "open"}`;
}
