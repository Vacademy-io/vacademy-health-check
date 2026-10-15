// Model defaults (ai-service /super-admin/v1/models/*): which model every AI
// feature uses by default, the video pipeline's per-stage models, and the
// change log behind them. DECIMALs (prices) arrive as strings.

/** "image" = an image-generation use case (reads only its default model). */
export type UseCaseKind = "chat" | "vision" | "image";

/** One row of ai_model_defaults as the catalog returns it. */
export interface UseCaseRow {
  default_model_id: string;
  fallback_model_id: string | null;
  free_tier_model_id: string | null;
  updated_at: string | null;
}

export interface ChangeLogEntry {
  id: string | number;
  table_name: string;
  row_key: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  actor: string | null;
  created_at: string;
}

export interface UseCaseEntry {
  use_case: string;
  label: string;
  /** e.g. 'Learner AI', 'Content & courses', 'Assessment & evaluation', 'Video', 'Admin & CRM', 'Platform'. */
  group: string;
  service: string;
  kind: UseCaseKind;
  description: string;
  /** "file:line" strings of the code that reads this use case. */
  consumers: string[];
  /** When set, a bulk "set all" skips this use case. */
  held_reason: string | null;
  /** null = no ai_model_defaults row; the code then falls back to the platform default (GLM). */
  row: UseCaseRow | null;
  last_change: ChangeLogEntry | null;
}

export interface ModelOption {
  model_id: string;
  name: string;
  provider: string;
  category: string;
  input_price_per_1m: string | null;
  output_price_per_1m: string | null;
  is_active: boolean;
}

export interface ModelCatalogResponse {
  use_cases: UseCaseEntry[];
  models: ModelOption[];
  /** llm.model_routes, e.g. {"z-ai/glm-5.3-flash": "isoquant"}. Absent = OpenRouter. */
  routes: Record<string, string>;
  platform_default_model: string;
}

export interface UpdateUseCaseRequest {
  default_model_id?: string;
  /** Explicit null clears it. */
  fallback_model_id?: string | null;
  free_tier_model_id?: string | null;
  reason: string;
}

export interface BulkSetRequest {
  model_id: string;
  fallback_model_id?: string | null;
  /** Omit = every use case that is not held. */
  use_cases?: string[];
  dry_run: boolean;
  reason: string;
}

export interface BulkChange {
  use_case: string;
  field: string;
  old: string | null;
  new: string | null;
}

export interface BulkSetResponse {
  changes: BulkChange[];
  held: { use_case: string; reason: string }[];
  applied: boolean;
}

export interface VideoStage {
  stage_id: string;
  label: string;
  quality_tier: string;
  model_id: string;
  fallback_model_id: string | null;
  user_overridable: boolean;
  is_active: boolean;
  updated_at: string | null;
}

export interface VideoStagesResponse {
  stages: VideoStage[];
  tiers: string[];
}

export interface UpdateStageRequest {
  use_case: string;
  stage_id: string;
  /** ['*'] = every tier. */
  quality_tiers: string[];
  model_id: string;
  reason: string;
}

export interface BulkStagesRequest {
  use_case: string;
  model_id: string;
  dry_run: boolean;
  reason: string;
}

export interface BulkStagesResponse {
  changes: { quality_tier: string; stage_id: string; old: string | null; new: string | null }[];
  applied: boolean;
}

export interface ChangeLogResponse {
  entries: ChangeLogEntry[];
}

export interface ApiKeyDefaultRow {
  id: string;
  institute_id: string | null;
  user_id: string | null;
  default_model: string | null;
  /** True when the customer brought their own provider key — their own choice, not ours. */
  has_own_key: boolean;
}

export interface ModelOverridesResponse {
  api_key_defaults: ApiKeyDefaultRow[];
}
