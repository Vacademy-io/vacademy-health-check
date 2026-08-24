import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = `${API_PREFIXES.ADMIN_CORE}/calls/tts-cache`;

/**
 * Screens 1-4 read a mirror of the bot's own ledger, pushed into Postgres every two
 * minutes — never live. Every agent row carries `reported_at` so the UI can state its
 * own staleness rather than imply freshness it doesn't have.
 */
export interface CacheAgent {
  agent_id: string;
  agent_name: string | null;
  institute_id: string | null;
  institute_name: string | null;
  engine: string | null;
  voice: string | null;
  /** OFF | FIXED | FULL — explains an agent's zeroes. */
  speech_cache_mode: string | null;
  entries: number | null;
  /** Seen but not yet rendered — the population of the misses screen. */
  unrendered_entries: number | null;
  /** Cached and never once served: paid for, occupying disk, earning nothing. */
  never_hit_entries: number | null;
  bytes: number | null;
  hits: number | null;
  sightings: number | null;
  /** Percentage, 0-100. Null means never measured, which is not the same as 0. */
  hit_rate: number | null;
  chars_saved: number | null;
  inr_saved: number | null;
  last_hit_at: string | null;
  reported_at: string | null;
}

/** One cached sentence. The misses list returns the same shape with fewer fields set. */
export interface CacheEntry {
  cache_key: string;
  sentence: string | null;
  chars: number | null;
  /** A bot-authored line (opening, farewell, filler) rather than something the LLM produced. */
  is_fixed: boolean | null;
  engine?: string | null;
  voice?: string | null;
  sightings: number | null;
  hits: number | null;
  rendered: boolean | null;
  bytes?: number | null;
  duration_ms?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  last_hit_at?: string | null;
  /** Reserved — the route that serves the audio is not built yet. Do not wire playback. */
  audio_url?: string | null;
  /** Written for a human: why this sentence is not cached. */
  reason: string | null;
  inr_wasted: number | null;
}

export interface CachePage<T> {
  content: T[];
  total_elements: number;
  page: number;
  page_size: number;
}

/**
 * Deleting cached audio means deleting a file on the bot's disk, so both destructive
 * routes queue a command and return PENDING. The bot acts on its next cycle; the UI
 * must say "queued", never "done".
 */
export interface CacheCommand {
  command_id: string;
  status: string;
  dry_run: boolean;
  kind: string;
  agent_id: string | null;
  cache_key: string | null;
  entries_removed: number | null;
  bytes_removed: number | null;
  result: string | null;
  created_at: string | null;
  finished_at: string | null;
}

export interface CacheSummary {
  /** Coverage: how much of the fleet has the cache switched on at all. */
  measured_calls: number | null;
  unmeasured_calls: number | null;
  hits: number | null;
  misses: number | null;
  hit_rate: number | null;
  chars_saved: number | null;
  secs_saved: number | null;
  inr_saved: number | null;
  hits_by_engine: Record<string, number> | null;
  /** Days with no measured call are omitted rather than plotted at 0%. */
  series: Array<{
    day: string;
    measured_calls: number | null;
    hits: number | null;
    misses: number | null;
    hit_rate: number | null;
    chars_saved: number | null;
    inr_saved: number | null;
  }> | null;
}

export interface CacheFilters {
  instituteId?: string;
  from?: string;
  to?: string;
  agentId?: string;
}

const clean = (f: Record<string, string | number | boolean | undefined>) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));

export function useCacheAgents(instituteId?: string) {
  return useQuery({
    queryKey: ["super-admin", "tts-cache", "agents", instituteId ?? ""],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/agents`, { params: clean({ instituteId }) });
      return data as CacheAgent[];
    },
  });
}

export function useCacheEntries(agentId: string | null, q: string, page: number, size = 50) {
  return useQuery({
    enabled: !!agentId,
    queryKey: ["super-admin", "tts-cache", "entries", agentId, q, page, size],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/agents/${agentId}/entries`, {
        params: clean({ q, page, size }),
      });
      return data as CachePage<CacheEntry>;
    },
  });
}

export function useCacheMisses(agentId: string | null, page: number, size = 50) {
  return useQuery({
    enabled: !!agentId,
    queryKey: ["super-admin", "tts-cache", "misses", agentId, page, size],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/agents/${agentId}/misses`, {
        params: clean({ page, size }),
      });
      return data as CachePage<CacheEntry>;
    },
  });
}

export function useCacheSummary(filters: CacheFilters) {
  return useQuery({
    queryKey: ["super-admin", "tts-cache", "summary", filters],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/summary`, { params: clean({ ...filters }) });
      return data as CacheSummary;
    },
  });
}

/** Polls while any command is still in flight, so a queued flush resolves on screen. */
export function useFlushLog(agentId?: string, limit = 50) {
  return useQuery({
    queryKey: ["super-admin", "tts-cache", "flush-log", agentId ?? "", limit],
    queryFn: async () => {
      const { data } = await api.get(`${BASE}/flush-log`, { params: clean({ agentId, limit }) });
      return data as CacheCommand[];
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((c) => c.status === "PENDING" || c.status === "CLAIMED")
        ? 15_000
        : false,
  });
}

/** dryRun defaults to true server-side; we always pass it so the intent is explicit. */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cacheKey, dryRun }: { cacheKey: string; dryRun: boolean }) => {
      const { data } = await api.delete(`${BASE}/entries/${cacheKey}`, { params: { dryRun } });
      return data as CacheCommand;
    },
    onSuccess: (_d, v) => {
      if (!v.dryRun) queryClient.invalidateQueries({ queryKey: ["super-admin", "tts-cache"] });
    },
  });
}

export function useFlushAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, dryRun }: { agentId: string; dryRun: boolean }) => {
      const { data } = await api.post(`${BASE}/agents/${agentId}/flush`, null, {
        params: { dryRun },
      });
      return data as CacheCommand;
    },
    onSuccess: (_d, v) => {
      if (!v.dryRun) queryClient.invalidateQueries({ queryKey: ["super-admin", "tts-cache"] });
    },
  });
}
