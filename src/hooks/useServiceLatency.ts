import { useState, useEffect, useCallback } from "react";

export interface ServicePingResult {
  service: string;
  // ── Ping ────────────────────────────────────────────────────────────────────
  pingStatus: "UP" | "DOWN" | "PENDING";
  pingLatencyMs: number | null;
  /** Rolling history of ping latencies (last 30 readings = ~5min at 10s interval) */
  pingHistory: number[];
  /** JVM snapshot from the ping response */
  jvm?: {
    heap_percent: number;
    gc_pause_ms_last: number;
    gc_count_total: number;
    gc_algorithm: string;   // "G1GC" | "ZGC" | "Shenandoah" | "ParallelGC" | "SerialGC"
    threads_blocked: number;
    threads_waiting: number;
    heap_used_mb: number;
    heap_max_mb: number;
    threads_live: number;
  };
  // ── DB ──────────────────────────────────────────────────────────────────────
  dbStatus: "UP" | "DOWN" | "PENDING";
  dbLatencyMs: number | null;
  /** How long it took to acquire a connection from the pool */
  dbConnectionAcquireMs: number | null;
  /** How long the DB server took to execute the validation query */
  dbQueryExecuteMs: number | null;
  /** Threads waiting for a DB connection — > 0 means pool is saturated */
  dbPoolWaitCount: number | null;
  dbPoolActive: number | null;
  dbPoolIdle: number | null;
  dbPoolMax: number | null;
}

const SERVICES = [
  { name: "auth-service",         baseUrl: "/auth-service" },
  { name: "admin-core-service",   baseUrl: "/admin-core-service" },
  { name: "media-service",        baseUrl: "/media-service" },
  { name: "assessment-service",   baseUrl: "/assessment-service" },
  { name: "notification-service", baseUrl: "/notification-service" },
  { name: "ai-service",           baseUrl: "/ai-service" },
];

const HISTORY_SIZE = 30; // 30 × 10s = 5 minutes of history

/** Append value to a rolling array, capped at HISTORY_SIZE */
const rolling = (prev: number[], val: number): number[] =>
  [...prev.slice(-(HISTORY_SIZE - 1)), val];

export const useServiceLatency = () => {
  const [results, setResults] = useState<Record<string, ServicePingResult>>({});

  const measureService = useCallback(async (name: string, baseUrl: string) => {
    // ── Ping ──────────────────────────────────────────────────────────────────
    const pingStart = performance.now();
    let pingStatus: "UP" | "DOWN" = "DOWN";
    let pingLatency: number | null = null;
    let jvm: ServicePingResult["jvm"] | undefined;

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${baseUrl}/health/ping`, { signal: ctrl.signal });
      clearTimeout(tid);
      const pingEnd = performance.now();

      if (res.ok) {
        pingStatus = "UP";
        pingLatency = Math.round(pingEnd - pingStart);
        try {
          const json = await res.json();
          if (json.jvm) jvm = json.jvm;
        } catch { /* json parse optional */ }
      }
    } catch { /* timeout or network error */ }

    // ── DB ────────────────────────────────────────────────────────────────────
    let dbStatus: "UP" | "DOWN" = "DOWN";
    let dbLatency: number | null = null;
    let dbConnectionAcquireMs: number | null = null;
    let dbQueryExecuteMs: number | null = null;
    let dbPoolWaitCount: number | null = null;
    let dbPoolActive: number | null = null;
    let dbPoolIdle: number | null = null;
    let dbPoolMax: number | null = null;

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${baseUrl}/health/db`, { signal: ctrl.signal });
      clearTimeout(tid);

      if (res.ok) {
        const json = await res.json();
        if (json.status === "UP") {
          dbStatus = "UP";
          // Support both old schema (total_latency_ms) and new schema
          dbLatency           = json.total_latency_ms          ?? null;
          dbConnectionAcquireMs = json.connection_acquire_ms   ?? json.connection_time_ms ?? null;
          dbQueryExecuteMs    = json.query_execute_ms           ?? json.validation_time_ms ?? null;
          dbPoolWaitCount     = json.pool_wait_count            ?? null;
          dbPoolActive        = json.pool_active                ?? null;
          dbPoolIdle          = json.pool_idle                  ?? null;
          dbPoolMax           = json.pool_max                   ?? null;
        }
      }
    } catch { /* timeout or network error */ }

    // ── Merge into state (immutable rolling history) ──────────────────────────
    setResults(prev => {
      const existing = prev[name];
      const prevHistory = existing?.pingHistory ?? [];
      return {
        ...prev,
        [name]: {
          service: name,
          pingStatus,
          pingLatency,
          pingHistory: pingLatency !== null ? rolling(prevHistory, pingLatency) : prevHistory,
          jvm,
          dbStatus,
          dbLatencyMs: dbLatency,
          dbConnectionAcquireMs,
          dbQueryExecuteMs,
          dbPoolWaitCount,
          dbPoolActive,
          dbPoolIdle,
          dbPoolMax,
          // Legacy field kept for Dashboard.tsx compatibility
          pingLatencyMs: pingLatency,
        } as ServicePingResult,
      };
    });
  }, []);

  const refreshAll = useCallback(() => {
    SERVICES.forEach(s => measureService(s.name, s.baseUrl));
  }, [measureService]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000); // every 10s
    return () => clearInterval(interval);
  }, [refreshAll]);

  return { results, refreshAll };
};
