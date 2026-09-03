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
  options: string[];
  value: string | boolean | null;
  default: string | boolean | null;
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

export interface AiSettingsResponse {
  settings: AiSettingEntry[];
  catalog: {
    llm_models: LlmModelOption[];
    tts_providers: TtsProviderOption[];
  };
}
