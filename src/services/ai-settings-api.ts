import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { AiSettingEntry, AiSettingsResponse } from "@/types/ai-settings";

const QUERY_KEY = ["super-admin", "ai-settings"] as const;

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
    mutationFn: async ({ key, value }: { key: string; value: string | boolean | null }) => {
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
