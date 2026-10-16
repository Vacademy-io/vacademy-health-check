// Paid AI subscriptions, storefront listing and billing documents (V590).
// Tables (admin_core database): ai_plan listing columns, ai_storefront_audience,
// ai_storefront_institute, ai_subscription_charge, ai_subscription_mandate,
// platform_invoice, platform_credit_note.
//
// Read/write split, as in payments_design §7.3:
//   ai-service  /super-admin/v1/plans/**                      listing, audience, segments, storefront, billing timeline,
//                                                             queueing a payment link (admin_core's billing job sends it)
//   admin-core  /super-admin/v1/ai-plans-billing/institutes/{iid}/**  money: offline payment, waive, refund, mandates, documents

/** Who may see a listed plan on the storefront. */
export type AudienceMode = "ALL" | "ALLOWLIST" | "SEGMENT";
/** billing.storefront.mode (AI settings). */
export type StorefrontMode = "OFF" | "ALLOWLIST" | "SEGMENTS" | "ALL";
export type BrandMode = "VACADEMY" | "NEUTRAL";

export type ChargeKind = "PERIOD" | "UPGRADE";
export type ChargeStatus =
  | "DUE"
  | "LINK_SENT"
  | "DEBIT_SCHEDULED"
  | "PAID"
  | "FAILED"
  | "VOID"
  | "WAIVED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";
export type MandateMethod = "UPI" | "CARD" | "EMANDATE";
export type MandateStatus = "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED" | "REJECTED" | "EXPIRED";

/** ai_plan marketing columns. Price, allowance and period come from the frozen version. */
export interface PlanListing {
  listed: boolean;
  tagline: string | null;
  highlights: string[];
  badge: string | null;
  sort_order: number;
  audience_mode: AudienceMode;
}

export type PlanListingPatch = PlanListing & { reason: string };

export type AudienceRuleKind = "INCLUDE" | "EXCLUDE";

/**
 * One ai_storefront_audience row: an institute or a segment. plan_id null = storefront access.
 * EXCLUDE always wins over INCLUDE (and over the ALL modes).
 */
export interface AudienceRule {
  rule: AudienceRuleKind;
  institute_id: string | null;
  institute_name: string | null;
  segment_key: string | null;
}

/** PUT /plans/{id}/audience and PUT /storefront/audience (ai-service AudiencePut). */
export interface AudiencePutBody {
  institute_ids: string[];
  segments: string[];
  exclude_institute_ids: string[];
  exclude_segments: string[];
  reason: string;
}

/** Derived from GET /storefront/preview?institute_id= (the institute's catalogue, preview mode). */
export interface AudiencePreview {
  /** The plan is on the institute's plans page (listed, audience, published INR version). */
  offered: boolean;
  /** The institute's admins can open the plans page at all. */
  storefront_allowed: boolean;
  /** The plan's card is in the institute's catalogue (whether or not the page is open). */
  in_catalogue: boolean;
  why: string[];
}

/** ai_storefront_institute: per-institute switches written by super admins only. */
export interface StorefrontInstitute {
  institute_id: string;
  institute_name: string | null;
  /** null = follow billing.storefront.mode and the allowlist / segments. */
  storefront_enabled: boolean | null;
  /** null = resolved from the admin domain (custom admin domain = NEUTRAL). */
  brand_mode_override: BrandMode | null;
  /** What the server resolves now, when it says. */
  brand_mode: BrandMode | null;
  /** The server's verdict for this institute, when it says. */
  storefront_visible: boolean | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface StorefrontState {
  /** From the server when it reports it; the page falls back to the AI setting. */
  mode: StorefrontMode | null;
  audience: AudienceRule[];
  institutes: StorefrontInstitute[];
  /** ai_institute_segment: segment key -> member institute ids. */
  segment_members: Record<string, string[]>;
}

export interface StorefrontInstitutePut {
  storefront_enabled: boolean | null;
  brand_mode_override: BrandMode | null;
  reason: string;
}

/** ai_subscription_charge */
export interface SubscriptionCharge {
  id: string;
  subscription_id: string | null;
  kind: ChargeKind | string;
  status: ChargeStatus | string;
  service_start: string | null;
  service_end: string | null;
  plan_version_id: string | null;
  base_minor: number | null;
  tax_minor: number | null;
  total_minor: number | null;
  /** Sum of refunds so far, when the server reports it. */
  refunded_minor: number;
  place_of_supply: string | null;
  currency: string;
  platform_payment_id: string | null;
  vendor_payment_id: string | null;
  payment_link_url: string | null;
  link_expires_at: string | null;
  mandate_id: string | null;
  debit_attempts: number;
  next_attempt_at: string | null;
  pre_debit_notice_sent_at: string | null;
  period_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** ai_subscription_mandate (UPI Autopay / card / e-mandate token on the platform Razorpay account). */
export interface SubscriptionMandate {
  id: string;
  subscription_id: string | null;
  method: MandateMethod | string | null;
  status: MandateStatus | string;
  max_amount_minor: number | null;
  token_id: string | null;
  registration_link_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionBilling {
  charges: SubscriptionCharge[];
  mandates: SubscriptionMandate[];
}

export type BillingDocKind = "INVOICE" | "CREDIT_NOTE";

/** A tax invoice or a credit note, from the platform-billing documents list. */
export interface BillingDocument {
  id: string;
  doc_kind: BillingDocKind;
  number: string | null;
  /** CREDIT_PACK | AI_SUBSCRIPTION */
  item_kind: string | null;
  issued_at: string | null;
  currency: string;
  base_minor: number | null;
  tax_minor: number | null;
  total_minor: number | null;
  platform_payment_id: string | null;
  /** Credit notes: the invoice they reduce. */
  invoice_id: string | null;
  invoice_number: string | null;
  reason: string | null;
  buyer_legal_name: string | null;
  brand_mode: BrandMode | null;
  description: string | null;
}

export interface MarkPaidBody {
  /** Bank / UTR / cheque reference: becomes vendor_payment_id MANUAL:<reference> (unique). */
  reference: string;
  paid_at: string;
  amount_minor: number;
  reason: string;
}

export interface RefundBody {
  platform_payment_id: string;
  charge_id: string;
  amount_minor: number;
  reason: string;
}
