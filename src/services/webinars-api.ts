import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.WEBINARS;
const KEY = ["webinars"];

/** Times are ISO-8601 instants in UTC; show them in the viewer's own time zone. */
export interface WebinarDto {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  /** Link admins open to join; null until added. */
  joinUrl: string | null;
  /** Recording (S3 upload or any video link); null until added. */
  recordingUrl: string | null;
  recordingFileId: string | null;
  /** false = hidden from institute admins. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** On update the API leaves a missing field as it is; an empty string clears description / links. */
export interface UpsertWebinarPayload {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  joinUrl: string;
  recordingUrl: string;
  recordingFileId: string | null;
  active: boolean;
}

export type WebinarPhase = "live" | "upcoming" | "past";

/** Same rule as the admin dashboard's Webinars panel: LIVE from start until end. */
export function webinarPhase(w: Pick<WebinarDto, "startsAt" | "endsAt">, now = Date.now()): WebinarPhase {
  const start = Date.parse(w.startsAt);
  const end = Date.parse(w.endsAt);
  if (now >= end) return "past";
  if (now >= start) return "live";
  return "upcoming";
}

export function useWebinars() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<WebinarDto[]>(BASE)).data,
    staleTime: 60 * 1000,
  });
}

export function useCreateWebinar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertWebinarPayload) => (await api.post<WebinarDto>(BASE, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWebinar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; payload: Partial<UpsertWebinarPayload> }) =>
      (await api.put<WebinarDto>(`${BASE}/${vars.id}`, vars.payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWebinar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
