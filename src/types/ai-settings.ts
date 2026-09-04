// Platform AI runtime settings (ai-service super-admin)

export type AiSettingType = "model" | "enum" | "bool" | "string";

export interface AiSettingEntry {
  key: string;
  group: "chatbot" | "voice" | "rollout" | string;
  group_label: string;
  label: string;
  description: string;
  type: AiSettingType;
  nullable: boolean;
  /** For "model" settings: which slice of the registry to offer. */
  catalog?: "llm" | "image";
  /** What a blank value means for nullable settings. */
  blank_label?: string;
  options: string[];
  value: string | boolean | null;
  default: string | boolean | null;
  /** What the ai-service replica that answered resolves right now (its cache). */
  effective?: string | boolean | null;
  /** "portal" when an operator set it here; "default" when the env default applies. */
  source: "portal" | "default";
  updated_by: string | null;
  updated_at: string | null;
}

export interface LlmModelOption {
  model_id: string;
  name: string;
  provider: string;
  tier: string;
  is_free: boolean;
}

export interface TtsProviderOption {
  id: string;
  label: string;
  note: string;
  /** False when the engine's credentials are missing on ai-service. */
  available: boolean;
  default_voice_example: string;
}

export interface AiSettingsCacheStatus {
  loaded: boolean;
  load_failed: boolean;
  last_error: string | null;
  age_seconds: number | null;
  loaded_at: string | null;
  ttl_seconds: number;
  override_keys: string[];
}

export interface ModelOption {
  model_id: string;
  name: string;
  provider: string;
  category: string;
  tier?: string | null;
  is_free: boolean;
}

export interface AiSettingsResponse {
  settings: AiSettingEntry[];
  catalog: {
    llm_models: LlmModelOption[];
    /** ai_models rows with category = image. */
    image_models?: LlmModelOption[];
    /** Every active model with its category (for the use-case defaults editor). */
    all_models?: ModelOption[];
    tts_providers: TtsProviderOption[];
  };
  cache?: AiSettingsCacheStatus;
}

/** One row of ai_model_defaults: the model each pipeline stage uses by default. */
export interface UseCaseDefault {
  use_case: string;
  default_model_id: string;
  fallback_model_id: string | null;
  free_tier_model_id: string | null;
  description: string | null;
}

export interface UseCaseDefaultsResponse {
  defaults: UseCaseDefault[];
}
