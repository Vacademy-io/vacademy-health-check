import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.GUIDES;

export interface GuideDto {
  id: string;
  title: string;
  fileId: string | null;
  fileUrl: string;
  routes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertGuidePayload {
  title: string;
  fileId?: string | null;
  fileUrl: string;
  routes: string[];
  active?: boolean;
}

/** Guides relevant to the current location (active only). */
export function guidesForRoute(guides: GuideDto[], pathname: string): GuideDto[] {
  return guides.filter((g) => g.active && g.routes.some((r) => pathname.startsWith(r)));
}

export function useGuides() {
  return useQuery({
    queryKey: ["guides"],
    queryFn: async () => (await api.get<GuideDto[]>(BASE)).data,
    staleTime: 60 * 1000,
  });
}

export function useCreateGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertGuidePayload) => (await api.post<GuideDto>(BASE, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useUpdateGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; payload: Partial<UpsertGuidePayload> }) =>
      (await api.put<GuideDto>(`${BASE}/${vars.id}`, vars.payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guides"] }),
  });
}

export function useDeleteGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guides"] }),
  });
}
