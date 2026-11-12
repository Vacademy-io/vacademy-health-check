// Command Center queries. Every call here hits an endpoint the portal already uses elsewhere;
// nothing new is needed on the backend for Phase 1.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { adminListQuotes } from "@/services/pricing-api";
import type { InstituteListItemDTO, LeadTag, SuperAdminPageResponse } from "@/types/api";

const KEY = ["super-admin", "command-center"] as const;
const TAGS: LeadTag[] = ["LEAD", "FREE_TRIAL", "PROD", "TEST"];

/** Quotes fetched for the pipeline and the demo list; enough for current volume (the UI says when it's capped). */
export const QUOTE_FETCH_LIMIT = 200;
/** Institutes tagged FREE_TRIAL listed on the Trials tab. */
export const TAGGED_TRIAL_LIMIT = 200;

async function instituteTotal(leadTag?: LeadTag): Promise<number> {
  const { data } = await api.get<SuperAdminPageResponse<InstituteListItemDTO>>(`${API_PREFIXES.ADMIN_CORE}/institutes`, {
    params: { page: 0, size: 1, leadTag },
  });
  return data.total_elements ?? 0;
}

/** Total institutes plus the count per lead tag (one size=1 page request each). */
export function useStageTotals() {
  return useQuery({
    queryKey: [...KEY, "stage-totals"],
    queryFn: async () => {
      const [total, ...perTag] = await Promise.all([instituteTotal(), ...TAGS.map((t) => instituteTotal(t))]);
      return { total, byTag: Object.fromEntries(TAGS.map((t, i) => [t, perTag[i]])) as Record<LeadTag, number> };
    },
    staleTime: 60_000,
  });
}

/** Recent quotes, newest first: pipeline counts and the demo workspaces they provisioned. */
export function useRecentQuotes() {
  return useQuery({
    queryKey: [...KEY, "quotes"],
    queryFn: () => adminListQuotes({ page: 0, size: QUOTE_FETCH_LIMIT }),
    staleTime: 60_000,
  });
}

/** Creation date of every institute (paged 500 at a time), for accounts-created-per-day. */
export function useAllInstituteDates() {
  return useQuery({
    queryKey: [...KEY, "institute-dates"],
    queryFn: async () => {
      const dates: string[] = [];
      for (let page = 0; page < 50; page++) {
        const { data } = await api.get<SuperAdminPageResponse<InstituteListItemDTO>>(`${API_PREFIXES.ADMIN_CORE}/institutes`, {
          params: { page, size: 500 },
        });
        for (const i of data.content ?? []) if (i.created_at) dates.push(i.created_at);
        if (page + 1 >= (data.total_pages ?? 0) || (data.content ?? []).length === 0) break;
      }
      return dates;
    },
    staleTime: 5 * 60_000,
  });
}

/** Institutes tagged FREE_TRIAL. */
export function useTaggedTrials() {
  return useQuery({
    queryKey: [...KEY, "tagged-trials"],
    queryFn: async () => {
      const { data } = await api.get<SuperAdminPageResponse<InstituteListItemDTO>>(`${API_PREFIXES.ADMIN_CORE}/institutes`, {
        params: { page: 0, size: TAGGED_TRIAL_LIMIT, leadTag: "FREE_TRIAL" },
      });
      return data;
    },
    staleTime: 60_000,
  });
}
