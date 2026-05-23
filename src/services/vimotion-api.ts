import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import type {
  CreateInviteCodeRequestPayload,
  InviteWaitlistRequestPayload,
  InviteWaitlistResponse,
  VimotionInviteCode,
  VimotionPagedResponse,
  VimotionRedemption,
  VimotionStats,
  VimotionWaitlistEntry,
} from "@/types/vimotion";

const BASE = "/auth-service/v1/vimotion/admin";

export function useVimotionWaitlist(params: {
  page: number;
  size: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["vimotion", "admin", "waitlist", params],
    queryFn: async () => {
      const { data } = await api.get<VimotionPagedResponse<VimotionWaitlistEntry>>(
        `${BASE}/waitlist`,
        {
          params: {
            page: params.page,
            size: params.size,
            status: params.status || undefined,
            search: params.search || undefined,
          },
        }
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useInviteWaitlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; payload: InviteWaitlistRequestPayload }) => {
      const { data } = await api.post<InviteWaitlistResponse>(
        `${BASE}/waitlist/${args.id}/invite`,
        args.payload
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "waitlist"] });
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "invite-codes"] });
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "stats"] });
    },
  });
}

export function useRejectWaitlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<VimotionWaitlistEntry>(
        `${BASE}/waitlist/${id}/reject`
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "waitlist"] });
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "stats"] });
    },
  });
}

export function useVimotionInviteCodes(params: {
  page: number;
  size: number;
  kind?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["vimotion", "admin", "invite-codes", params],
    queryFn: async () => {
      const { data } = await api.get<VimotionPagedResponse<VimotionInviteCode>>(
        `${BASE}/invite-codes`,
        {
          params: {
            page: params.page,
            size: params.size,
            kind: params.kind || undefined,
            status: params.status || undefined,
          },
        }
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateInviteCodeRequestPayload) => {
      const { data } = await api.post<VimotionInviteCode>(`${BASE}/invite-codes`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "invite-codes"] });
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "stats"] });
    },
  });
}

export function useRevokeInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<VimotionInviteCode>(`${BASE}/invite-codes/${id}/revoke`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "invite-codes"] });
      qc.invalidateQueries({ queryKey: ["vimotion", "admin", "stats"] });
    },
  });
}

export function useInviteCodeRedemptions(id: string | null) {
  return useQuery({
    queryKey: ["vimotion", "admin", "invite-codes", id, "redemptions"],
    queryFn: async () => {
      const { data } = await api.get<VimotionRedemption[]>(
        `${BASE}/invite-codes/${id}/redemptions`
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useVimotionStats() {
  return useQuery({
    queryKey: ["vimotion", "admin", "stats"],
    queryFn: async () => {
      const { data } = await api.get<VimotionStats>(`${BASE}/stats`);
      return data;
    },
    refetchInterval: 60_000,
  });
}
