import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { PlatformUsageSummary } from "@/types/api";

export function useUsageSummary(days: number = 30) {
  return useQuery({
    queryKey: ["super-admin", "usage-summary", days],
    queryFn: async () => {
      const { data } = await api.get<PlatformUsageSummary>(
        `${API_PREFIXES.AI}/usage-summary`,
        { params: { days } }
      );
      return data;
    },
  });
}
