import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.TRAINING_VIDEOS;

export interface TrainingVideoDto {
  id: string;
  title: string;
  description: string | null;
  fileId: string | null;
  fileUrl: string;
  /** Breadcrumb segments, e.g. ["LMS","Course creation","AI based course"]. */
  modulePath: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTrainingVideoPayload {
  title: string;
  description?: string | null;
  fileId?: string | null;
  fileUrl: string;
  modulePath: string[];
  active?: boolean;
}

export function useTrainingVideos() {
  return useQuery({
    queryKey: ["training-videos"],
    queryFn: async () => (await api.get<TrainingVideoDto[]>(BASE)).data,
    staleTime: 60 * 1000,
  });
}

export function useCreateTrainingVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertTrainingVideoPayload) =>
      (await api.post<TrainingVideoDto>(BASE, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-videos"] }),
  });
}

export function useUpdateTrainingVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; payload: Partial<UpsertTrainingVideoPayload> }) =>
      (await api.put<TrainingVideoDto>(`${BASE}/${vars.id}`, vars.payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-videos"] }),
  });
}

export function useDeleteTrainingVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-videos"] }),
  });
}