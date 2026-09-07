import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

/** One registered teacher voice or avatar (ai-service tutor_asset_registry). */
export interface TutorAsset {
  id: string;
  kind: "voice" | "avatar";
  provider: string;
  external_id: string | null;
  display_name: string;
  /** null = platform stock every institute may pick. */
  institute_id: string | null;
  institute_name?: string | null;
  status: "requested" | "processing" | "ready" | "failed" | "disabled";
  gender?: string | null;
  languages: string[];
  preview_url?: string | null;
  source_file_id?: string | null;
  consent: boolean;
  requested_by?: string | null;
  vendor_job_id?: string | null;
  credits_charged: number;
  error?: string | null;
  /** For avatar requests: the public URL of the teacher's photo. */
  notes?: string | null;
  created_at: string;
  updated_at: string;
  fulfilled_at?: string | null;
  stock: boolean;
}

export interface TutorAssetsResponse {
  assets: TutorAsset[];
  one_time_credits: { voice: number; avatar: number };
}

export interface TutorAssetFilters {
  kind?: "voice" | "avatar";
  status?: TutorAsset["status"];
  institute_id?: string;
  stock_only?: boolean;
}

const KEY = ["super-admin", "tutor-assets"] as const;

export function useTutorAssets(filters: TutorAssetFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const { data } = await api.get<TutorAssetsResponse>(`${API_PREFIXES.AI}/tutor-assets`, {
        params: { ...filters, limit: 1000 },
      });
      return data;
    },
    refetchInterval: 60_000,
  });
}

export interface TutorAssetCreate {
  kind: "voice" | "avatar";
  provider: string;
  external_id: string;
  display_name: string;
  institute_id?: string | null;
  gender?: string | null;
  languages?: string[];
  preview_url?: string | null;
  notes?: string | null;
}

export function useCreateTutorAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TutorAssetCreate) => {
      const { data } = await api.post<TutorAsset>(`${API_PREFIXES.AI}/tutor-assets`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface TutorAssetPatch {
  external_id?: string;
  display_name?: string;
  institute_id?: string | null;
  status?: TutorAsset["status"];
  gender?: string | null;
  languages?: string[];
  preview_url?: string | null;
  error?: string | null;
  notes?: string | null;
  /** Fulfilling an institute request charges the one-time fee unless false. */
  charge?: boolean;
}

export function usePatchTutorAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: TutorAssetPatch & { id: string }) => {
      const { data } = await api.patch<TutorAsset>(
        `${API_PREFIXES.AI}/tutor-assets/${encodeURIComponent(id)}`,
        body
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTutorAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${API_PREFIXES.AI}/tutor-assets/${encodeURIComponent(id)}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
