import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { AIPaginatedResponse, InstituteCreditItem } from "@/types/api";

export function useAllCredits(
  page: number,
  pageSize: number,
  sortBy: string = "current_balance",
  sortDirection: string = "ASC",
  search?: string
) {
  return useQuery({
    queryKey: ["super-admin", "credits", { page, pageSize, sortBy, sortDirection, search }],
    queryFn: async () => {
      const { data } = await api.get<AIPaginatedResponse<InstituteCreditItem>>(
        `${API_PREFIXES.AI}/credits/all`,
        { params: { page, page_size: pageSize, sort_by: sortBy, sort_direction: sortDirection, search: search || undefined } }
      );
      return data;
    },
    placeholderData: keepPreviousData,
  });
}
