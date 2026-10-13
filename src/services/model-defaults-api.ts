import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import type {
  BulkSetRequest,
  BulkSetResponse,
  BulkStagesRequest,
  BulkStagesResponse,
  ChangeLogResponse,
  ModelCatalogResponse,
  ModelOverridesResponse,
  UpdateStageRequest,
  UpdateUseCaseRequest,
  UseCaseEntry,
  VideoStagesResponse,
} from "@/types/model-defaults";

const MODELS = `${API_PREFIXES.AI}/models`;

const CATALOG_KEY = ["super-admin", "model-defaults", "catalog"] as const;
const STAGES_KEY = ["super-admin", "model-defaults", "stages"] as const;
const CHANGE_LOG_KEY = ["super-admin", "model-defaults", "change-log"] as const;
const OVERRIDES_KEY = ["super-admin", "model-defaults", "overrides"] as const;
/** The AI Settings page summary reads the same table. */
const LEGACY_DEFAULTS_KEY = ["super-admin", "ai-model-defaults"] as const;

/** Don't hammer a route that isn't deployed yet: a 404 is final, other errors retry once. */
const retryUnless404 = (count: number, err: unknown) => !isNotFound(err) && count < 1;

export function useModelCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async (): Promise<ModelCatalogResponse> => {
      const { data } = await api.get<Partial<ModelCatalogResponse>>(`${MODELS}/catalog`);
      return {
        use_cases: (Array.isArray(data?.use_cases) ? data.use_cases : []).map((u) => ({
          ...u,
          consumers: Array.isArray(u.consumers) ? u.consumers : [],
        })),
        models: Array.isArray(data?.models) ? data.models : [],
        routes: data?.routes && typeof data.routes === "object" ? data.routes : {},
        platform_default_model: data?.platform_default_model ?? "",
      };
    },
    retry: retryUnless404,
  });
}

function useInvalidateModelData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: CATALOG_KEY });
    qc.invalidateQueries({ queryKey: CHANGE_LOG_KEY });
    qc.invalidateQueries({ queryKey: LEGACY_DEFAULTS_KEY });
  };
}

/** PATCH one use case. Only present fields change; creates the row when missing (then default is required). */
export function useUpdateUseCaseModel() {
  const invalidate = useInvalidateModelData();
  return useMutation({
    mutationFn: async ({ useCase, ...body }: UpdateUseCaseRequest & { useCase: string }) => {
      const { data } = await api.patch<UseCaseEntry>(`${MODELS}/defaults/${encodeURIComponent(useCase)}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** POST bulk set. Call with dry_run=true first to get the diff, then again with dry_run=false. */
export function useBulkSetModel() {
  const invalidate = useInvalidateModelData();
  return useMutation({
    mutationFn: async (body: BulkSetRequest) => {
      const { data } = await api.post<BulkSetResponse>(`${MODELS}/defaults/bulk`, body);
      return {
        changes: Array.isArray(data?.changes) ? data.changes : [],
        held: Array.isArray(data?.held) ? data.held : [],
        applied: Boolean(data?.applied),
      } satisfies BulkSetResponse;
    },
    onSuccess: (res) => {
      if (res.applied) invalidate();
    },
  });
}

export function useVideoStages(useCase = "video", enabled = true) {
  return useQuery({
    queryKey: [...STAGES_KEY, useCase],
    queryFn: async (): Promise<VideoStagesResponse> => {
      const { data } = await api.get<Partial<VideoStagesResponse>>(`${MODELS}/stages`, { params: { use_case: useCase } });
      return {
        stages: Array.isArray(data?.stages) ? data.stages : [],
        tiers: Array.isArray(data?.tiers) ? data.tiers : [],
      };
    },
    retry: retryUnless404,
    enabled,
  });
}

function useInvalidateStages() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: STAGES_KEY });
    qc.invalidateQueries({ queryKey: CHANGE_LOG_KEY });
  };
}

export function useUpdateStage() {
  const invalidate = useInvalidateStages();
  return useMutation({
    mutationFn: async (body: UpdateStageRequest) => {
      const { data } = await api.patch<{ updated: number }>(`${MODELS}/stages`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useBulkStages() {
  const invalidate = useInvalidateStages();
  return useMutation({
    mutationFn: async (body: BulkStagesRequest) => {
      const { data } = await api.post<BulkStagesResponse>(`${MODELS}/stages/bulk`, body);
      return {
        changes: Array.isArray(data?.changes) ? data.changes : [],
        applied: Boolean(data?.applied),
      } satisfies BulkStagesResponse;
    },
    onSuccess: (res) => {
      if (res.applied) invalidate();
    },
  });
}

export function useModelChangeLog(useCase: string | null, enabled = true, limit = 50) {
  return useQuery({
    queryKey: [...CHANGE_LOG_KEY, { useCase, limit }],
    queryFn: async () => {
      const { data } = await api.get<Partial<ChangeLogResponse>>(`${MODELS}/change-log`, {
        params: { limit, use_case: useCase || undefined },
      });
      return Array.isArray(data?.entries) ? data.entries : [];
    },
    retry: retryUnless404,
    enabled,
  });
}

export function useModelOverrides() {
  return useQuery({
    queryKey: OVERRIDES_KEY,
    queryFn: async () => {
      const { data } = await api.get<Partial<ModelOverridesResponse>>(`${MODELS}/overrides`);
      return Array.isArray(data?.api_key_defaults) ? data.api_key_defaults : [];
    },
    retry: retryUnless404,
    staleTime: 60_000,
  });
}
