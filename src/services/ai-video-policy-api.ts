import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import { normalizeAiVideoPolicyResponse } from "@/lib/ai-video-policy";
import type { AiVideoPolicyResponse, UpdateAiVideoPolicyRequest } from "@/types/ai-video-policy";

const policyUrl = (instituteId: string) =>
  `${API_PREFIXES.AI}/institutes/${encodeURIComponent(instituteId)}/ai-video-policy`;

const policyKey = (instituteId: string) => ["super-admin", "ai-video-policy", instituteId] as const;

/** A 404 means the route isn't deployed yet: don't retry it; other errors retry once. */
const retryUnless404 = (count: number, err: unknown) => !isNotFound(err) && count < 1;

export function useAiVideoPolicy(instituteId: string) {
  return useQuery({
    queryKey: policyKey(instituteId),
    queryFn: async (): Promise<AiVideoPolicyResponse> => {
      const { data } = await api.get<unknown>(policyUrl(instituteId));
      return normalizeAiVideoPolicyResponse(data);
    },
    retry: retryUnless404,
    enabled: !!instituteId,
  });
}

/** PUT: absent fields keep their value; reason is required. Returns the same shape as GET. */
export function useUpdateAiVideoPolicy(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateAiVideoPolicyRequest) => {
      const { data } = await api.put<unknown>(policyUrl(instituteId), body);
      return normalizeAiVideoPolicyResponse(data);
    },
    onSuccess: (res) => {
      qc.setQueryData(policyKey(instituteId), res);
      qc.invalidateQueries({ queryKey: policyKey(instituteId) });
    },
  });
}

/** DELETE ?reason= — the institute goes back to the platform defaults. */
export function useResetAiVideoPolicy(instituteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.delete<unknown>(policyUrl(instituteId), { params: { reason } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: policyKey(instituteId) }),
  });
}
