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
  /** Part of bandwidth_bytes served straight from S3 (billed per GB); the rest went through the flat-rate CDN. */
  bandwidth_s3_direct_bytes?: number;
  /** Our approximate monthly cost in INR at `rates`, not a price. */
  storage_cost_inr: number;
  bandwidth_cost_inr: number;
  total_cost_inr: number;
  /** The month against the institute's storage plan; null when it has none. */
  allowance?: AllowanceStatus | null;
}

/** An institute's storage and bandwidth plan: what is included and what each extra GB costs. */
export interface UsageAllowance {
  institute_id: string;
  included_storage_gb: number;
  included_bandwidth_gb: number;
  /** Per extra GB-month of storage, in `currency`. */
  storage_rate_per_gb: number;
  /** Per extra GB delivered, in `currency`. */
  bandwidth_rate_per_gb: number;
  /** CREDITS (taken from the wallet monthly) or a three-letter code (shown only, billed by hand). */
  currency: string;
  addon_storage_gb: number;
  addon_price_per_month: number;
  /** First month taken from the wallet (YYYY-MM); null for a shown-only plan. */
  charge_from_month: string | null;
  note: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export type UsageAllowanceInput = Pick<
  UsageAllowance,
  | "included_storage_gb"
  | "included_bandwidth_gb"
  | "storage_rate_per_gb"
  | "bandwidth_rate_per_gb"
  | "currency"
  | "addon_storage_gb"
  | "addon_price_per_month"
  | "charge_from_month"
  | "note"
>;

/** One month taken from the wallet (or that failed and is retried daily). */
export interface UsageCharge {
  institute_id: string;
  month: string;
  status: "CHARGED" | "FAILED" | string;
  credits: number;
  storage_average_bytes: number;
  storage_extra_bytes: number;
  bandwidth_bytes: number;
  bandwidth_extra_bytes: number;
  addon_credits: number;
  error: string | null;
  updated_at: string | null;
}

/** One month against the plan: storage is the month's average, bandwidth the month's total. */
export interface AllowanceStatus {
  month: string;
  included_storage_gb: number;
  included_bandwidth_gb: number;
  storage_rate_per_gb: number;
  bandwidth_rate_per_gb: number;
  currency: string;
  addon_storage_gb: number;
  addon_price: number;
  charged_to_wallet: boolean;
  charge_from_month: string | null;
  storage_snapshot_days: number;
  storage_average_bytes: number;
  storage_extra_bytes: number;
  bandwidth_bytes: number;
  bandwidth_extra_bytes: number;
  storage_charge: number;
  bandwidth_charge: number;
  total_charge: number;
}

export interface AllowanceView {
  allowance: UsageAllowance | null;
  charges?: UsageCharge[];
  current_month?: AllowanceStatus;
  previous_month?: AllowanceStatus;
}

export interface PlatformUsage {
  storage_as_of: string | null;
  /** YYYY-MM of the bandwidth columns. */
  month: string;
  bandwidth_tracking_since: string | null;
  rates: { storage_usd_per_gb_month: number; bandwidth_usd_per_gb: number; cdn_usd_per_gb?: number; usd_to_inr: number };
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

const ALLOWANCE_KEY = ["super-admin", "usage-allowance"] as const;
const allowanceUrl = (instituteId: string) => `${BASE}/institutes/${encodeURIComponent(instituteId)}/allowance`;

/** One institute's storage plan with this month and last month (allowance null = no plan). */
export function useUsageAllowance(instituteId: string) {
  return useQuery({
    queryKey: [...ALLOWANCE_KEY, instituteId],
    queryFn: async () => (await api.get<AllowanceView>(allowanceUrl(instituteId))).data,
    enabled: !!instituteId,
  });
}

function useInvalidateAllowance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ALLOWANCE_KEY });
    qc.invalidateQueries({ queryKey: ["super-admin", "storage-bandwidth"] });
  };
}

export function useSaveUsageAllowance(instituteId: string) {
  const invalidate = useInvalidateAllowance();
  return useMutation({
    mutationFn: async (body: UsageAllowanceInput) => (await api.put<AllowanceView>(allowanceUrl(instituteId), body)).data,
    onSuccess: invalidate,
  });
}

export function useRemoveUsageAllowance(instituteId: string) {
  const invalidate = useInvalidateAllowance();
  return useMutation({
    mutationFn: async () => (await api.delete<{ removed: boolean }>(allowanceUrl(instituteId))).data,
    onSuccess: invalidate,
  });
}

/** An amount in the plan currency, e.g. ₹1,250.50. */
export function money(amount: number, currency: string): string {
  if (currency === "CREDITS") return `${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} credits`;
  try {
    return amount.toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 2 });
  } catch {
    return `${currency} ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
}
