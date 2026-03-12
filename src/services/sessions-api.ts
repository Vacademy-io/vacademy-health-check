import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { SuperAdminPageResponse, InstituteSessionDTO } from "@/types/api";

export function useInstituteSessions(
  instituteId: string,
  page: number,
  size: number,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ["super-admin", "sessions", instituteId, { page, size, startDate, endDate }],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<InstituteSessionDTO>>(
        `${API_PREFIXES.AUTH}/institutes/${instituteId}/sessions`,
        { params: { page, size, startDate: startDate || undefined, endDate: endDate || undefined } }
      );
      return data;
    },
    enabled: !!instituteId,
    placeholderData: keepPreviousData,
  });
}
