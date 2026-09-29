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
  /** Extra words admins might search with (synonyms, Hinglish, old names). Absent from older APIs. */
  keywords?: string[];
  /** Step number inside its section (1, 2, 3 …); null = unordered. Absent from older APIs. */
  sortOrder?: number | null;
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
  /** Empty list clears them. */
  keywords?: string[];
  /** 0 clears the step (the API treats 0 or less as "unordered"). */
  sortOrder?: number;
}

/**
 * Six-character code hint derived from the video id — the same hash the admin dashboard's
 * `toShortCodeHint` uses, so a video gets the same code whichever app shortens it first.
 */
function shortCodeHint(id: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const combined = h1 * 0x100000 + (h2 % 0x100000);
  return combined.toString(36).padStart(6, "0").slice(-6);
}

/**
 * Get-or-create the public short link (`u.vacademy.io/s/…`) for a video, to share with a client.
 * Keyed on (TRAINING_VIDEO, video id), so asking again returns the same link.
 */
export async function getTrainingVideoShortLink(video: Pick<TrainingVideoDto, "id" | "fileUrl">): Promise<string> {
  const { data } = await api.post<{ absoluteUrl?: string }>("/media-service/public/v1/short-link/get-or-create", {
    source: "TRAINING_VIDEO",
    sourceId: video.id,
    destinationUrl: video.fileUrl,
    shortCode: shortCodeHint(video.id),
  });
  if (!data?.absoluteUrl) throw new Error("Short link service returned no URL");
  return data.absoluteUrl;
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