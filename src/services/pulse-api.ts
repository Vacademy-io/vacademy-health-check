import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

// Live Pulse — product-usage metrics read straight from the prod DB standby via
// the analytics-api SQL proxy (see vacademy_platform/vacademy_devops/analytics-api.yaml).
// Auth: the proxy accepts our super-admin JWT (is_root_user claim), which the
// shared axios instance already attaches — no extra credentials needed.
// Every query below is an indexed aggregate validated at <400ms on the standby.

const PULSE_ENDPOINT = "/analytics-api/query";

type PulseDb =
  | "admin_core_service"
  | "auth_service"
  | "assessment_service"
  | "community_service"
  | "media_service"
  | "notification_service";

interface QueryResponse<Row> {
  db: string;
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  fields: string[];
  rows: Row[];
}

async function pulseQuery<Row>(db: PulseDb, sql: string): Promise<Row[]> {
  const { data } = await api.post<QueryResponse<Row>>(PULSE_ENDPOINT, { db, sql });
  return data.rows;
}

// ---------------------------------------------------------------------------
// 1. Active users right now (15-minute window), split per institute
// ---------------------------------------------------------------------------

export interface ActiveNowRow {
  institute_id: string | null;
  users: number;
}

export function useActiveNow() {
  return useQuery({
    queryKey: ["pulse", "active-now"],
    queryFn: () =>
      pulseQuery<ActiveNowRow>(
        "auth_service",
        `SELECT nullif(institute_id, '') AS institute_id,
                count(DISTINCT user_id)::int AS users
           FROM user_activity_log
          WHERE created_at > now() - interval '15 minutes'
          GROUP BY 1
          ORDER BY 2 DESC`,
      ),
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// 2. Hourly unique users, last 24h (sparkline)
// ---------------------------------------------------------------------------

export interface HourlyActiveRow {
  hour: string;
  users: number;
}

export function useActiveSparkline() {
  return useQuery({
    queryKey: ["pulse", "active-sparkline"],
    queryFn: () =>
      pulseQuery<HourlyActiveRow>(
        "auth_service",
        `SELECT date_trunc('hour', created_at) AS hour,
                count(DISTINCT user_id)::int AS users
           FROM user_activity_log
          WHERE created_at > now() - interval '24 hours'
          GROUP BY 1
          ORDER BY 1`,
      ),
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 3. AI tutor / chatbot questions in the last 24h, per institute
// ---------------------------------------------------------------------------

export interface AiChatRow {
  institute_id: string | null;
  questions: number;
  sessions: number;
}

export function useAiChatToday() {
  return useQuery({
    queryKey: ["pulse", "ai-chat-today"],
    queryFn: () =>
      pulseQuery<AiChatRow>(
        "admin_core_service",
        `SELECT nullif(s.institute_id::text, '') AS institute_id,
                count(*) FILTER (WHERE lower(m.message_type) = 'user')::int AS questions,
                count(DISTINCT m.session_id)::int AS sessions
           FROM chat_messages m
           JOIN chat_sessions s ON s.id = m.session_id
          WHERE m.created_at > now() - interval '24 hours'
          GROUP BY 1
          ORDER BY 2 DESC`,
      ),
    refetchInterval: 2 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 4. Live classes: scheduled today + happening right now
// ---------------------------------------------------------------------------

export interface LiveClassesRow {
  scheduled_today: number;
  live_now: number;
}

export function useLiveClassesToday() {
  return useQuery({
    queryKey: ["pulse", "live-classes"],
    queryFn: async () => {
      const rows = await pulseQuery<LiveClassesRow>(
        "admin_core_service",
        `SELECT count(*)::int AS scheduled_today,
                count(*) FILTER (
                  WHERE (meeting_date + start_time) <= now()
                    AND (meeting_date + coalesce(last_entry_time, start_time + interval '2 hours')) >= now()
                )::int AS live_now
           FROM session_schedules
          WHERE meeting_date = CURRENT_DATE
            AND coalesce(status, '') NOT IN ('CANCELLED', 'DELETED')`,
      );
      return rows[0];
    },
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// 5. Learning activity, last 24h (content consumption)
// ---------------------------------------------------------------------------

export interface LearningActivityRow {
  video_events: number;
  doc_events: number;
  learners_learning: number;
  engaged_minutes: number;
}

export function useLearningActivity() {
  return useQuery({
    queryKey: ["pulse", "learning-activity"],
    queryFn: async () => {
      const rows = await pulseQuery<LearningActivityRow>(
        "admin_core_service",
        `SELECT (SELECT count(*)::int FROM video_tracked WHERE created_at > now() - interval '24 hours') AS video_events,
                (SELECT count(*)::int FROM document_tracked WHERE created_at > now() - interval '24 hours') AS doc_events,
                (SELECT count(DISTINCT user_id)::int FROM activity_log WHERE created_at > now() - interval '24 hours') AS learners_learning,
                (SELECT (coalesce(sum(engaged_ms), 0) / 60000)::int FROM activity_log WHERE created_at > now() - interval '24 hours') AS engaged_minutes`,
      );
      return rows[0];
    },
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 6. Assessment attempts, last 24h
// ---------------------------------------------------------------------------

export interface AttemptsRow {
  attempts: number;
  students: number;
}

export function useAttemptsToday() {
  return useQuery({
    queryKey: ["pulse", "attempts-today"],
    queryFn: async () => {
      const rows = await pulseQuery<AttemptsRow>(
        "assessment_service",
        `SELECT count(*)::int AS attempts,
                count(DISTINCT registration_id)::int AS students
           FROM student_attempt
          WHERE start_time > now() - interval '24 hours'`,
      );
      return rows[0];
    },
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 7. Growth funnel, last 24h: new leads + new enrollments
// ---------------------------------------------------------------------------

export interface GrowthRow {
  new_leads: number;
  new_enrollments: number;
}

export function useGrowthToday() {
  return useQuery({
    queryKey: ["pulse", "growth-today"],
    queryFn: async () => {
      const rows = await pulseQuery<GrowthRow>(
        "admin_core_service",
        `SELECT (SELECT count(*)::int FROM user_lead_profile WHERE created_at > now() - interval '24 hours') AS new_leads,
                (SELECT count(*)::int FROM student_session_institute_group_mapping WHERE created_at > now() - interval '24 hours') AS new_enrollments`,
      );
      return rows[0];
    },
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 8. Payments, last 24h
// ---------------------------------------------------------------------------

export interface PaymentsRow {
  paid_count: number;
  paid_amount: number;
  pending_count: number;
  failed_count: number;
}

export function usePaymentsToday() {
  return useQuery({
    queryKey: ["pulse", "payments-today"],
    queryFn: async () => {
      const rows = await pulseQuery<PaymentsRow>(
        "admin_core_service",
        `SELECT count(*) FILTER (WHERE payment_status = 'PAID')::int AS paid_count,
                coalesce(sum(payment_amount) FILTER (WHERE payment_status = 'PAID'), 0)::numeric(14,0) AS paid_amount,
                count(*) FILTER (WHERE payment_status = 'PAYMENT_PENDING')::int AS pending_count,
                count(*) FILTER (WHERE payment_status = 'FAILED')::int AS failed_count
           FROM payment_log
          WHERE date > now() - interval '24 hours'`,
      );
      return rows[0];
    },
    refetchInterval: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// 9. AI credit burn by feature, last 24h
// ---------------------------------------------------------------------------

export interface AiBurnRow {
  request_type: string;
  requests: number;
  credits: number;
}

export function useAiBurnToday() {
  return useQuery({
    queryKey: ["pulse", "ai-burn-today"],
    queryFn: () =>
      pulseQuery<AiBurnRow>(
        "admin_core_service",
        `SELECT coalesce(request_type, 'unknown') AS request_type,
                count(*)::int AS requests,
                coalesce(sum(credits_used), 0)::float AS credits
           FROM ai_token_usage
          WHERE created_at > now() - interval '24 hours'
          GROUP BY 1
          ORDER BY 3 DESC, 2 DESC`,
      ),
    refetchInterval: 5 * 60_000,
  });
}
