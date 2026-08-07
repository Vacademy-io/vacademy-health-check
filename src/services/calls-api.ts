import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

export interface CallRow {
  id: string;
  correlation_id: string | null;
  institute_id: string | null;
  institute_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  tts_model: string | null;
  voice: string | null;
  /** The provider's own call id — quote this to Plivo. */
  provider_call_id: string | null;
  phone_number: string | null;
  customer_name: string | null;
  direction: string | null;
  status: string | null;
  disposition: string | null;
  call_start: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  has_recording: boolean | null;
  health: string | null;
  faults: string[] | null;
  /** The bot's diagnostics blob, as JSON text. */
  diagnostics: string | null;
  cost_inr: number | null;
  billed_inr: number | null;
  margin_inr: number | null;
  margin_pct: number | null;
  cost_breakdown: Record<string, number> | null;
  cost_is_modelled: boolean | null;
}

export interface CallSummary {
  calls: number;
  minutes: number;
  cost_inr: number;
  billed_inr: number;
  margin_inr: number;
  margin_pct: number | null;
  red: number;
  amber: number;
  green: number;
  with_recording: number;
  cost_breakdown: Record<string, number> | null;
  by_tts_model: Record<string, number> | null;
  cost_is_modelled: boolean | null;
}

export interface CallFilters {
  instituteId?: string;
  from?: string;
  to?: string;
  health?: string;
  disposition?: string;
  agentId?: string;
}

const clean = (f: CallFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));

export function useCalls(filters: CallFilters, page: number, size = 50) {
  return useQuery({
    queryKey: ["super-admin", "calls", filters, page, size],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls`, {
        params: { ...clean(filters), page, size },
      });
      return data as {
        content: CallRow[];
        page: number;
        size: number;
        total_elements: number;
        total_pages: number;
      };
    },
  });
}

export function useCallSummary(filters: CallFilters) {
  return useQuery({
    queryKey: ["super-admin", "calls-summary", filters],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls/summary`, {
        params: clean(filters),
      });
      return data as CallSummary;
    },
  });
}

/** The per-minute rates the costs were computed from, so the UI can show its work. */
export function useCallRateCard() {
  return useQuery({
    queryKey: ["super-admin", "calls-rate-card"],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls/rate-card`);
      return data as Record<string, number>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
