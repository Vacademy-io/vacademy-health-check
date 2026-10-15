// Direct-provider API keys (ai-service /super-admin/v1/llm/keys): the pool of
// Anthropic keys that serve models routed {"router": "anthropic"} in
// llm.model_routes, with each key's month-to-date metered spend. The secret
// itself never comes back — only `key_hint` (last 4 chars).

export type LlmKeyStatus = "active" | "disabled" | "auth_failed";

/** Month-to-date counters from llm_key_spend for `period_month`. */
export interface LlmKeyMonth {
  metered_usd: number;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface LlmKeyView {
  id: string;
  provider: string;
  label: string;
  org_label: string | null;
  key_hint: string;
  monthly_budget_usd: number;
  soft_limit_pct: number;
  weight: number;
  /** Raw status; may be a value this portal does not know yet. */
  status: LlmKeyStatus | string;
  cooldown_until: string | null;
  exhausted_until: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_used_at: string | null;
  created_at: string | null;
  created_by: string | null;
  month: LlmKeyMonth;
}

export interface AnthropicRoute {
  /** Registry / OpenRouter id, e.g. anthropic/claude-sonnet-4.5. */
  model_id: string;
  /** Anthropic API model id it is sent as, e.g. claude-sonnet-4-5. */
  wire_model: string;
}

export interface LlmKeysResponse {
  keys: LlmKeyView[];
  /** False = ai-service has no key-encryption secret, so it cannot store or use keys. */
  encryption_ready: boolean;
  anthropic_routes: AnthropicRoute[];
  /** "YYYY-MM-01" (UTC) — the month `month` counters cover. */
  period_month: string;
}

export interface CreateLlmKeyRequest {
  provider: "anthropic";
  label: string;
  org_label?: string | null;
  api_key: string;
  monthly_budget_usd?: number;
  soft_limit_pct?: number;
  weight?: number;
  reason: string;
}

export interface UpdateLlmKeyRequest {
  label?: string;
  org_label?: string | null;
  monthly_budget_usd?: number;
  soft_limit_pct?: number;
  weight?: number;
  /** 'active' also clears a cooldown, a budget stop and auth_failed. */
  status?: "active" | "disabled";
  reason: string;
}

export interface TestLlmKeyResponse {
  ok: boolean;
  latency_ms: number | null;
  model: string | null;
  error?: string | null;
}
