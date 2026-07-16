import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.ROADMAP;

export interface RoadmapDto {
  htmlContent: string;
  updatedAt: string | null;
}

export function useRoadmap() {
  return useQuery({
    queryKey: ["roadmap"],
    queryFn: async () => (await api.get<RoadmapDto>(BASE)).data,
  });
}

export function useUpdateRoadmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (htmlContent: string) =>
      (await api.put<RoadmapDto>(BASE, { htmlContent })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roadmap"] }),
  });
}
