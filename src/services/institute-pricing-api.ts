import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { normalizeHistory, normalizeInstitutePricing, normalizeOverrides } from "@/lib/eval-api-pricing";
import type {
  SetInstituteToolPricingRequest,
  SetInstituteToolPricingResponse,
} from "@/types/eval-api";

// Per-institute tool pricing on ai-service (spec §10.7). An override is one open
// institute_tool_pricing row; an edit closes it and inserts a new one, so the
// table is its own history. Every write needs a reason (contract reference).

const instituteKey = (instituteId: string) => ["super-admin", "institute-tool-pricing", instituteId] as const;
const HISTORY_KEY = ["super-admin", "tool-pricing-history"] as const;
const OVERRIDES_KEY = ["super-admin", "tool-pricing-overrides"] as const;

export function useInstituteToolPricing(instituteId: string) {
  return useQuery({
    queryKey: instituteKey(instituteId),
    queryFn: async () => {
      const { data } = await api.get<unknown>(
        `${API_PREFIXES.AI}/institutes/${encodeURIComponent(instituteId)}/tool-pricing`
      );
      return normalizeInstitutePricing(data);
    },
    enabled: !!instituteId,
  });
}

function useInvalidatePricing(instituteId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: instituteKey(instituteId) });
    qc.invalidateQueries({ queryKey: HISTORY_KEY });
    qc.invalidateQueries({ queryKey: OVERRIDES_KEY });
  };
}

/** Create or replace the institute's override for one tool. */
export function useSetInstituteToolPricing(instituteId: string) {
  const invalidate = useInvalidatePricing(instituteId);
  return useMutation({
    mutationFn: async ({ toolKey, body }: { toolKey: string; body: SetInstituteToolPricingRequest }) => {
      const { data } = await api.put<SetInstituteToolPricingResponse>(
        `${API_PREFIXES.AI}/institutes/${encodeURIComponent(instituteId)}/tool-pricing/${encodeURIComponent(toolKey)}`,
        body
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/** End the override; the institute pays the global rate again. */
export function useRevertInstituteToolPricing(instituteId: string) {
  const invalidate = useInvalidatePricing(instituteId);
  return useMutation({
    mutationFn: async ({ toolKey, reason }: { toolKey: string; reason: string }) => {
      await api.delete(
        `${API_PREFIXES.AI}/institutes/${encodeURIComponent(instituteId)}/tool-pricing/${encodeURIComponent(toolKey)}`,
        { params: { reason } }
      );
    },
    onSuccess: invalidate,
  });
}

/** Global edits plus override rows for a tool, optionally narrowed to one institute. */
export function useToolPricingHistory(toolKey: string | null, instituteId?: string, enabled = true) {
  return useQuery({
    queryKey: [...HISTORY_KEY, { toolKey, instituteId }],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.AI}/tool-pricing/history`, {
        params: { tool_key: toolKey || undefined, institute_id: instituteId || undefined },
      });
      return normalizeHistory(data);
    },
    enabled: enabled && !!toolKey,
  });
}

/** Institutes with an active override (all tools when toolKey is omitted). */
export function useToolPricingOverrides(toolKey?: string) {
  return useQuery({
    queryKey: [...OVERRIDES_KEY, { toolKey: toolKey ?? null }],
    queryFn: async () => {
      const { data } = await api.get<unknown>(`${API_PREFIXES.AI}/tool-pricing/overrides`, {
        params: { tool_key: toolKey || undefined },
      });
      return normalizeOverrides(data);
    },
    staleTime: 60_000,
  });
}
