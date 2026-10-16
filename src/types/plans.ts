// AI subscription plans (ai-service /super-admin/v1/plans/**). Tables live in the admin_core
// database (V588): ai_billing_feature, ai_plan, ai_plan_version, ai_plan_item,
// institute_ai_subscription, ai_subscription_period, ai_subscription_override, ai_subscription_event.
// Paid subscriptions, listing and billing documents (V590) are typed in ./plan-billing.
import type { PlanListing } from "./plan-billing";

export type FeatureEligibility = "INCLUDABLE" | "ALLOWANCE_ONLY" | "ALWAYS_CHARGED";
export type VersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
export type ItemMode = "INCLUDED" | "ALLOWANCE" | "CHARGED";
export type ModelPolicy = "ANY" | "DEFAULT_CHAIN" | "ALLOWLIST" | "MAX_PRICE";
export type ViolationAction = "CHARGE" | "BLOCK";
export type CapBasis = "ACTOR" | "SUBJECT";
export type GraceBehaviour = "INCLUDED" | "CHARGED";
/** PENDING = a paid plan waiting for its first payment (source PAYMENT, V590); it gives no benefits. */
export type SubscriptionStatus = "PENDING" | "SCHEDULED" | "TRIAL" | "ACTIVE" | "GRACE" | "EXPIRED" | "CANCELLED";
export type Enforcement = "SHADOW" | "LIVE";
export type SubscriptionSource = "MANUAL" | "COMPLIMENTARY" | "PAYMENT";
export type PaymentStatus = "DUE" | "PAID" | "COMPLIMENTARY" | "WAIVED" | "REFUNDED";

/** ai_billing_feature: the customer-facing feature a group of use cases bills under. */
export interface BillingFeature {
  feature_key: string;
  label: string;
  /** What tenants see instead of the internal label (storefront, invoices); null = label. Brand-linted. */
  tenant_label: string | null;
  description: string | null;
  eligibility: FeatureEligibility;
  /** ai_calling / telephony: eligibility changes need an unlock reason. */
  locked: boolean;
  display_order: number;
  is_active: boolean;
  /** Catalog use cases that bill under this feature (when the server lists them). */
  use_cases: string[];
  updated_by: string | null;
  updated_at: string | null;
}

export interface FeaturePatch {
  label?: string;
  /** null clears it (tenants then see label). */
  tenant_label?: string | null;
  description?: string | null;
  display_order?: number;
  eligibility?: FeatureEligibility;
  /** Required by ai-service to change a locked row. */
  unlock_reason?: string;
  reason: string;
}

/** ai_plan_item: how one feature is billed under one plan version. */
export interface PlanItem {
  id: string | null;
  feature_key: string;
  mode: ItemMode;
  model_policy: ModelPolicy;
  model_allowlist: string[] | null;
  max_output_price_per_1m: number | null;
  on_model_violation: ViolationAction;
  /** Role classes (ADMIN, TEACHER, LEARNER, ...); null = every role. */
  roles_included: string[] | null;
  inst_units_cap: number | null;
  inst_credits_cap: number | null;
  inst_cost_usd_cap: number | null;
  user_units_cap: number | null;
  user_credits_cap: number | null;
  user_cap_basis: CapBasis;
  over_cap_action: ViolationAction;
  display_cap_text: string | null;
}

/** The body of one item in PUT /versions/{id}/items. */
export type PlanItemPut = Omit<PlanItem, "id">;

/** ai_plan_version: the commercial terms. Frozen by a DB trigger once PUBLISHED. */
export interface PlanVersion {
  id: string;
  plan_id: string;
  version_no: number;
  status: VersionStatus;
  currency: string;
  price_minor: number;
  is_tax_inclusive: boolean;
  sac_code: string | null;
  period_months: number;
  allowance_credits: number;
  /** Internal monthly real-cost cap on included features; never shown to tenants. */
  internal_cost_cap_usd: number | null;
  grace_days: number;
  grace_behaviour: GraceBehaviour;
  supersedes_version_id: string | null;
  migrate_existing_at_renewal: boolean;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  items: PlanItem[];
  /** Subscriptions on this version (when the server counts them). */
  subscriber_count: number | null;
  /** INCLUDED items, from list rows that carry counts instead of items. */
  included_count: number | null;
}

export type VersionTermsPatch = Partial<
  Pick<
    PlanVersion,
    | "currency"
    | "price_minor"
    | "is_tax_inclusive"
    | "sac_code"
    | "period_months"
    | "allowance_credits"
    | "internal_cost_cap_usd"
    | "grace_days"
    | "grace_behaviour"
    | "supersedes_version_id"
    | "migrate_existing_at_renewal"
  >
> & { reason: string };

export interface Plan {
  id: string;
  plan_key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Newest first. Lists may carry a summary (no items); the detail call carries items. */
  versions: PlanVersion[];
  /** Storefront marketing (unlisted by default). */
  listing: PlanListing;
  live_subscriptions: number | null;
  shadow_subscriptions: number | null;
}

export interface PlanCreate {
  plan_key: string;
  name: string;
  description: string | null;
  reason: string;
}

export interface SubscriptionPeriod {
  id: string | null;
  period_start: string | null;
  period_end: string | null;
  plan_version_id: string | null;
  price_minor_snapshot: number | null;
  allowance_credits: number;
  allowance_used: number;
  payment_status: PaymentStatus | string | null;
}

export interface Subscription {
  id: string;
  institute_id: string;
  institute_name: string | null;
  plan_version_id: string;
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  version_no: number | null;
  status: SubscriptionStatus | string;
  enforcement: Enforcement;
  source: SubscriptionSource | string;
  anchor_at: string | null;
  start_at: string | null;
  end_at: string | null;
  period_months: number;
  auto_renew: boolean;
  grace_days: number;
  cancel_at_period_end: boolean;
  pending_plan_version_id: string | null;
  price_override_minor: number | null;
  /** The subscribed version's list price (list rows carry it). */
  version_price_minor: number | null;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
  current_period: SubscriptionPeriod | null;
}

export interface SubscriptionCreate {
  institute_id: string;
  plan_version_id: string;
  /** Omitted for PAYMENT: the plan starts when the first payment arrives. */
  start_at?: string;
  /** Omitted for PAYMENT: a paid plan bills the version's own period. */
  period_months?: number;
  auto_renew: boolean;
  grace_days: number;
  enforcement: Enforcement;
  source: "MANUAL" | "COMPLIMENTARY" | "PAYMENT";
  price_override_minor?: number;
  /** PAYMENT only: email the institute admins a payment link for the first period now. */
  send_link?: boolean;
  reason: string;
}

export interface SubscriptionPatch {
  enforcement?: Enforcement;
  auto_renew?: boolean;
  cancel_at_period_end?: boolean;
  /** null clears a scheduled change. */
  pending_plan_version_id?: string | null;
  reason: string;
}

export interface SubscriptionOverride {
  id: string;
  subscription_id: string | null;
  feature_key: string;
  mode: ItemMode | null;
  inst_units_cap: number | null;
  inst_credits_cap: number | null;
  inst_cost_usd_cap: number | null;
  user_units_cap: number | null;
  user_credits_cap: number | null;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
  is_active: boolean;
}

export interface OverrideCreate {
  feature_key: string;
  mode: ItemMode | null;
  inst_units_cap: number | null;
  inst_credits_cap: number | null;
  inst_cost_usd_cap: number | null;
  user_units_cap: number | null;
  user_credits_cap: number | null;
  reason: string;
}

export interface SubscriptionEvent {
  id: string;
  subscription_id: string | null;
  institute_id: string | null;
  event_type: string;
  from_state: Record<string, unknown> | null;
  to_state: Record<string, unknown> | null;
  actor: string | null;
  reason: string | null;
  created_at: string | null;
}

export interface SimulationRow {
  feature_key: string;
  label: string | null;
  events: number;
  list_credits: number;
  included_credits: number;
  allowance_credits: number;
  charged_credits: number;
  real_cost_usd: number;
  /** Real cost of the part the plan would absorb (included + allowance share); null = not sent. */
  plan_cost_usd: number | null;
  over_cap_events: number;
  /** Uses that stayed charged because the model or role was not covered. */
  not_covered_events: number;
}

export interface SimulationResult {
  plan_version_id: string;
  institute_id: string;
  days: number;
  rows: SimulationRow[];
  /** Price over the window, INR (server figure when given, else price × days / period days). */
  revenue_inr: number;
  /** Real vendor cost of the work the plan would absorb (included + allowance), INR. */
  absorbed_cost_inr: number;
  real_cost_inr_total: number;
  margin_inr: number;
  inr_per_usd: number;
  /** True when the totals came from the server, false when computed here. */
  server_totals: boolean;
  /** The server stopped at its event limit: the replay covers only part of the window. */
  truncated: boolean;
  over_cap_events: number;
}

export interface PnlRow {
  institute_id: string;
  institute_name: string | null;
  subscription_id: string | null;
  plan_name: string | null;
  plan_key: string | null;
  version_no: number | null;
  enforcement: string | null;
  period_start: string | null;
  period_end: string | null;
  price_minor: number;
  payment_status: string | null;
  included_list_credits: number;
  included_cost_usd: number;
  allowance_used: number;
  allowance_cost_usd: number;
  charged_credits: number;
  real_cost_usd_total: number;
  /** Real cost of what the plan absorbed (included + allowance), INR. */
  plan_cost_inr: number;
  /** LIVE = actual plan decisions; SHADOW = what the plan would have done. */
  basis: string | null;
  margin_inr: number;
  /** REAL / ESTIMATED / MIXED: plan-paid uses without a vendor cost are estimated at list credits / 150. */
  cost_basis: string | null;
  /** Plan-paid uses whose cost is an estimate (no vendor cost recorded). */
  cost_estimated_events: number;
}

export interface PnlResponse {
  period: string;
  inr_per_usd: number;
  rows: PnlRow[];
}
