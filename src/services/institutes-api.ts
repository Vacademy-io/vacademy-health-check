import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type {
  SuperAdminPageResponse,
  InstituteListItemDTO,
  InstituteDetailSummaryDTO,
  GrantCreditsRequest,
  LeadTag,
} from "@/types/api";

export function useInstitutes(
  page: number,
  size: number,
  search: string,
  leadTag?: string,
  sortBy?: string,
  sortDirection?: "ASC" | "DESC"
) {
  return useQuery({
    queryKey: ["super-admin", "institutes", { page, size, search, leadTag, sortBy, sortDirection }],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<InstituteListItemDTO>>(
        `${API_PREFIXES.ADMIN_CORE}/institutes`,
        {
          params: {
            page,
            size,
            search: search || undefined,
            leadTag: leadTag || undefined,
            sortBy: sortBy || undefined,
            sortDirection: sortDirection || undefined,
          },
        }
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useInstituteDetail(id: string) {
  return useQuery({
    queryKey: ["super-admin", "institutes", id],
    queryFn: async () => {
      const { data } = await api.get<InstituteDetailSummaryDTO>(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${id}`
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useGrantCredits(instituteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GrantCreditsRequest) => {
      await api.post(`${API_PREFIXES.ADMIN_CORE}/institutes/${instituteId}/grant-credits`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "institutes", instituteId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "credits"] });
    },
  });
}

export function useDeductCredits(instituteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GrantCreditsRequest) => {
      await api.post(`${API_PREFIXES.ADMIN_CORE}/institutes/${instituteId}/deduct-credits`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "institutes", instituteId] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "credits"] });
    },
  });
}

export function useUpdateLeadTag(instituteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadTag: LeadTag) => {
      await api.put(`${API_PREFIXES.ADMIN_CORE}/institutes/${instituteId}/lead-tag`, {
        lead_tag: leadTag,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "institutes"] });
    },
  });
}

export function useBulkUpdateLeadTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ instituteIds, leadTag }: { instituteIds: string[]; leadTag: LeadTag }) => {
      await Promise.all(
        instituteIds.map((id) =>
          api.put(`${API_PREFIXES.ADMIN_CORE}/institutes/${id}/lead-tag`, {
            lead_tag: leadTag,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "institutes"] });
    },
  });
}
