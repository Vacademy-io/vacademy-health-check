import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { GaReport } from "../../server/ga-report";

export type { GaReport, GaProductReport, GaDay, GaSplitRow, GaTotals } from "../../server/ga-report";

/** Google Analytics for every product site, via the portal's own /ga-api route (server-side key). */
export function useGaReport(days: number) {
  return useQuery({
    queryKey: ["super-admin", "command-center", "ga", days],
    queryFn: async () => (await api.get<GaReport>("/ga-api/v1/report", { params: { days } })).data,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
