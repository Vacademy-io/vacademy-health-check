import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import { normalizeKey, normalizeKeysResponse, toNumber } from "@/lib/llm-keys";
import type {
  CreateLlmKeyRequest,
  LlmKeyView,
  LlmKeysResponse,
  TestLlmKeyResponse,
  UpdateLlmKeyRequest,
} from "@/types/llm-keys";

const KEYS = `${API_PREFIXES.AI}/llm/keys`;

const KEYS_KEY = ["super-admin", "llm-keys"] as const;

/** A 404 (not deployed) or 403 (not a super admin) is final; other errors retry once. */
const retryUnlessFinal = (count: number, err: unknown) => {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return !isNotFound(err) && status !== 403 && count < 1;
};

export function useLlmKeys(provider = "anthropic") {
  return useQuery({
    queryKey: [...KEYS_KEY, provider],
    queryFn: async (): Promise<LlmKeysResponse> => {
      const { data } = await api.get<unknown>(KEYS, { params: { provider } });
      return normalizeKeysResponse(data);
    },
    retry: retryUnlessFinal,
    // Spend counters move with traffic; a light poll keeps the bars honest while the page is open.
    refetchInterval: 60_000,
  });
}

function useInvalidateKeys() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS_KEY });
}

/** The secret goes out once in the body and is never stored client-side; the response carries only the hint. */
export function useCreateLlmKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (body: CreateLlmKeyRequest): Promise<LlmKeyView> => {
      const { data } = await api.post<unknown>(KEYS, body);
      return normalizeKey(data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateLlmKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateLlmKeyRequest & { id: string }): Promise<LlmKeyView> => {
      const { data } = await api.patch<unknown>(`${KEYS}/${encodeURIComponent(id)}`, body);
      return normalizeKey(data);
    },
    onSuccess: invalidate,
  });
}

/** One tiny Messages call with the key (backend: max_tokens 8, cheapest Claude model, 1 per key per 10 s). */
export function useTestLlmKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (id: string): Promise<TestLlmKeyResponse> => {
      const { data } = await api.post<Partial<TestLlmKeyResponse>>(`${KEYS}/${encodeURIComponent(id)}/test`, {});
      return {
        ok: data?.ok === true,
        latency_ms: data?.latency_ms === null || data?.latency_ms === undefined ? null : toNumber(data.latency_ms),
        model: typeof data?.model === "string" ? data.model : null,
        error: typeof data?.error === "string" ? data.error : null,
      };
    },
    // A test can flip status (auth_failed) or stamp last_used / last_error.
    onSettled: invalidate,
  });
}

export function useDeleteLlmKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.delete<{ deleted?: boolean }>(`${KEYS}/${encodeURIComponent(id)}`, { params: { reason } });
      return { deleted: data?.deleted !== false };
    },
    onSuccess: invalidate,
  });
}
