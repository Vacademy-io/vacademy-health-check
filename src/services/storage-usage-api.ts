import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = `${API_PREFIXES.ADMIN_CORE}/usage`;

/**
 * Storage is a daily S3 Inventory snapshot; bandwidth is summed per day from the
 * CloudFront and S3 access logs. Both are written by admin-core's nightly metering job
 * (04:00 IST), so the screen is at most a day old and says so via `storage_as_of`.
 */
export interface InstituteUsageRow {
  institute_id: string;
  institute_name: string | null;
  storage_bytes: number;
  recording_bytes: number;
  bandwidth_bytes: number;
  bandwidth_requests: number;
  /** Our approximate monthly cost in INR at `rates`, not a price. */
  storage_cost_inr: number;
  bandwidth_cost_inr: number;
  total_cost_inr: number;
}

export interface PlatformUsage {
  storage_as_of: string | null;
  /** YYYY-MM of the bandwidth columns. */
  month: string;
  bandwidth_tracking_since: string | null;
  rates: { storage_usd_per_gb_month: number; bandwidth_usd_per_gb: number; usd_to_inr: number };
  institutes: InstituteUsageRow[];
  /** Files no institute could be traced to; null when there are none. */
  unassigned: InstituteUsageRow | null;
  totals: InstituteUsageRow;
}

export function useStorageBandwidth(month: string) {
  return useQuery({
    queryKey: ["super-admin", "storage-bandwidth", month],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/storage-bandwidth`, { params: { month } });
      return data as PlatformUsage;
    },
  });
}

/** Re-meters in the background (storage + one day of bandwidth); the nightly job does this anyway. */
export function useMeterNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date?: string) => {
      const { data } = await api.post(`${BASE}/meter`, null, { params: date ? { date } : {} });
      return data as { started: boolean; bandwidth_date?: string; reason?: string };
    },
    onSuccess: () => {
      // The run takes minutes; refetch later so the table picks it up.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["super-admin", "storage-bandwidth"] }), 120_000);
    },
  });
}
