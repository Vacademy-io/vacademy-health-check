import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type {
  AiSettingEntry,
  AiSettingsResponse,
  ToolPricingEntry,
  ToolPricingResponse,
  UseCaseDefault,
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
      is_active?: boolean;
    }) => {
      const { data } = await api.put<ToolPricingEntry>(
        `${API_PREFIXES.AI}/tool-pricing/${encodeURIComponent(toolKey)}`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICING_KEY }),
  });
}
/** The models registry router (ai-service /models/v2) — root admin for writes. */
const MODELS_PREFIX = "/ai-service/models/v2";

/** ai_model_defaults: the default / fallback model per pipeline use case. */
export function useUseCaseDefaults() {
  return useQuery({
    queryKey: DEFAULTS_KEY,
    queryFn: async () => {
      const { data } = await api.get<UseCaseDefaultsResponse>(`${MODELS_PREFIX}/defaults`);
      return data;
    },
  });
}

export function useUpdateUseCaseDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      useCase,
      ...body
    }: {
      useCase: string;
      default_model_id?: string;
      fallback_model_id?: string | null;
    }) => {
      const { data } = await api.patch<UseCaseDefault>(
        `${MODELS_PREFIX}/defaults/${encodeURIComponent(useCase)}`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFAULTS_KEY }),
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
