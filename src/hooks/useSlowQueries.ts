import { useState, useCallback } from "react";

export interface SlowQueryRecord {
  timestamp: string;
  method: string;
  type: "repository" | "service" | "manager";
  duration_ms: number;
  severity: "warning" | "critical" | "error";
  error?: string;
  service: string;
}

export interface SlowQueryTopOffender {
  method: string;
  count: number;
}

export interface SlowQuerySummary {
  service: string;
  timestamp: string;
  total_slow_calls_since_start: number;
  recent: SlowQueryRecord[];
  top_offenders: SlowQueryTopOffender[];
}

const SERVICES_WITH_SLOW_QUERIES = [
  { name: "auth-service",         baseUrl: "/auth-service" },
  { name: "admin-core-service",   baseUrl: "/admin-core-service" },
  { name: "media-service",        baseUrl: "/media-service" },
  { name: "assessment-service",   baseUrl: "/assessment-service" },
  { name: "notification-service", baseUrl: "/notification-service" },
];

export const useSlowQueries = () => {
  const [data, setData] = useState<Record<string, SlowQuerySummary>>({});
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results: Record<string, SlowQuerySummary> = {};

    await Promise.allSettled(
      SERVICES_WITH_SLOW_QUERIES.map(async ({ name, baseUrl }) => {
        try {
          const res = await fetch(`${baseUrl}/health/slow-queries?limit=20`, {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            results[name] = await res.json();
          }
        } catch {
          // service unreachable — skip
        }
      })
    );

    setData(results);
    setLoading(false);
  }, []);

  return { data, loading, fetchAll };
};
