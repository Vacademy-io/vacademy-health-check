import { useState, useEffect, useCallback } from "react";

export interface ServicePingResult {
  service: string;
  pingLatencyMs: number | null;
  pingStatus: "UP" | "DOWN" | "PENDING";
  dbStatus: "UP" | "DOWN" | "PENDING";
  dbLatencyMs: number | null;
  redisStatus?: "UP" | "DOWN"; // Some services might return this
}

const SERVICES = [
  { name: "auth-service", baseUrl: "/auth-service" },
  { name: "admin-core-service", baseUrl: "/admin-core-service" },
  { name: "media-service", baseUrl: "/media-service" },
  { name: "assessment-service", baseUrl: "/assessment-service" },
  { name: "notification-service", baseUrl: "/notification-service" },
  { name: "ai-service", baseUrl: "/ai-service" },
];

export const useServiceLatency = () => {
  const [results, setResults] = useState<Record<string, ServicePingResult>>({});

  const measureDetail = useCallback(async (name: string, baseUrl: string) => {
    // Ping Check
    const pingStart = performance.now();
    let pingStatus: "UP" | "DOWN" = "DOWN";
    let pingLatency = -1;

    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${baseUrl}/health/ping`, { signal: controller.signal });
        clearTimeout(tid);
        const pingEnd = performance.now();
        if(res.ok) {
            pingStatus = "UP";
            pingLatency = Math.round(pingEnd - pingStart);
        }
    } catch (_) {
        // ignore
    }

    // DB Check
    let dbStatus: "UP" | "DOWN" = "DOWN";
    let dbLatency = -1;
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${baseUrl}/health/db`, { signal: controller.signal });
        clearTimeout(tid);
        if(res.ok) {
            const json = await res.json(); // Expected { status: "UP", latency_ms: 15, ... }
            if(json.status === "UP") {
                dbStatus = "UP";
                dbLatency = json.total_latency_ms ?? json.latency_ms ?? 0;
            }
        }
    } catch (_) {
        // ignore
    }

    setResults(prev => ({
        ...prev,
        [name]: {
            service: name,
            pingLatencyMs: pingLatency,
            pingStatus: pingStatus,
            dbStatus: dbStatus,
            dbLatencyMs: dbLatency
        }
    }));
  }, []);

  const refreshAll = useCallback(() => {
    SERVICES.forEach((s) => measureDetail(s.name, s.baseUrl));
  }, [measureDetail]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000); 
    return () => clearInterval(interval);
  }, [refreshAll]);

  return { results, refreshAll };
};
