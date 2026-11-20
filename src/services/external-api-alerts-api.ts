import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { afterMarkRead, type Alerts, type MarkReadRequest } from "@/components/external-apis/alerts";

const ALERTS_QUERY = ["external-api-alerts"] as const;

/** A week of unread failures: long enough that a weekend's failures are still there on Monday. */
export const ALERT_HOURS = 168;

/** Unread failed calls to integrated vendors (admin-core), refreshed every minute. */
export function useApiAlerts() {
  return useQuery({
    queryKey: ALERTS_QUERY,
    queryFn: async () => {
      const { data } = await api.get<Alerts>(`${API_PREFIXES.ADMIN_CORE}/external-apis/alerts`, {
        params: { hours: ALERT_HOURS },
      });
      return data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Marks a kind (or everything) read for every admin. The bell clears at once; the next read
 * from admin-core confirms it, and brings back anything that failed again meanwhile.
 */
export function useMarkAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: MarkReadRequest) => {
      const { data } = await api.post<{ marked: number }>(`${API_PREFIXES.ADMIN_CORE}/external-apis/alerts/read`, req);
      return data;
    },
    onMutate: async (req) => {
      await queryClient.cancelQueries({ queryKey: ALERTS_QUERY });
      const before = queryClient.getQueryData<Alerts>(ALERTS_QUERY);
      if (before) queryClient.setQueryData<Alerts>(ALERTS_QUERY, afterMarkRead(before, req));
      return { before };
    },
    onError: (_err, _req, ctx) => {
      if (ctx?.before) queryClient.setQueryData(ALERTS_QUERY, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY }),
  });
}
