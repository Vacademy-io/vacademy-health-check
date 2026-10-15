import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import {
  ENFORCE_SETTING_KEY,
  enforceSettingValue,
  normalizeAllRows,
  normalizeInstituteLimits,
  normalizeOverviewResponse,
  normalizeRow,
  normalizeUsage,
  resolveGlobalEnforce,
  splitRows,
} from "@/lib/limits";
import type { AiSettingsResponse } from "@/types/ai-settings";
import type {
  InstituteLimits,
  LimitRow,
  LimitRowCreate,
  LimitRowPatch,
  LimitUsageMeter,
  LimitsOverview,
  LimitsPolicyPut,
} from "@/types/limits";

const LIMITS = `${API_PREFIXES.AI}/metering/limits`;
const LIMITS_KEY = ["super-admin", "metering-limits"] as const;
/** Shared with services/ai-settings-api.ts and metering-api.ts: the raw AI settings response. */
const AI_SETTINGS_KEY = ["super-admin", "ai-settings"] as const;

const status = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

/** A 404 (not deployed) or 403 (not a super admin) is final; other errors retry once. */
const retryUnlessFinal = (count: number, err: unknown) => !isNotFound(err) && status(err) !== 403 && count < 1;

const inst = (id: string) => `${LIMITS}/${encodeURIComponent(id)}`;

export function useLimitsOverview() {
  return useQuery({
    queryKey: [...LIMITS_KEY, "overview"],
    queryFn: async (): Promise<LimitsOverview> => {
      const { data } = await api.get<unknown>(`${LIMITS}/overview`);
      return normalizeOverviewResponse(data);
    },
    retry: retryUnlessFinal,
  });
}

/**
 * Policy plus every row of one institute. The rows come from GET /rows; when that answers 404/405
 * the rows inside the policy response (tenant-style envelope) are used instead.
 */
export function useInstituteLimits(instituteId: string) {
  return useQuery({
    queryKey: [...LIMITS_KEY, "institute", instituteId],
    queryFn: async (): Promise<InstituteLimits> => {
      const [policyRes, rowsRes] = await Promise.allSettled([
        api.get<unknown>(`${inst(instituteId)}/policy`),
        api.get<unknown>(`${inst(instituteId)}/rows`, { params: { include_inactive: true } }),
      ]);
      if (policyRes.status === "rejected") {
        // No policy row may come back as 404 with a body; a 404 on BOTH calls means "not deployed".
        const rowsOk = rowsRes.status === "fulfilled";
        if (!(isNotFound(policyRes.reason) && rowsOk)) throw policyRes.reason;
      }
      const base = normalizeInstituteLimits(policyRes.status === "fulfilled" ? policyRes.value.data : null);
      if (rowsRes.status === "fulfilled") {
        const { tenant, platform } = splitRows(normalizeAllRows(rowsRes.value.data));
        return { ...base, rows: tenant, platform_rows: platform };
      }
      const s = status(rowsRes.reason);
      if (s === 404 || s === 405) return base;
      throw rowsRes.reason;
    },
    enabled: !!instituteId,
    retry: retryUnlessFinal,
  });
}

export function useLimitsUsage(instituteId: string, period: string) {
  return useQuery({
    queryKey: [...LIMITS_KEY, "usage", instituteId, period],
    queryFn: async (): Promise<LimitUsageMeter[]> => {
      const { data } = await api.get<unknown>(`${inst(instituteId)}/usage`, { params: { period } });
      return normalizeUsage(data);
    },
    enabled: !!instituteId,
    retry: retryUnlessFinal,
  });
}

function useInvalidateLimits(instituteId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...LIMITS_KEY, "institute", instituteId] });
    qc.invalidateQueries({ queryKey: [...LIMITS_KEY, "usage", instituteId] });
    qc.invalidateQueries({ queryKey: [...LIMITS_KEY, "overview"] });
  };
}

export function usePutLimitsPolicy(instituteId: string) {
  const invalidate = useInvalidateLimits(instituteId);
  return useMutation({
    mutationFn: async (body: LimitsPolicyPut): Promise<unknown> => {
      const { data } = await api.put<unknown>(`${inst(instituteId)}/policy`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCreateLimitRow(instituteId: string) {
  const invalidate = useInvalidateLimits(instituteId);
  return useMutation({
    mutationFn: async (body: LimitRowCreate): Promise<LimitRow | null> => {
      const { data } = await api.post<unknown>(`${inst(instituteId)}/rows`, body);
      return normalizeRow(data);
    },
    onSuccess: invalidate,
  });
}

export function usePatchLimitRow(instituteId: string) {
  const invalidate = useInvalidateLimits(instituteId);
  return useMutation({
    mutationFn: async ({ rowId, ...body }: LimitRowPatch & { rowId: string }): Promise<LimitRow | null> => {
      const { data } = await api.patch<unknown>(`${inst(instituteId)}/rows/${encodeURIComponent(rowId)}`, body);
      return normalizeRow(data);
    },
    onSuccess: invalidate,
  });
}

/** Soft delete on the server (is_active=false, effective_to=now()); the reason goes in the query string. */
export function useDeleteLimitRow(instituteId: string) {
  const invalidate = useInvalidateLimits(instituteId);
  return useMutation({
    mutationFn: async ({ rowId, reason }: { rowId: string; reason: string }): Promise<void> => {
      await api.delete(`${inst(instituteId)}/rows/${encodeURIComponent(rowId)}`, { params: { reason } });
    },
    onSuccess: invalidate,
  });
}

/** metering.limits.enforce from the AI settings list (read-only here; edited on the AI settings page). */
export function useEnforceSetting() {
  return useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: async () => {
      const { data } = await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`);
      return data;
    },
    select: (data) => data?.settings?.find((s) => s.key === ENFORCE_SETTING_KEY) ?? null,
  });
}

/** The global switch as ai-service applies it: the policy response's flag, else the setting, else on. */
export function useGlobalEnforce(fromPolicy: boolean | null | undefined) {
  const setting = useEnforceSetting();
  return resolveGlobalEnforce(fromPolicy ?? null, enforceSettingValue(setting.data));
}
