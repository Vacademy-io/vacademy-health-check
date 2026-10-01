import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type {
  BulkEnableApiAccessRequest,
  InstituteApiAccess,
  IssueApiKeyRequest,
  IssuedApiKey,
  UpdateApiAccessRequest,
} from "@/types/eval-api";

// Evaluation API access + keys on admin-core (spec §6.3, §10.7). Platform staff
// reach institutes only through these allowlisted super-admin endpoints.

const accessKey = (instituteId: string) => ["super-admin", "api-access", instituteId] as const;

function normalizeAccess(raw: Partial<InstituteApiAccess> | null | undefined): InstituteApiAccess {
  return {
    products: raw?.products ?? [],
    keys: raw?.keys ?? [],
    usage_30d: raw?.usage_30d ?? null,
    webhook_endpoints: raw?.webhook_endpoints ?? [],
    last_error: raw?.last_error ?? null,
  };
}

export function useInstituteApiAccess(
  instituteId: string,
  opts: { enabled?: boolean; staleTime?: number; retry?: boolean } = {}
) {
  return useQuery({
    queryKey: accessKey(instituteId),
    queryFn: async () => {
      const { data } = await api.get<Partial<InstituteApiAccess>>(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${encodeURIComponent(instituteId)}/api-access`
      );
      return normalizeAccess(data);
    },
    enabled: !!instituteId && (opts.enabled ?? true),
    staleTime: opts.staleTime,
    retry: opts.retry,
  });
}

export function useUpdateApiAccess(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ product, body }: { product: string; body: UpdateApiAccessRequest }) => {
      const { data } = await api.put(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${encodeURIComponent(instituteId)}/api-access/${encodeURIComponent(product)}`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKey(instituteId) }),
  });
}

export function useBulkEnableApiAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkEnableApiAccessRequest) => {
      const { data } = await api.post<Record<string, unknown> | null>(
        `${API_PREFIXES.ADMIN_CORE}/api-access/bulk-enable`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admin", "api-access"] }),
  });
}

/** Issue a key for the institute (vendor-led onboarding). The plaintext key is in this response only. */
export function useIssueApiKey(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: IssueApiKeyRequest) => {
      const { data } = await api.post<IssuedApiKey>(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${encodeURIComponent(instituteId)}/api-keys`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKey(instituteId) }),
  });
}

export function useRevokeApiKey(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.post(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${encodeURIComponent(instituteId)}/api-keys/${encodeURIComponent(keyId)}/revoke`
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKey(instituteId) }),
  });
}

/** Kill switch: revoke every key of the institute. */
export function useRevokeAllApiKeys(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.post<Record<string, unknown> | null>(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${encodeURIComponent(instituteId)}/api-keys/revoke-all`,
        { reason }
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accessKey(instituteId) }),
  });
}
