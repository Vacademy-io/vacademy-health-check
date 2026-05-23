import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

const COMMUNITY_PREFIX = "/community-service/bbb";
const ADMIN_PREFIX = "/admin-core-service/bbb/pool";

export interface BbbServerPoolDTO {
  id: string;
  slug: string;
  priority: number;
  serverType: string;
  serverName: string;
  domain: string;
  apiUrl: string | null;
  hetznerServerId: number | null;
  snapshotDesc: string;
  location: string;
  maxMeetings: number;
  activeMeetings: number;
  status: "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "ERROR" | string;
  healthStatus: "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN" | string;
  // Spring serializes Date as ISO string with the default Jackson config,
  // or as epoch ms when WRITE_DATES_AS_TIMESTAMPS=true — accept both.
  lastHealthCheck: string | number | null;
  enabled: boolean;
  createdAt: string | number | null;
  updatedAt: string | number | null;
}

// ── Queries ──────────────────────────────────────────────────────────────

export function useBbbPoolServers() {
  return useQuery({
    queryKey: ["bbb", "pool", "servers"],
    queryFn: async () => {
      const { data } = await api.get<BbbServerPoolDTO[]>(`${ADMIN_PREFIX}/servers`);
      return data;
    },
    refetchInterval: 15_000,
  });
}

export function useServersToStart() {
  return useQuery({
    queryKey: ["bbb", "pool", "servers-to-start"],
    queryFn: async () => {
      const { data } = await api.get<{ serversToStart: number }>(
        `${ADMIN_PREFIX}/config/servers-to-start`
      );
      return data.serversToStart;
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────────

export function useUpdateServersToStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (serversToStart: number) => {
      const { data } = await api.put<{ serversToStart: number }>(
        `${ADMIN_PREFIX}/config/servers-to-start`,
        { serversToStart }
      );
      return data.serversToStart;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bbb", "pool", "servers-to-start"] });
    },
  });
}

export interface PoolActionResult {
  action: string;
  serverSlug: string;
  serverCount: number;
  status?: string;
  message?: string;
  error?: string;
}

export function useTriggerPoolAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      action: "start" | "stop" | "status";
      serverSlug?: string;
      serverCount?: number;
    }) => {
      const params = new URLSearchParams({
        action: input.action,
        serverSlug: input.serverSlug ?? "all",
        serverCount: String(input.serverCount ?? 1),
      });
      const { data } = await api.post<PoolActionResult>(
        `${COMMUNITY_PREFIX}/pool/action?${params.toString()}`
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bbb", "pool", "servers"] });
    },
  });
}

export interface HealthCheckResult {
  timestamp: string;
  hostname: string;
  ip: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN" | string;
  details: string;
  slug?: string;
  notificationError?: string;
}

export interface PoolHealthCheckResponse {
  results: HealthCheckResult[];
  checked: number;
  source: "pool" | "legacy" | string;
}

/**
 * Runs the pool-aware health check on every running server and updates
 * `health_status` in the DB. notify=false suppresses WhatsApp pages —
 * matches the manual-from-UI semantics.
 */
export function useRunHealthCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { notify?: boolean }) => {
      const notify = input?.notify ?? false;
      const { data } = await api.post<PoolHealthCheckResponse>(
        `${COMMUNITY_PREFIX}/pool/health-check?notify=${notify}`
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bbb", "pool", "servers"] });
    },
  });
}
