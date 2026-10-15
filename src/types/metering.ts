// AI usage metering (ai-service /super-admin/v1/metering). Every AI charge and
// every free AI call writes one ai_usage_event row next to the credit ledger,
// tagged with a use case (ai_use_case_catalog) and the actor's role class
// (ai_role_class_map). This page checks that the metering keeps up with the
// ledger and edits the two lookup tables. Nothing here changes what anyone is
// charged.

/** Role classes a raw auth role can map to. SYSTEM / API_KEY / PUBLIC / UNKNOWN are actor kinds, never mapped. */
export type MappableRoleClass = "ADMIN" | "TEACHER" | "STAFF" | "PARENT" | "LEARNER";

/** One row of ai_use_case_catalog, as the super-admin catalog endpoint returns it. */
export interface UseCaseCatalogRow {
  use_case: string;
  feature_group: string;
  label: string;
  label_template: string | null;
  count_unit_label: string | null;
  model_use_case: string | null;
  legacy_request_types: string[];
  tool_keys: string[];
  capability_key: string | null;
  default_surface: string;
  actor_kind: string;
  unit_kind: string;
  billing_policy: string;
  plan_eligible: boolean;
  limit_eligible: boolean;
  is_active: boolean;
  display_order: number;
  updated_by: string | null;
  updated_at: string | null;
}

export interface CatalogResponse {
  use_cases: UseCaseCatalogRow[];
}

/** PATCH /catalog/{use_case}: only the fields being changed, plus the reason. */
export interface CatalogPatch {
  label?: string;
  label_template?: string | null;
  feature_group?: string;
  display_order?: number;
  is_active?: boolean;
  reason: string;
}

export interface RoleMapRow {
  role_name: string;
  /** Raw class; may be a value this portal does not know yet. */
  role_class: MappableRoleClass | string;
  precedence: number;
}

/** A raw role seen on events that has no row in ai_role_class_map (it counts as STAFF, precedence 35). */
export interface UnmappedRole {
  role_name: string;
  events: number;
}

export interface RoleMapResponse {
  roles: RoleMapRow[];
  unmapped: UnmappedRole[];
}

export interface RoleMapPut {
  role_class: MappableRoleClass;
  precedence: number;
  reason: string;
}

export interface CoverageByUseCase {
  use_case: string;
  events: number;
  credits: number;
}

export interface CoverageResponse {
  days: number;
  events: number;
  ledger_rows: number;
  ledger_without_event: number;
  /** Counts per use_case_source (EXPLICIT, TOOL_KEY, REQUEST_TYPE, UNKNOWN, BACKFILL …). */
  use_case_source: Record<string, number>;
  /** Counts per role_source (JWT, CALLER, AUTH_LOOKUP, CATALOG_DEFAULT, UNRESOLVED, BACKFILL). */
  role_source: Record<string, number>;
  unknown_use_case_events: number;
  null_actor_events: number;
  by_use_case: CoverageByUseCase[];
}

/** USAGE_DEDUCTION ledger rows vs CHARGED events for one IST day. */
export interface ParityRow {
  day: string;
  ledger_rows: number;
  ledger_credits: number;
  event_rows: number;
  event_credits: number;
  missing_events: number;
}

export interface ParityResponse {
  rows: ParityRow[];
}
