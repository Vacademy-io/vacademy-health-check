import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

export interface CallRow {
  id: string;
  correlation_id: string | null;
  institute_id: string | null;
  institute_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  tts_model: string | null;
  voice: string | null;
  /** The provider's own call id — quote this to Plivo. */
  provider_call_id: string | null;
  phone_number: string | null;
  customer_name: string | null;
  direction: string | null;
  status: string | null;
  disposition: string | null;
  call_start: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  has_recording: boolean | null;
  health: string | null;
  faults: string[] | null;
  /** The bot's diagnostics blob, as JSON text. */
  diagnostics: string | null;
  cost_inr: number | null;
  billed_inr: number | null;
  margin_inr: number | null;
  margin_pct: number | null;
  cost_breakdown: Record<string, number> | null;
  cost_is_modelled: boolean | null;
  /** TTS cache — speech replayed instead of re-synthesised, and what that saved. */
  tts_cache_hits: number | null;
  tts_cache_misses: number | null;
  tts_cache_chars_saved: number | null;
  tts_cache_saved_inr: number | null;
}

/** The shape of {@link CallRow.diagnostics} once parsed. Every field is best-effort. */
export interface CallDiagnostics {
  health?: string | null;
  /** The single fault the bot blames the call on, e.g. DEAD_AIR. */
  headline?: string | null;
  /** That fault in plain words, e.g. "Long silence during the call". */
  headlineText?: string | null;
  faults?: string[] | null;
  faultLevels?: Record<string, string> | null;
  rulesVersion?: number | null;
  silences?: Array<{ secs: number; cause: string }> | null;
  latency?: {
    deadAirMax?: number | null;
    deadAirP95?: number | null;
    llmTtfbP50?: number | null;
    llmTtfbP95?: number | null;
    sttTtfbP50?: number | null;
    sttTtfbP95?: number | null;
  } | null;
  turnTaking?: {
    botTurns?: number | null;
    userTurns?: number | null;
    bargeIns?: number | null;
    ducks?: number | null;
    duckAbsorbs?: number | null;
    duckTimeoutResumes?: number | null;
    handbacks?: number | null;
    nudges?: number | null;
    echoesTrimmed?: number | null;
    repeatsSuppressed?: number | null;
    repeatEscalations?: number | null;
    unsaidReverted?: number | null;
    contentFreeTurns?: number | null;
    emptyRunsBlocked?: number | null;
    maxReplyRestarts?: number | null;
    orphanReasks?: number | null;
    orphanFalseReasks?: number | null;
    bargeInCancels?: number | null;
    carrierAnnouncements?: number | null;
    fragmentsLost?: number | null;
    fragmentsLostSamples?: string[] | null;
    answersDeleted?: number | null;
    answersDeletedSamples?: string[] | null;
    idleHangup?: boolean | null;
    capFarewell?: boolean | null;
    [key: string]: unknown;
  } | null;
  tts?: {
    vendor?: string | null;
    stalls?: number | null;
    wedges?: number | null;
    wedgeReconnects?: number | null;
    silentGenerations?: number | null;
    letterlessSkipped?: number | null;
    stallCapHit?: boolean | null;
    cacheHits?: number | null;
    cacheMisses?: number | null;
    cacheHitRate?: number | null;
    cacheCharsSaved?: number | null;
    cacheSecsSaved?: number | null;
    [key: string]: unknown;
  } | null;
  setup?: {
    greetPath?: string | null;
    greetDelaySecs?: number | null;
    setupSecs?: number | null;
    openingTruncated?: number | null;
  } | null;
  infra?: {
    crash?: string | null;
    sttReconnects?: number | null;
    hearingFailures?: number | null;
    unheardUtterances?: number | null;
    transferRequested?: boolean | null;
    transferRegistered?: boolean | null;
    [key: string]: unknown;
  } | null;
  machine?: {
    src?: string | null;
    score?: number | null;
    longestUserSecs?: number | null;
    firstUserSecs?: number | null;
    [key: string]: unknown;
  } | null;
  playout?: {
    repliesGenerated?: number | null;
    repliesNeverPlayed?: number | null;
  } | null;
  [key: string]: unknown;
}

/** The blob arrives as JSON text, and older calls have none. */
export function parseDiagnostics(raw: string | null | undefined): CallDiagnostics | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CallDiagnostics) : null;
  } catch {
    return null;
  }
}

export interface CallSummary {
  calls: number;
  minutes: number;
  cost_inr: number;
  billed_inr: number;
  margin_inr: number;
  margin_pct: number | null;
  red: number;
  amber: number;
  green: number;
  with_recording: number;
  cost_breakdown: Record<string, number> | null;
  by_tts_model: Record<string, number> | null;
  cost_is_modelled: boolean | null;
  /** Cache totals for the same filtered window as the rest of this object. */
  tts_cache_hits: number | null;
  tts_cache_misses: number | null;
  /** Percentage, 0-100. Null means nothing in the window measured the cache. */
  tts_cache_hit_rate: number | null;
  tts_cache_chars_saved: number | null;
  tts_cache_saved_inr: number | null;
}

export interface CallFilters {
  instituteId?: string;
  from?: string;
  to?: string;
  health?: string;
  disposition?: string;
  agentId?: string;
}

const clean = (f: CallFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));

export function useCalls(filters: CallFilters, page: number, size = 50) {
  return useQuery({
    queryKey: ["super-admin", "calls", filters, page, size],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls`, {
        params: { ...clean(filters), page, size },
      });
      return data as {
        content: CallRow[];
        page: number;
        size: number;
        total_elements: number;
        total_pages: number;
      };
    },
  });
}

export function useCallSummary(filters: CallFilters) {
  return useQuery({
    queryKey: ["super-admin", "calls-summary", filters],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls/summary`, {
        params: clean(filters),
      });
      return data as CallSummary;
    },
  });
}

/** The per-minute rates the costs were computed from, so the UI can show its work. */
export function useCallRateCard() {
  return useQuery({
    queryKey: ["super-admin", "calls-rate-card"],
    queryFn: async () => {
      const { data } = await api.get(`${API_PREFIXES.ADMIN_CORE}/calls/rate-card`);
      return data as Record<string, number>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
