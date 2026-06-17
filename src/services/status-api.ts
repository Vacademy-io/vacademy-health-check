import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type {
  IncidentDTO,
  CreateIncidentRequest,
  UpdateIncidentRequest,
  AddIncidentUpdateRequest,
} from "@/types/api";

const PUBLIC_KEY = ["status", "public", "incidents"] as const;
const ADMIN_KEY = ["status", "admin", "incidents"] as const;

/**
 * Public list of incidents. No auth required — uses plain fetch so the
 * axios interceptor doesn't attach a Bearer token to a public endpoint.
 */
export function usePublicIncidents() {
  return useQuery({
    queryKey: PUBLIC_KEY,
    queryFn: async (): Promise<IncidentDTO[]> => {
      const res = await fetch(`${API_PREFIXES.STATUS_PUBLIC}/incidents`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load status: ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAdminIncidents() {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => {
      const { data } = await api.get<IncidentDTO[]>(
        `${API_PREFIXES.STATUS_ADMIN}/incidents`
      );
      return data;
    },
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateIncidentRequest) => {
      const { data } = await api.post<IncidentDTO>(
        `${API_PREFIXES.STATUS_ADMIN}/incidents`,
        body
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}

export function useUpdateIncident(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateIncidentRequest) => {
      const { data } = await api.patch<IncidentDTO>(
        `${API_PREFIXES.STATUS_ADMIN}/incidents/${id}`,
        body
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}

export function useAddIncidentUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddIncidentUpdateRequest) => {
      const { data } = await api.post<IncidentDTO>(
        `${API_PREFIXES.STATUS_ADMIN}/incidents/${id}/updates`,
        body
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}

export function useDeleteIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${API_PREFIXES.STATUS_ADMIN}/incidents/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
    },
  });
}
