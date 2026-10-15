// AI usage limits (ai-service /super-admin/v1/metering/limits). An institute
// with no institute_ai_limits_policy row behaves exactly as today: nothing is
// counted against a cap and nothing is blocked. A policy row turns the feature
// on in SHADOW (log what would have been blocked) or ENFORCE (answer 429
// AI_USAGE_LIMIT once a hard limit is reached). Limits never change what a call
// is charged; the credit balance check runs first, unchanged.

export type LimitsMode = "OFF" | "SHADOW" | "ENFORCE";
/** Who a row caps. INSTITUTE = the whole institute as one pool. */
export type LimitSubjectKind = "INSTITUTE" | "ROLE_CLASS" | "ROLE" | "USER";
/** Which AI usage a row counts: everything, one feature group, or one use case. */
export type LimitScopeKind = "ALL" | "GROUP" | "USE_CASE";
/** PLAN_PERIOD is reserved for AI plans and unused until they ship. */
export type LimitPeriod = "DAY" | "WEEK" | "MONTH" | "PLAN_PERIOD";
/** CREDITS counts list credits (before any plan discount), COUNT counts requests, COST_USD the real vendor cost. */
export type LimitMetric = "CREDITS" | "COUNT" | "COST_USD";
/** PLATFORM rows are set here by a super admin; tenants cannot edit locked ones or out-rank them. */
export type LimitOrigin = "TENANT" | "PLATFORM";

export interface LimitsPolicy {
  mode: LimitsMode | string;
  /** False: the institute admin may only choose OFF or SHADOW. */
  tenant_may_enforce: boolean;
  /** IANA zone the DAY / WEEK / MONTH windows start in. */
  timezone: string;
  notify_admins_on_soft: boolean;
  /** Learners see their own used / remaining numbers (otherwise only "limit reached"). */
  show_numbers_to_learners: boolean;
  updated_by: string | null;
  updated_at: string | null;
  reason: string | null;
  /** True when the institute has no policy row (the portal shows the OFF default). */
  is_default: boolean;
}

export interface LimitRow {
  id: string;
  subject_kind: LimitSubjectKind | string;
  subject_value: string | null;
  subject_label: string | null;
  /** ROLE / ROLE_CLASS rows: true = each member has the cap, false = one pool shared by the role. */
  per_member: boolean;
  scope_kind: LimitScopeKind | string;
  scope_value: string | null;
  scope_label: string | null;
  period: LimitPeriod | string;
  metric: LimitMetric | string;
  /** Warn at or above. */
  soft_limit: number | null;
  /** Block at or above; 0 = feature off for this subject; null = no cap (an exemption on USER / ROLE rows). */
  hard_limit: number | null;
  origin: LimitOrigin | string;
  locked: boolean;
  is_active: boolean;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** GET /{institute_id}/policy, normalised (the rows may come with it or from GET /{institute_id}/rows). */
export interface InstituteLimits {
  policy: LimitsPolicy;
  rows: LimitRow[];
  platform_rows: LimitRow[];
  /** metering.limits.enforce as the server resolves it; null when the response does not say. */
  enforce_globally_enabled: boolean | null;
}

/** PUT /{institute_id}/policy. */
export interface LimitsPolicyPut {
  mode: LimitsMode;
  tenant_may_enforce: boolean;
  timezone: string;
  notify_admins_on_soft: boolean;
  show_numbers_to_learners: boolean;
  reason: string;
}

/** POST /{institute_id}/rows. */
export interface LimitRowCreate {
  subject_kind: LimitSubjectKind;
  subject_value: string | null;
  per_member?: boolean;
  scope_kind: LimitScopeKind;
  scope_value: string | null;
  period: LimitPeriod;
  metric: LimitMetric;
  soft_limit: number | null;
  hard_limit: number | null;
  origin: LimitOrigin;
  locked: boolean;
  reason: string;
}

/** PATCH /{institute_id}/rows/{row_id}: only the changed fields, plus the reason. */
export interface LimitRowPatch {
  soft_limit?: number | null;
  hard_limit?: number | null;
  locked?: boolean;
  reason: string;
}

/** GET /overview: {institutes, enforce_globally_enabled}. */
export interface LimitsOverview {
  institutes: LimitsOverviewRow[];
  enforce_globally_enabled: boolean | null;
}

/** GET /overview: one row per institute that has a policy row. */
export interface LimitsOverviewRow {
  institute_id: string;
  institute_name: string | null;
  mode: LimitsMode | string;
  tenant_may_enforce: boolean;
  /** Active TENANT rows. */
  rows: number;
  /** Active PLATFORM rows. */
  platform_rows: number;
  /** SHADOW: calls that would have been blocked in the last 7 days. */
  would_block_7d: number;
  /** ENFORCE: calls refused with 429 in the last 7 days. */
  blocked_7d: number;
  /** Calls that pushed a counter past its hard limit after the fact (the work was already done). */
  overrun_7d: number;
}

/** GET /{institute_id}/usage?period=: one counter in the current window. */
export interface LimitUsageMeter {
  key: string;
  label: string;
  period: LimitPeriod | string;
  credits_used: number;
  count_used: number;
  /** Vendor cost in this window (super-admin only). */
  cost_usd: number | null;
  /** Soft / hard / metric of the binding row (the one closest to its limit); null when no row caps this counter. */
  soft: number | null;
  hard: number | null;
  metric: LimitMetric | string | null;
  /** used / limit (hard, else soft) as a percentage, in the binding row's metric; null when nothing caps it. */
  pct: number | null;
  window_start: string | null;
}
