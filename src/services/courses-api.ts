import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { SuperAdminPageResponse, InstituteCourseDTO } from "@/types/api";

export function useInstituteCourses(instituteId: string, page: number, size: number, search: string) {
  return useQuery({
    queryKey: ["super-admin", "courses", instituteId, { page, size, search }],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<InstituteCourseDTO>>(
        `${API_PREFIXES.ADMIN_CORE}/institutes/${instituteId}/courses`,
        { params: { page, size, search: search || undefined } }
      );
      return data;
    },
    enabled: !!instituteId,
    placeholderData: keepPreviousData,
  });
}
