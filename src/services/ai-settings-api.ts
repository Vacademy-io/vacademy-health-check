import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type {
  AiSettingEntry,
  AiSettingsResponse,
  ToolPricingEntry,
  ToolPricingResponse,
  UseCaseDefaultsResponse,
} from "@/types/ai-settings";

const QUERY_KEY = ["super-admin", "ai-settings"] as const;
const DEFAULTS_KEY = ["super-admin", "ai-model-defaults"] as const;
const PRICING_KEY = ["super-admin", "tool-pricing"] as const;

/** ai_tool_pricing: what every metered tool charges, in credits. */
export function useToolPricing() {
  return useQuery({
    queryKey: PRICING_KEY,
    queryFn: async () => {
      const { data } = await api.get<ToolPricingResponse>(`${API_PREFIXES.AI}/tool-pricing`);
      return data;
    },
  });
}

export function useUpdateToolPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolKey,
      ...body
    }: {
      toolKey: string;
      flat_base_credits?: number;
      per_unit_credits?: number;
      params?: Record<string, unknown>;
      is_active?: boolean;
      /** Required by ai-service: written to ai_tool_pricing_history. */
      reason: string;
    }) => {
      const { data } = await api.put<ToolPricingEntry>(
        `${API_PREFIXES.AI}/tool-pricing/${encodeURIComponent(toolKey)}`,
        body
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRICING_KEY });
      // The global column of every institute's rate card, and the history, move with it.
      qc.invalidateQueries({ queryKey: ["super-admin", "institute-tool-pricing"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "tool-pricing-history"] });
    },
  });
}
/** The models registry router (ai-service /models/v2) — read-only here. */
const MODELS_PREFIX = "/ai-service/models/v2";

/**
 * ai_model_defaults: the default / fallback model per pipeline use case — read-only summary
 * for the AI Settings page. Writes moved to the Model defaults page
 * (services/model-defaults-api.ts): PATCH /ai-service/models/v2/defaults/{use_case} is
 * shadowed server-side and always 404s.
 */
export function useUseCaseDefaults() {
  return useQuery({
    queryKey: DEFAULTS_KEY,
    queryFn: async () => {
      const { data } = await api.get<UseCaseDefaultsResponse>(`${MODELS_PREFIX}/defaults`);
      return data;
    },
  });
}

export function useAiSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`);
      return data;
    },
  });
}

/** Set one setting. The server validates type/options and model ids against the registry. */
export function useUpdateAiSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | boolean | number | null }) => {
      const { data } = await api.put<AiSettingEntry>(
        `${API_PREFIXES.AI}/ai-settings/${encodeURIComponent(key)}`,
        { value }
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Remove the portal override so the environment default applies again. */
export function useResetAiSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data } = await api.delete<AiSettingEntry>(
        `${API_PREFIXES.AI}/ai-settings/${encodeURIComponent(key)}`
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
