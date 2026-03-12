import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { PlatformDashboardDTO, CrossInstituteActiveUsersDTO, PlatformActivityTrendDTO } from "@/types/api";

export function usePlatformDashboard() {
  return useQuery({
    queryKey: ["super-admin", "dashboard"],
    queryFn: async () => {
      const { data } = await api.get<PlatformDashboardDTO>(`${API_PREFIXES.ADMIN_CORE}/dashboard`);
      return data;
    },
  });
}

export function useActiveUsers() {
  return useQuery({
    queryKey: ["super-admin", "active-users"],
    queryFn: async () => {
      const { data } = await api.get<CrossInstituteActiveUsersDTO>(`${API_PREFIXES.AUTH}/active-users`);
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useActivityTrends(days: number = 7) {
  return useQuery({
    queryKey: ["super-admin", "activity-trends", days],
    queryFn: async () => {
      const { data } = await api.get<PlatformActivityTrendDTO>(`${API_PREFIXES.AUTH}/activity-trends`, {
        params: { days },
      });
      return data;
    },
  });
}
