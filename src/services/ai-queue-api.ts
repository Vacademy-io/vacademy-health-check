import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * The queue snapshot sits on the internal surface, which authenticates with a client
 * name and signature rather than the user's session. That pair is attached by the
 * proxy in front of this app — the dev proxy in vite.config.ts and the Cloudflare
 * function in functions/[[route]].ts — so the secret stays server-side and the browser
 * just calls the path. Fields are camelCase here, unlike the super-admin surface.
 */
const SNAPSHOT = "/admin-core-service/internal/ai-queue/snapshot";

export interface QueueBox {
  slug: string | null;
  maxConcurrent: number | null;
  enabled: boolean | null;
  healthStatus: string | null;
  activeCalls: number | null;
  countsTowardCapacity: boolean | null;
  baseUrl: string | null;
}

export interface QueueCapacity {
  vacademyAiCapacity: number | null;
  vacademyAiInFlight: number | null;
  aavtaarCapacity: number | null;
  aavtaarInFlight: number | null;
  /** When false nothing is throttling — the queue drains as fast as the boxes allow. */
  capacityEnabled: boolean | null;
  totalQueued: number | null;
  lanesWithWork: number | null;
  dynamicLaneCapacity: number | null;
  avgCallSeconds: number | null;
  reservedInteractiveSlots: number | null;
  boxes: QueueBox[] | null;
}

/** One institute's share of the queue. */
export interface QueueLane {
  instituteId: string | null;
  instituteName: string | null;
  queued: number | null;
  inFlight: number | null;
  effectiveMaxConcurrent: number | null;
  /** The lane's own override, null when it inherits the dynamic figure. */
  maxConcurrent: number | null;
  etaMinutes: number | null;
  oldestQueuedAt: string | null;
  paused: boolean | null;
}

export interface QueueWaiting {
  id: string;
  instituteName: string | null;
  agentName: string | null;
  phoneNumber: string | null;
  source: string | null;
  status: string | null;
  aheadInLane: number | null;
  etaMinutes: number | null;
  live: boolean | null;
  callStatus: string | null;
}

export interface QueueSnapshot {
  generatedAt: string | null;
  capacity: QueueCapacity | null;
  lanes: QueueLane[] | null;
  waiting: QueueWaiting[] | null;
  waitingTotal: number | null;
  totalsByStatus: Record<string, number> | null;
}

/**
 * A queue is only interesting live, so this polls. `instituteId` narrows the waiting
 * list alone — capacity and lanes stay fleet-wide however it is set.
 */
export function useQueueSnapshot(limit: number, instituteId?: string, refreshMs = 10_000) {
  return useQuery({
    queryKey: ["super-admin", "ai-queue", limit, instituteId ?? ""],
    queryFn: async () => {
      const { data } = await api.get(SNAPSHOT, {
        params: instituteId ? { limit, instituteId } : { limit },
      });
      return data as QueueSnapshot;
    },
    refetchInterval: refreshMs,
    refetchOnWindowFocus: true,
  });
}
