import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { CreditUsageLive, PlatformUsageSummary } from "@/types/api";

/** A window is either sub-day (`hours`) or multi-day (`days`) — never both. */
export interface UsageWindow {
  days?: number;
  hours?: number;
}

export function useUsageSummary(window: UsageWindow = { days: 30 }) {
  return useQuery({
    queryKey: ["super-admin", "usage-summary", window],
    queryFn: async () => {
      const { data } = await api.get<PlatformUsageSummary>(
        `${API_PREFIXES.AI}/usage-summary`,
        { params: { days: window.days, hours: window.hours } }
      );
      return data;
    },
  });
}

/** Platform credit burn over the last hour and last 24h. Refreshes on its own. */
export function useCreditUsageLive() {
  return useQuery({
    queryKey: ["super-admin", "credit-usage-live"],
    queryFn: async () => {
      const { data } = await api.get<CreditUsageLive>(
        `${API_PREFIXES.AI}/credit-usage-live`
      );
      return data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
