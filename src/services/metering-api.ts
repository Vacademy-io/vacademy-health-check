import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import {
  HISTORY_V2_SETTING_KEY,
  normalizeCatalog,
  normalizeCatalogRow,
  normalizeCoverage,
  normalizeParity,
  normalizeRoleMap,
} from "@/lib/metering";
import type { AiSettingEntry, AiSettingsResponse } from "@/types/ai-settings";
import type {
  CatalogPatch,
  CoverageResponse,
  ParityRow,
  RoleMapPut,
  RoleMapResponse,
  RoleMapRow,
  UseCaseCatalogRow,
} from "@/types/metering";

const METERING = `${API_PREFIXES.AI}/metering`;

const METERING_KEY = ["super-admin", "metering"] as const;
/** Shared with services/ai-settings-api.ts so both pages see the same cached settings. */
const AI_SETTINGS_KEY = ["super-admin", "ai-settings"] as const;

/** A 404 (not deployed) or 403 (not a super admin) is final; other errors retry once. */
const retryUnlessFinal = (count: number, err: unknown) => {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return !isNotFound(err) && status !== 403 && count < 1;
};

export function useMeteringCoverage(days: number) {
  return useQuery({
    queryKey: [...METERING_KEY, "coverage", days],
    queryFn: async (): Promise<CoverageResponse> => {
      const { data } = await api.get<unknown>(`${METERING}/coverage`, { params: { days } });
      return normalizeCoverage(data);
    },
    retry: retryUnlessFinal,
  });
}

export function useMeteringParity(days: number) {
  return useQuery({
    queryKey: [...METERING_KEY, "parity", days],
    queryFn: async (): Promise<ParityRow[]> => {
      const { data } = await api.get<unknown>(`${METERING}/parity`, { params: { days } });
      return normalizeParity(data);
    },
    retry: retryUnlessFinal,
  });
}

export function useUseCaseCatalog() {
  return useQuery({
    queryKey: [...METERING_KEY, "catalog"],
    queryFn: async (): Promise<UseCaseCatalogRow[]> => {
      const { data } = await api.get<unknown>(`${METERING}/catalog`);
      return normalizeCatalog(data);
    },
    retry: retryUnlessFinal,
  });
}

export function useUpdateUseCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ useCase, ...body }: CatalogPatch & { useCase: string }): Promise<UseCaseCatalogRow> => {
      const { data } = await api.patch<unknown>(`${METERING}/catalog/${encodeURIComponent(useCase)}`, body);
      return normalizeCatalogRow(data);
    },
    // Labels feed the coverage table too.
    onSuccess: () => qc.invalidateQueries({ queryKey: METERING_KEY }),
  });
}

export function useRoleMap() {
  return useQuery({
    queryKey: [...METERING_KEY, "role-map"],
    queryFn: async (): Promise<RoleMapResponse> => {
      const { data } = await api.get<unknown>(`${METERING}/role-map`);
      return normalizeRoleMap(data);
    },
    retry: retryUnlessFinal,
  });
}

export function usePutRoleMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleName, ...body }: RoleMapPut & { roleName: string }): Promise<RoleMapRow> => {
      const { data } = await api.put<Partial<RoleMapRow>>(`${METERING}/role-map/${encodeURIComponent(roleName)}`, body);
      return {
        role_name: typeof data?.role_name === "string" ? data.role_name : roleName,
        role_class: typeof data?.role_class === "string" ? data.role_class : body.role_class,
        precedence: typeof data?.precedence === "number" ? data.precedence : body.precedence,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...METERING_KEY, "role-map"] }),
  });
}

/**
 * The History v2 rollout setting, read FRESH from the AI settings API (not the cache),
 * so the read-modify-write below starts from what the server holds right now.
 */
export async function fetchHistoryV2Setting(): Promise<AiSettingEntry | null> {
  const { data } = await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`);
  return data?.settings?.find((s) => s.key === HISTORY_V2_SETTING_KEY) ?? null;
}

export function useHistoryV2Setting() {
  return useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: async () => {
      const { data } = await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`);
      return data;
    },
    select: (data) => data?.settings?.find((s) => s.key === HISTORY_V2_SETTING_KEY) ?? null,
  });
}

/** Same endpoint AI Settings saves through; the value may be JSON text or an array (see serializeInstituteList). */
export function usePutHistoryV2Setting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: string | string[]): Promise<AiSettingEntry> => {
      const { data } = await api.put<AiSettingEntry>(
        `${API_PREFIXES.AI}/ai-settings/${encodeURIComponent(HISTORY_V2_SETTING_KEY)}`,
        { value }
      );
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AI_SETTINGS_KEY }),
  });
}
