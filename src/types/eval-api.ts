// Per-institute tool pricing (ai-service) and the Evaluation API access/keys
// (admin-core). Shapes follow docs/AI_EVALUATION_PUBLIC_API.md §10.7 in the
// vacademy_platform repo. Tool-key constants live in lib/eval-api-pricing.ts.

/** A rate as ai-service resolves it (global row, override or effective). */
export interface ToolRate {
  flat: number | null;
  per_unit: number | null;
  unit_field?: string;
  params?: Record<string, unknown> | null;
  no_token_overage?: boolean;
}

export interface ToolPricingOverride {
  id: string;
  flat: number | null;
  per_unit: number | null;
  params: Record<string, unknown> | null;
  no_token_overage: boolean;
  effective_from: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
}

/** One row of GET /institutes/{id}/tool-pricing. */
export interface InstituteToolPricingRow {
  tool_key: string;
  label: string;
  global: ToolRate;
  override: ToolPricingOverride | null;
  effective: ToolRate;
  /** "override:<id>" | "partner:<id>" | "global" | "default" */
  source: string;
}

export interface SetInstituteToolPricingRequest {
  /** Omitted = inherit the global value. */
  flat_base_credits?: number;
  per_unit_credits?: number;
  params?: Record<string, unknown>;
  no_token_overage?: boolean;
  reason: string;
}

export interface SetInstituteToolPricingResponse {
  effective: ToolRate;
  examples?: Array<Record<string, number>>;
}

/** An entry of GET /tool-pricing/history, normalised (global edits and override rows). */
export interface PricingHistoryEntry {
  id: string;
  scope: "global" | "override";
  tool_key: string;
  institute_id: string | null;
  flat: number | null;
  per_unit: number | null;
  params: Record<string, unknown> | null;
  no_token_overage: boolean | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string | null;
  /** Override rows: when the row was replaced or reverted (null = still open). */
  effective_to: string | null;
  ended_by: string | null;
}

/** An institute with an active override (GET /tool-pricing/overrides), normalised. */
export interface ActiveOverride {
  institute_id: string;
  tool_key: string;
  id: string | null;
  flat: number | null;
  per_unit: number | null;
  no_token_overage: boolean;
  effective_from: string | null;
  reason: string | null;
  created_by: string | null;
}

// ── Evaluation API access (admin-core) ──────────────────────────────────────

export type ApiSegment = "school" | "university" | "upsc";
export type RateTier = "standard" | "high" | "custom";

export interface ApiAccessProduct {
  product: string;
  enabled: boolean;
  segment: ApiSegment | null;
  rate_tier: RateTier | string;
  daily_copy_quota: number;
  daily_identify_pages: number;
  daily_rubric_generations: number;
  copy_lane_cap: number | null;
  typed_lane_cap: number | null;
  credit_limit: number;
  fire_workflow_events: boolean;
  notes?: string | null;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_by: string | null;
  created_at: string | null;
  last_used_at: string | null;
  status: "ACTIVE" | "REVOKED" | string;
  expires_at?: string | null;
}

/** null = admin-core has no figure for it yet ("unknown", not 0). */
export interface ApiUsage30d {
  copies: number | null;
  typed: number | null;
  identify_pages: number | null;
  credits: number | null;
}

export interface WebhookEndpointHealth {
  url: string;
  status: string;
  failing_since: string | null;
}

export interface InstituteApiAccess {
  products: ApiAccessProduct[];
  keys: ApiKeySummary[];
  usage_30d: ApiUsage30d | null;
  webhook_endpoints: WebhookEndpointHealth[];
  last_error: string | null;
}

export interface UpdateApiAccessRequest {
  enabled: boolean;
  segment: ApiSegment | null;
  rate_tier: string;
  daily_copy_quota: number;
  daily_identify_pages: number;
  daily_rubric_generations: number;
  copy_lane_cap: number | null;
  typed_lane_cap: number | null;
  credit_limit: number;
  fire_workflow_events: boolean;
  notes: string | null;
  reason: string;
}

export interface BulkEnableApiAccessRequest {
  institute_ids: string[];
  product: string;
  segment: ApiSegment | null;
  reason: string;
}

export interface IssueApiKeyRequest {
  name: string;
  scopes: string[];
  expires_at?: string | null;
  daily_copy_cap?: number | null;
}

/** The only response that carries the plaintext key. */
export interface IssuedApiKey {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
}
