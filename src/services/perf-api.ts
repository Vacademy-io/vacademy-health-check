import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * Real-user latency, split into "our server" and "their connection".
 *
 * Read straight from the prod DB standby via the analytics-api SQL proxy, the same
 * path Live Pulse uses. Deliberately NOT a new admin_core endpoint: the primary is a
 * 4-core box that an analytics query has OOM-killed before (2026-08-03), and a
 * dashboard nobody is watching must never be able to do that again.
 *
 * The write side (admin_core's PerfRumService) stores HISTOGRAM BUCKETS rather than a
 * precomputed p95, because 4 pods each flush their own rows for the same minute and
 * percentiles cannot be averaged. Summing bucket counts across rows is exact; that is
 * what these queries do, and the percentile is derived from the summed histogram here.
 */

const ANALYTICS_ENDPOINT = "/analytics-api/query";

interface QueryResponse<Row> {
  db: string;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  fields: string[];
  rows: Row[];
}

async function perfQuery<Row>(sql: string): Promise<Row[]> {
  const { data } = await api.post<QueryResponse<Row>>(ANALYTICS_ENDPOINT, {
    db: "admin_core_service",
    sql,
  });
  return data.rows;
}

/** Clamp so the interval built below can never be shaped by arbitrary input. */
function safeHours(hours: number): number {
  const n = Math.floor(Number(hours));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 24 * 14);
}

// ---------------------------------------------------------------------------
// Histogram maths
// ---------------------------------------------------------------------------

/**
 * Upper bounds in ms. MUST stay in lockstep with PerfRumService.BOUNDS and the
 * layout documented in V468 — reordering these silently reinterprets stored rows.
 */
export const BUCKET_BOUNDS = [50, 100, 250, 500, 1000, 2000, 5000, 10000] as const;

export interface Histogram {
  samples: number;
  buckets: number[];
}

/**
 * The bucket boundary at or below which the given percentile falls.
 *
 * Returns a BOUND, not an interpolated value, and the UI renders it as "≤ 250ms".
 * Interpolating inside a bucket would manufacture precision the data does not have —
 * a number that looks exact and is not is worse than an honest range, especially on a
 * page whose whole purpose is deciding whether to blame ourselves or the user.
 *
 * Returns null when there are no samples, and Infinity when the percentile lands in
 * the overflow bucket (slower than the largest bound).
 */
export function percentileBound(hist: Histogram, percentile: number): number | null {
  if (!hist.samples || !hist.buckets.length) return null;
  const target = hist.samples * percentile;
  let cumulative = 0;
  for (let i = 0; i < hist.buckets.length; i++) {
    cumulative += hist.buckets[i] ?? 0;
    if (cumulative >= target) {
      return i < BUCKET_BOUNDS.length ? BUCKET_BOUNDS[i]! : Infinity;
    }
  }
  return Infinity;
}

/** "≤ 250ms" / "> 10s" / "—" */
export function formatBound(ms: number | null): string {
  if (ms === null) return "—";
  if (!Number.isFinite(ms)) return `> ${BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1]! / 1000}s`;
  return ms >= 1000 ? `≤ ${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `≤ ${ms}ms`;
}

const BUCKET_SUM_COLUMNS = Array.from(
  { length: BUCKET_BOUNDS.length + 1 },
  (_, i) => `sum(p.buckets[${i + 1}])::int AS b${i + 1}`,
).join(",\n                ");

function rowToHistogram(row: Record<string, unknown>): Histogram {
  const buckets: number[] = [];
  for (let i = 1; i <= BUCKET_BOUNDS.length + 1; i++) {
    buckets.push(Number(row[`b${i}`] ?? 0));
  }
  return { samples: Number(row.samples ?? 0), buckets };
}

// ---------------------------------------------------------------------------
// 1. Per-institute split: is it us, or is it them?
// ---------------------------------------------------------------------------

export interface InstitutePerfRow {
  instituteId: string | null;
  instituteName: string;
  server: Histogram;
  network: Histogram;
  unannotated: number;
}

interface RawInstituteRow extends Record<string, unknown> {
  institute_id: string | null;
  institute_name: string;
  metric: string;
  samples: number;
  unannotated: number;
}

export function useInstitutePerf(hours: number) {
  const h = safeHours(hours);
  return useQuery({
    queryKey: ["perf", "by-institute", h],
    queryFn: async (): Promise<InstitutePerfRow[]> => {
      const rows = await perfQuery<RawInstituteRow>(
        `SELECT p.institute_id,
                coalesce(i.name, '(unidentified)') AS institute_name,
                p.metric,
                sum(p.sample_count)::int      AS samples,
                sum(p.unannotated_count)::int AS unannotated,
                ${BUCKET_SUM_COLUMNS}
           FROM perf_rum_minute p
           LEFT JOIN institutes i ON i.id = p.institute_id
          WHERE p.bucket_start > now() - interval '${h} hours'
          GROUP BY 1, 2, 3`,
      );

      // One row per (institute, metric) — fold the two metrics together.
      const byInstitute = new Map<string, InstitutePerfRow>();
      const empty = (): Histogram => ({
        samples: 0,
        buckets: new Array(BUCKET_BOUNDS.length + 1).fill(0),
      });

      for (const row of rows) {
        const key = row.institute_id ?? "(none)";
        let entry = byInstitute.get(key);
        if (!entry) {
          entry = {
            instituteId: row.institute_id,
            instituteName: row.institute_name,
            server: empty(),
            network: empty(),
            unannotated: 0,
          };
          byInstitute.set(key, entry);
        }
        const hist = rowToHistogram(row);
        if (row.metric === "network") entry.network = hist;
        else {
          entry.server = hist;
          entry.unannotated += Number(row.unannotated ?? 0);
        }
      }

      return Array.from(byInstitute.values()).sort(
        (a, b) => b.server.samples + b.network.samples - (a.server.samples + a.network.samples),
      );
    },
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// 2. Timeline — server vs network over time
// ---------------------------------------------------------------------------

export interface PerfTimelinePoint {
  t: string;
  serverP95: number | null;
  networkP95: number | null;
  samples: number;
}

interface RawTimelineRow extends Record<string, unknown> {
  t: string;
  metric: string;
  samples: number;
}

export function usePerfTimeline(hours: number) {
  const h = safeHours(hours);
  // Minute resolution is too noisy past a couple of hours and returns far more rows
  // than a chart can show.
  const grain = h <= 6 ? "minute" : "hour";
  return useQuery({
    queryKey: ["perf", "timeline", h, grain],
    queryFn: async (): Promise<PerfTimelinePoint[]> => {
      const rows = await perfQuery<RawTimelineRow>(
        `SELECT date_trunc('${grain}', p.bucket_start) AS t,
                p.metric,
                sum(p.sample_count)::int AS samples,
                ${BUCKET_SUM_COLUMNS}
           FROM perf_rum_minute p
          WHERE p.bucket_start > now() - interval '${h} hours'
          GROUP BY 1, 2
          ORDER BY 1`,
      );

      const byTime = new Map<string, PerfTimelinePoint>();
      for (const row of rows) {
        const key = String(row.t);
        let point = byTime.get(key);
        if (!point) {
          point = { t: key, serverP95: null, networkP95: null, samples: 0 };
          byTime.set(key, point);
        }
        const p95 = percentileBound(rowToHistogram(row), 0.95);
        if (row.metric === "network") point.networkP95 = p95;
        else point.serverP95 = p95;
        point.samples += Number(row.samples ?? 0);
      }
      return Array.from(byTime.values());
    },
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// 3. Slowest routes — where our own time actually goes
// ---------------------------------------------------------------------------

export interface SlowRouteRow {
  routeKey: string;
  samples: number;
  unannotated: number;
  p95: number | null;
  p50: number | null;
}

interface RawRouteRow extends Record<string, unknown> {
  route_key: string;
  samples: number;
  unannotated: number;
}

export function useSlowRoutes(hours: number, limit = 20) {
  const h = safeHours(hours);
  const lim = Math.min(Math.max(Math.floor(Number(limit)) || 20, 1), 100);
  return useQuery({
    queryKey: ["perf", "slow-routes", h, lim],
    queryFn: async (): Promise<SlowRouteRow[]> => {
      const rows = await perfQuery<RawRouteRow>(
        `SELECT p.route_key,
                sum(p.sample_count)::int      AS samples,
                sum(p.unannotated_count)::int AS unannotated,
                ${BUCKET_SUM_COLUMNS}
           FROM perf_rum_minute p
          WHERE p.metric = 'server'
            AND p.bucket_start > now() - interval '${h} hours'
          GROUP BY 1
         HAVING sum(p.sample_count) > 0
          ORDER BY sum(p.sample_count) DESC
          LIMIT ${lim}`,
      );

      return rows
        .map((row) => {
          const hist = rowToHistogram(row);
          return {
            routeKey: row.route_key,
            samples: hist.samples,
            unannotated: Number(row.unannotated ?? 0),
            p95: percentileBound(hist, 0.95),
            p50: percentileBound(hist, 0.5),
          };
        })
        .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
    },
    refetchInterval: 60_000,
  });
}
