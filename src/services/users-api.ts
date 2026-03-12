import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { SuperAdminPageResponse, InstituteUserDTO } from "@/types/api";

export function useInstituteUsers(
  instituteId: string,
  page: number,
  size: number,
  role: string,
  search: string
) {
  return useQuery({
    queryKey: ["super-admin", "users", instituteId, { page, size, role, search }],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<InstituteUserDTO>>(
        `${API_PREFIXES.AUTH}/institutes/${instituteId}/users`,
        { params: { page, size, role: role || undefined, search: search || undefined } }
      );
      return data;
    },
    enabled: !!instituteId,
    placeholderData: keepPreviousData,
  });
}

export function useDeactivateUser(instituteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.put(
        `${API_PREFIXES.AUTH}/institutes/${instituteId}/users/${userId}/deactivate`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "users", instituteId] });
    },
  });
}
