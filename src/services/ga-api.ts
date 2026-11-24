import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import type { GaReport } from "../../server/ga-report";

export type { GaReport, GaProductReport, GaDay, GaSplitRow, GaSourceRow, GaTotals } from "../../server/ga-report";

/** Google Analytics for every product site, via the portal's own /ga-api route (server-side key). */
/** GA report for the last `days` days, or for an exact from → to range (YYYY-MM-DD, inclusive). */
export function useGaReport(days: number, range?: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ["super-admin", "command-center", "ga", days, range?.from ?? null, range?.to ?? null],
    queryFn: async () => (await api.get<GaReport>("/ga-api/v1/report", { params: range ? { days, from: range.from, to: range.to } : { days } })).data,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
