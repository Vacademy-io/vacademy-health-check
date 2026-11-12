import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { SpendBreakdownRow } from "@/types/external-apis";
import type { VendorBalance } from "@/components/external-apis/balances";

// Two sources, on purpose:
// - AI call metadata and cost come from ai_usage_event through the analytics-api SQL proxy,
//   as Live Pulse does. That proxy only checks is_root_user, so these queries must stay free
//   of payloads and personal fields (no context, actor or subject columns).
// - Stored vendor bodies and logs come from allowlisted super-admin endpoints on
//   notification-service and admin-core. Key accounts come from ai-service.

const QUERY_ENDPOINT = "/analytics-api/query";
const AI_DB = "admin_core_service";

export const AI_PAGE_SIZE = 50;

// A recorded provider or route is a fact. Older rows recorded neither, so the rest is worked
// out and prefixed "likely:" for the page to say so: an LLM call from today's route map (it may
// have changed since), and a few features from the vendor their code uses. Anything else is
// only known by the model's maker ("model:"), or by nothing but its feature ("none:" and the
// feature's label), so untracked usage still says what it was for.
const ROUTE_MAP_SQL = `(SELECT (setting_value #>> '{}')::jsonb FROM ai_platform_settings WHERE setting_key = 'llm.model_routes')`;
const vendorSql = (t = "") => `coalesce(
    nullif(${t}provider, ''),
    nullif(${t}router, ''),
    CASE WHEN ${t}model_id IS NOT NULL AND ${t}prompt_tokens + ${t}completion_tokens > 0 THEN 'likely:' ||
      CASE WHEN ${t}byo_key THEN 'openrouter'
           ELSE coalesce(${ROUTE_MAP_SQL} -> ${t}model_id ->> 'router', ${ROUTE_MAP_SQL} ->> ${t}model_id, 'openrouter')
      END
    END,
    CASE ${t}use_case
      WHEN 'telephony' THEN 'likely:plivo'
      WHEN 'ai_calling' THEN 'likely:voice_bot'
      WHEN 'tts' THEN 'likely:speech'
      WHEN 'transcription' THEN 'likely:speech'
      WHEN 'stock_media' THEN 'likely:stock_media'
      WHEN 'email_send' THEN 'likely:email'
      WHEN 'embedding' THEN 'likely:openrouter'
    END,
    CASE WHEN ${t}model_id LIKE '%/%' THEN 'model:' || split_part(${t}model_id, '/', 1) END,
    'none:' || coalesce(
      (SELECT uc.label FROM ai_use_case_catalog uc WHERE uc.use_case = ${t || "ai_usage_event."}use_case),
      ${t}use_case, 'unknown'))`;

async function dbQuery<Row>(db: string, sql: string, params: unknown[]): Promise<Row[]> {
  const { data } = await api.post<{ rows: Row[] }>(QUERY_ENDPOINT, { db, sql, params });
  return data.rows;
}

const aiQuery = <Row>(sql: string, params: unknown[]) => dbQuery<Row>(AI_DB, sql, params);

export interface ProviderTotalsRow {
  provider: string;
  calls: number;
  cost_usd: number;
  /** Calls with no recorded cost. Their spend is missing from cost_usd. */
  unpriced_calls: number;
  credits: number;
  tokens: number;
  unbilled_calls: number;
  dropped_calls: number;
}

export function useProviderTotals(hours: number) {
  return useQuery({
    queryKey: ["external-apis", "provider-totals", hours],
    queryFn: () =>
      aiQuery<ProviderTotalsRow>(
        `SELECT ${vendorSql()} AS provider,
                count(*)::int AS calls,
                coalesce(sum(real_cost_usd), 0)::float8 AS cost_usd,
                (count(*) FILTER (WHERE real_cost_usd IS NULL))::int AS unpriced_calls,
                coalesce(sum(credits_charged - refunded_credits), 0)::float8 AS credits,
                coalesce(sum(prompt_tokens + completion_tokens), 0)::float8 AS tokens,
                (count(*) FILTER (WHERE free_reason = 'UNBILLED_GAP'))::int AS unbilled_calls,
                (count(*) FILTER (WHERE charge_status = 'DROPPED_INSUFFICIENT'))::int AS dropped_calls
           FROM ai_usage_event
          WHERE occurred_at > now() - make_interval(hours => $1::int)
          GROUP BY 1
          ORDER BY cost_usd DESC, calls DESC`,
        [hours],
      ),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export interface FeatureCostRow {
  use_case: string;
  feature: string;
  feature_group: string;
  vendor: string;
  model_id: string | null;
  calls: number;
  cost_usd: number;
  unpriced_calls: number;
  credits: number;
}

/** Where cost comes from: each feature, split by the vendor and model that served it. */
export function useFeatureCosts(hours: number) {
  return useQuery({
    queryKey: ["external-apis", "feature-costs", hours],
    queryFn: () =>
      aiQuery<FeatureCostRow>(
        `SELECT e.use_case,
                coalesce(c.label, e.use_case) AS feature,
                e.feature_group,
                ${vendorSql("e.")} AS vendor,
                e.model_id,
                count(*)::int AS calls,
                coalesce(sum(e.real_cost_usd), 0)::float8 AS cost_usd,
                (count(*) FILTER (WHERE e.real_cost_usd IS NULL))::int AS unpriced_calls,
                coalesce(sum(e.credits_charged - e.refunded_credits), 0)::float8 AS credits
           FROM ai_usage_event e
           LEFT JOIN ai_use_case_catalog c ON c.use_case = e.use_case
          WHERE e.occurred_at > now() - make_interval(hours => $1::int)
          GROUP BY 1, 2, 3, 4, 5
          ORDER BY cost_usd DESC, credits DESC
          LIMIT 300`,
        [hours],
      ),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export type SpendBreakdown = "vendor" | "feature";

export type { SpendBreakdownRow };

export function useSpendBreakdown(hours: number, by: SpendBreakdown) {
  // Hourly bars up to two days, then daily, matching the AI Usage page.
  const unit = hours <= 48 ? "hour" : "day";
  const series = by === "vendor" ? vendorSql("e.") : "coalesce(c.label, e.use_case)";
  return useQuery({
    queryKey: ["external-apis", "spend-breakdown", hours, by],
    queryFn: () =>
      aiQuery<SpendBreakdownRow>(
        `SELECT date_trunc($2::text, e.occurred_at) AS bucket,
                ${series} AS series,
                coalesce(sum(e.real_cost_usd), 0)::float8 AS cost_usd,
                coalesce(sum(e.credits_charged - e.refunded_credits), 0)::float8 AS credits
           FROM ai_usage_event e
           LEFT JOIN ai_use_case_catalog c ON c.use_case = e.use_case
          WHERE e.occurred_at > now() - make_interval(hours => $1::int)
          GROUP BY 1, 2
          ORDER BY 1`,
        [hours, unit],
      ),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export interface AiCallRow {
  id: string;
  occurred_at: string;
  provider: string | null;
  model_id: string | null;
  use_case: string;
  feature: string;
  source_service: string;
  institute_id: string | null;
  institute_name: string | null;
  charge_status: string;
  billing_mode: string;
  free_reason: string | null;
  byo_key: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  characters: number;
  seconds: number;
  real_cost_usd: number | null;
  cost_source: string;
  credits_charged: number;
  refunded_credits: number;
  ledger_tx_id: string | null;
  price_snapshot: unknown;
}

export interface AiCallFilters {
  provider?: string;
  chargeStatus?: string;
}

export function useAiCalls(hours: number, filters: AiCallFilters, page: number) {
  return useQuery({
    queryKey: ["external-apis", "ai-calls", hours, filters, page],
    queryFn: () =>
      aiQuery<AiCallRow>(
        `SELECT e.id, e.occurred_at, ${vendorSql("e.")} AS provider, e.model_id, e.use_case,
                coalesce(c.label, e.use_case) AS feature, e.source_service,
                e.institute_id, i.name AS institute_name, e.charge_status, e.billing_mode, e.free_reason,
                e.byo_key, e.prompt_tokens::float8 AS prompt_tokens,
                e.completion_tokens::float8 AS completion_tokens, e.characters,
                e.seconds::float8 AS seconds, e.real_cost_usd::float8 AS real_cost_usd, e.cost_source,
                e.credits_charged::float8 AS credits_charged,
                e.refunded_credits::float8 AS refunded_credits, e.ledger_tx_id, e.price_snapshot
           FROM ai_usage_event e
           LEFT JOIN institutes i ON i.id = e.institute_id
           LEFT JOIN ai_use_case_catalog c ON c.use_case = e.use_case
          WHERE e.occurred_at > now() - make_interval(hours => $1::int)
            AND ($2::text IS NULL OR ${vendorSql("e.")} = $2)
            AND ($3::text IS NULL OR e.charge_status = $3)
          ORDER BY e.occurred_at DESC
          LIMIT $4::int OFFSET $5::int`,
        [
          hours,
          filters.provider ?? null,
          filters.chargeStatus ?? null,
          // One extra row tells us whether there is a next page without a count(*).
          AI_PAGE_SIZE + 1,
          page * AI_PAGE_SIZE,
        ],
      ),
    placeholderData: keepPreviousData,
  });
}

export interface CommunicationLogSummary {
  id: string;
  source: "WHATSAPP" | "EMAIL";
  sourceId: string | null;
  status: "INITIATED" | "SUCCESS" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationLogPage {
  content: CommunicationLogSummary[];
  totalElements: number;
  totalPages: number;
  page: number;
}

export interface CommunicationLogDetail {
  summary: CommunicationLogSummary;
  payload: string | null;
  response: string | null;
}

export interface CommunicationLogFilters {
  source?: string;
  status?: string;
}

export interface LoggedVendor {
  vendor: string;
  source_service: string;
  first_seen_at: string;
  last_seen_at: string;
  calls: number;
  failed_calls: number;
}

const LOGGED_VENDORS_QUERY = ["external-apis", "logged-vendors"];

export function useLoggedVendors(hours: number) {
  return useQuery({
    queryKey: [...LOGGED_VENDORS_QUERY, hours],
    queryFn: async () => {
      const { data } = await api.get<{ vendors: LoggedVendor[]; auto_capture: boolean; tables_ready: boolean }>(
        `${API_PREFIXES.AI}/external-apis/vendors`,
        { params: { hours } },
      );
      return data;
    },
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useSetAutoCapture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await api.put(`${API_PREFIXES.AI}/ai-settings/external_apis.auto_capture`, { value: enabled });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LOGGED_VENDORS_QUERY }),
  });
}

export function useCommunicationLogs(hours: number, filters: CommunicationLogFilters, page: number) {
  return useQuery({
    queryKey: ["external-apis", "communication-logs", hours, filters, page],
    queryFn: async () => {
      const { data } = await api.get<CommunicationLogPage>(
        `${API_PREFIXES.NOTIFICATION}/external-communication-logs`,
        { params: { hours, page, size: 50, ...filters } },
      );
      return data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export type VendorLogSource = "telephony" | "payments" | "webhooks" | "calls";

export interface VendorLogRow {
  id: string;
  occurred_at: string;
  vendor: string | null;
  operation: string | null;
  status: string | null;
  error: string | null;
  institute_id: string | null;
  institute_name: string | null;
  amount: number | null;
  currency: string | null;
  duration_ms: number | null;
  credits_billed: boolean | null;
  /** The vendor's HTTP status, for logged vendor calls. Null when there was no response. */
  http_status?: number | null;
}

export interface VendorLogPage {
  content: VendorLogRow[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
}

export interface VendorLogFilters {
  vendor?: string;
  status?: string;
}

export function useVendorLogs(source: VendorLogSource, hours: number, filters: VendorLogFilters, page: number) {
  return useQuery({
    queryKey: ["external-apis", "vendor-logs", source, hours, filters, page],
    queryFn: async () => {
      const { data } = await api.get<VendorLogPage>(
        `${API_PREFIXES.ADMIN_CORE}/external-apis/logs/${source}`,
        { params: { hours, page, size: 50, ...filters } },
      );
      return data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export type RecentCallSource = "ai" | VendorLogSource;

export interface RecentCallRow {
  source: RecentCallSource;
  id: string;
  occurred_at: string;
  vendor: string | null;
  /** The feature for AI calls; the operation, direction or event for the rest. */
  operation: string | null;
  /** The model for AI calls, the HTTP status for logged calls. */
  detail: string | null;
  status: string | null;
  failed: boolean;
  institute_id: string | null;
  institute_name: string | null;
  amount: number | null;
  currency: string | null;
  credits: number | null;
  duration_ms: number | null;
  tokens: number | null;
  error: string | null;
}

export interface RecentCallFilters {
  source?: RecentCallSource;
  failedOnly?: boolean;
}

export const RECENT_PAGE_SIZE = 50;

// Every call admin-core's database records, newest first. Metadata only, under the SQL proxy
// rule at the top of this file: bodies come one row at a time from the masked detail endpoint.
// Each source is cut to (offset + page) rows before the union, so a page never sorts more.
// Timestamps without a zone are UTC, as SuperAdminExternalApiLogService reads them.
const RECENT_CALLS_SQL = `
SELECT f.*, i.name AS institute_name
  FROM (
    (SELECT 'ai' AS source, e.id::text AS id, e.occurred_at, ${vendorSql("e.")} AS vendor,
            coalesce(c.label, e.use_case) AS operation, e.model_id AS detail, e.charge_status AS status,
            FALSE AS failed, e.institute_id::text AS institute_id, e.real_cost_usd::float8 AS amount,
            'USD' AS currency, (e.credits_charged - e.refunded_credits)::float8 AS credits,
            NULL::float8 AS duration_ms, (e.prompt_tokens + e.completion_tokens)::float8 AS tokens,
            NULL::text AS error
       FROM ai_usage_event e
       LEFT JOIN ai_use_case_catalog c ON c.use_case = e.use_case
      WHERE ($2::text IS NULL OR $2::text = 'ai') AND $3::boolean IS NOT TRUE
        AND e.occurred_at > now() - make_interval(hours => $1::int)
      ORDER BY e.occurred_at DESC LIMIT $4::int)
    UNION ALL
    (SELECT 'calls', l.id::text, l.occurred_at, l.vendor, l.operation, l.http_status::text, l.status,
            l.status = 'FAILED', l.institute_id, l.cost_amount::float8, l.cost_currency, NULL::float8,
            l.duration_ms::float8, NULL::float8, l.error_message
       FROM external_api_call_log l
      WHERE ($2::text IS NULL OR $2::text = 'calls') AND ($3::boolean IS NOT TRUE OR l.status = 'FAILED')
        AND l.occurred_at > now() - make_interval(hours => $1::int)
      ORDER BY l.occurred_at DESC LIMIT $4::int)
    UNION ALL
    (SELECT 'telephony', t.id::text, t.created_at AT TIME ZONE 'UTC', t.provider_type, t.direction, NULL, t.status,
            t.status ILIKE '%fail%' OR t.status ILIKE '%error%', t.institute_id, t.price::float8, NULL,
            NULL::float8, t.duration_seconds * 1000.0, NULL::float8, t.termination_reason
       FROM telephony_call_log t
      WHERE ($2::text IS NULL OR $2::text = 'telephony')
        AND ($3::boolean IS NOT TRUE OR t.status ILIKE '%fail%' OR t.status ILIKE '%error%')
        AND t.created_at > (now() - make_interval(hours => $1::int)) AT TIME ZONE 'UTC'
      ORDER BY t.created_at DESC LIMIT $4::int)
    UNION ALL
    (SELECT 'payments', p.id::text, p.created_at AT TIME ZONE 'UTC', p.vendor, p.order_status, NULL, p.payment_status,
            coalesce(p.payment_status ILIKE '%fail%', FALSE), NULL, p.payment_amount::float8, p.currency,
            NULL::float8, NULL::float8, NULL::float8, NULL
       FROM payment_log p
      WHERE ($2::text IS NULL OR $2::text = 'payments') AND ($3::boolean IS NOT TRUE OR p.payment_status ILIKE '%fail%')
        AND p.created_at > (now() - make_interval(hours => $1::int)) AT TIME ZONE 'UTC'
      ORDER BY p.created_at DESC LIMIT $4::int)
    UNION ALL
    (SELECT 'webhooks', w.id::text, w.created_at AT TIME ZONE 'UTC', w.vendor, w.event_type, NULL, w.status,
            w.status ILIKE '%fail%' OR w.status ILIKE '%error%', NULL, NULL::float8, NULL,
            NULL::float8, NULL::float8, NULL::float8, w.error_message
       FROM web_hook w
      WHERE ($2::text IS NULL OR $2::text = 'webhooks')
        AND ($3::boolean IS NOT TRUE OR w.status ILIKE '%fail%' OR w.status ILIKE '%error%')
        AND w.created_at > (now() - make_interval(hours => $1::int)) AT TIME ZONE 'UTC'
      ORDER BY w.created_at DESC LIMIT $4::int)
  ) f
  LEFT JOIN institutes i ON i.id = f.institute_id
 ORDER BY f.occurred_at DESC
 LIMIT $5::int OFFSET $6::int`;

export function useRecentCalls(hours: number, filters: RecentCallFilters, page: number) {
  return useQuery({
    queryKey: ["external-apis", "recent-calls", hours, filters, page],
    queryFn: () => {
      const offset = page * RECENT_PAGE_SIZE;
      // One extra row tells us whether there is a next page without a count(*).
      const take = RECENT_PAGE_SIZE + 1;
      return aiQuery<RecentCallRow>(RECENT_CALLS_SQL, [
        hours, filters.source ?? null, filters.failedOnly ?? false, offset + take, take, offset,
      ]);
    },
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Bodies are fetched only when a row is opened, so each read is logged server-side. */
export function useVendorLogDetail(source: VendorLogSource, id: string | null) {
  return useQuery({
    queryKey: ["external-apis", "vendor-log", source, id],
    queryFn: async () => {
      const { data } = await api.get<{ payload: string | null; response: string | null }>(
        `${API_PREFIXES.ADMIN_CORE}/external-apis/logs/${source}/${id}`,
      );
      return data;
    },
    enabled: id != null,
    retry: false,
  });
}

export interface NotificationLogSummary {
  id: string;
  notificationType: string;
  source: string | null;
  instituteId: string | null;
  deliveryStatus: string | null;
  deliveryErrorCode: string | null;
  deliveryErrorMessage: string | null;
  notificationDate: string | null;
}

export function useNotificationLogs(
  instituteId: string | undefined,
  hours: number,
  notificationType: string | undefined,
  page: number,
) {
  return useQuery({
    queryKey: ["external-apis", "notification-logs", instituteId, hours, notificationType, page],
    queryFn: async () => {
      const { data } = await api.get<{ content: NotificationLogSummary[]; totalPages: number }>(
        `${API_PREFIXES.NOTIFICATION}/notification-logs`,
        { params: { instituteId, hours, notificationType, page, size: 50 } },
      );
      return data;
    },
    enabled: !!instituteId,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useNotificationLogDetail(id: string | null) {
  return useQuery({
    queryKey: ["external-apis", "notification-log", id],
    queryFn: async () => {
      const { data } = await api.get<{ payload: string | null; body: string | null }>(
        `${API_PREFIXES.NOTIFICATION}/notification-logs/${id}`,
      );
      return data;
    },
    enabled: id != null,
    retry: false,
  });
}

export type OwnerSource = "stored" | "declared" | "unknown";

export interface PlatformKeyRow {
  vendor: string;
  credential: string;
  service: string;
  /** Null when another service holds the key, so ai-service cannot tell. */
  configured: boolean | null;
  key_hint: string | null;
  /** What this row's account and price are saved under. */
  details_key: string;
  owner: string | null;
  owner_source: OwnerSource;
  price: number | null;
  price_unit: string | null;
  currency: string | null;
  notes: string | null;
}

export interface KeyDetailsUpdate {
  details_key: string;
  account: string | null;
  price: number | null;
  price_unit: string | null;
  currency: string | null;
  notes: string | null;
}

export interface InstituteKeyRow {
  vendor: string;
  credential: string;
  institute_id: string;
  institute_name: string | null;
  account_ref: string | null;
}

export interface KeyAccounts {
  platform_keys: PlatformKeyRow[];
  institute_keys: InstituteKeyRow[];
  price_units: string[];
  currencies: string[];
}

const KEY_ACCOUNTS_QUERY = ["external-apis", "key-accounts"];

export function useKeyAccounts() {
  return useQuery({
    queryKey: KEY_ACCOUNTS_QUERY,
    queryFn: async () => {
      const { data } = await api.get<KeyAccounts>(`${API_PREFIXES.AI}/external-apis/key-accounts`);
      return data;
    },
    retry: false,
  });
}

export interface OpenRouterIdentity {
  creator_user_id: string | null;
  limit: number | null;
  limit_remaining: number | null;
  usage_monthly: number | null;
  is_free_tier: boolean | null;
}

export function useOpenRouterCheck() {
  return useMutation({
    mutationFn: async (keyHint: string) => {
      const { data } = await api.post<OpenRouterIdentity>(
        `${API_PREFIXES.AI}/external-apis/key-accounts/openrouter-check`,
        { key_hint: keyHint },
      );
      return data;
    },
  });
}

export function useSaveKeyDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (details: KeyDetailsUpdate) => {
      await api.put(`${API_PREFIXES.AI}/external-apis/key-accounts/details`, details);
    },
    // Settings are cached for ~30s per replica, so other replicas can take that long to show this.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY_ACCOUNTS_QUERY }),
  });
}

/** Bodies are fetched only when a row is opened, so each read is logged server-side. */
export function useCommunicationLogDetail(id: string | null) {
  return useQuery({
    queryKey: ["external-apis", "communication-log", id],
    queryFn: async () => {
      const { data } = await api.get<CommunicationLogDetail>(
        `${API_PREFIXES.NOTIFICATION}/external-communication-logs/${id}`,
      );
      return data;
    },
    enabled: id != null,
    retry: false,
  });
}

// Live balances, each from the vendor's own API: ai-service for the keys it holds (OpenRouter,
// fal.ai, RunPod), admin-core for every institute's Exotel and Plivo account. Both cache for
// ten minutes and accept a forced refresh at most every 30 seconds.
export const BALANCE_SOURCES = {
  platform: `${API_PREFIXES.AI}/external-apis/balances`,
  telephony: `${API_PREFIXES.ADMIN_CORE}/external-apis/telephony-balances`,
} as const;

export type BalanceSource = keyof typeof BALANCE_SOURCES;

const balancesQueryKey = (source: BalanceSource) => ["external-apis", "balances", source];

const fetchBalances = async (source: BalanceSource, refresh: boolean): Promise<VendorBalance[]> => {
  const { data } = await api.get<{ balances: VendorBalance[] }>(BALANCE_SOURCES[source], {
    params: refresh ? { refresh: true } : undefined,
  });
  return data.balances ?? [];
};

export function useVendorBalances(source: BalanceSource) {
  return useQuery({
    queryKey: balancesQueryKey(source),
    queryFn: () => fetchBalances(source, false),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Asks both services to check the vendors again; a source that fails keeps its last rows. */
export function useRefreshBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const sources = Object.keys(BALANCE_SOURCES) as BalanceSource[];
      const results = await Promise.allSettled(sources.map((s) => fetchBalances(s, true)));
      results.forEach((r, i) => {
        if (r.status === "fulfilled") queryClient.setQueryData(balancesQueryKey(sources[i]), r.value);
      });
      if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
    },
  });
}

// --- Tab summaries. Aggregates only (counts and sums), under the SQL proxy rule at the top. ---

const insightQuery = <Row>(name: string, hours: number, sql: string) =>
  ({
    queryKey: ["external-apis", "insight", name, hours],
    queryFn: () => aiQuery<Row>(sql, [hours]),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  }) as const;

export interface AiPeriodRow {
  /** True for the selected window, false for the window of the same length before it. */
  current: boolean;
  calls: number;
  cost_usd: number;
  credits: number;
  dropped_calls: number;
  institutes: number;
}

export function useAiPeriods(hours: number) {
  return useQuery(insightQuery<AiPeriodRow>("ai-periods", hours, `
    SELECT occurred_at > now() - make_interval(hours => $1::int) AS current,
           count(*)::int AS calls,
           coalesce(sum(real_cost_usd), 0)::float8 AS cost_usd,
           coalesce(sum(credits_charged - refunded_credits), 0)::float8 AS credits,
           (count(*) FILTER (WHERE charge_status = 'DROPPED_INSUFFICIENT'))::int AS dropped_calls,
           count(DISTINCT institute_id)::int AS institutes
      FROM ai_usage_event
     WHERE occurred_at > now() - make_interval(hours => $1::int * 2)
     GROUP BY 1`));
}

export interface InstituteCostRow {
  institute_id: string;
  institute_name: string | null;
  calls: number;
  cost_usd: number;
  credits: number;
  dropped_calls: number;
}

export function useAiTopInstitutes(hours: number) {
  return useQuery(insightQuery<InstituteCostRow>("ai-institutes", hours, `
    SELECT e.institute_id::text AS institute_id, i.name AS institute_name,
           count(*)::int AS calls,
           coalesce(sum(e.real_cost_usd), 0)::float8 AS cost_usd,
           coalesce(sum(e.credits_charged - e.refunded_credits), 0)::float8 AS credits,
           (count(*) FILTER (WHERE e.charge_status = 'DROPPED_INSUFFICIENT'))::int AS dropped_calls
      FROM ai_usage_event e
      LEFT JOIN institutes i ON i.id = e.institute_id::text
     WHERE e.occurred_at > now() - make_interval(hours => $1::int) AND e.institute_id IS NOT NULL
     GROUP BY 1, 2
     ORDER BY cost_usd DESC, credits DESC
     LIMIT 8`));
}

export interface ChargeOutcomeRow {
  charge_status: string;
  calls: number;
  cost_usd: number;
  credits: number;
}

export function useChargeOutcomes(hours: number) {
  return useQuery(insightQuery<ChargeOutcomeRow>("ai-charges", hours, `
    SELECT charge_status, count(*)::int AS calls,
           coalesce(sum(real_cost_usd), 0)::float8 AS cost_usd,
           coalesce(sum(credits_charged - refunded_credits), 0)::float8 AS credits
      FROM ai_usage_event
     WHERE occurred_at > now() - make_interval(hours => $1::int)
     GROUP BY 1
     ORDER BY calls DESC`));
}

// telephony_call_log, payment_log and web_hook keep UTC in zoneless timestamps.
const UTC_WINDOW = "(now() - make_interval(hours => $1::int)) AT TIME ZONE 'UTC'";

export interface TelephonyStatusRow {
  provider: string;
  status: string;
  calls: number;
  seconds: number;
  /** Sum of the price the provider reported. Exotel reports one (INR); Plivo does not. */
  price: number;
  priced_calls: number;
  billed_calls: number;
}

export function useTelephonySummary(hours: number) {
  return useQuery(insightQuery<TelephonyStatusRow>("telephony", hours, `
    SELECT provider_type AS provider, status, count(*)::int AS calls,
           coalesce(sum(duration_seconds), 0)::float8 AS seconds,
           coalesce(sum(price), 0)::float8 AS price,
           (count(*) FILTER (WHERE price IS NOT NULL))::int AS priced_calls,
           (count(*) FILTER (WHERE credits_billed_at IS NOT NULL))::int AS billed_calls
      FROM telephony_call_log
     WHERE created_at > ${UTC_WINDOW}
     GROUP BY 1, 2`));
}

export interface TelephonyInstituteRow {
  institute_id: string;
  institute_name: string | null;
  provider: string;
  calls: number;
  connected: number;
  seconds: number;
  price: number;
}

export function useTelephonyTopInstitutes(hours: number) {
  return useQuery(insightQuery<TelephonyInstituteRow>("telephony-institutes", hours, `
    SELECT t.institute_id, i.name AS institute_name, t.provider_type AS provider,
           count(*)::int AS calls,
           (count(*) FILTER (WHERE t.status = 'COMPLETED'))::int AS connected,
           coalesce(sum(t.duration_seconds), 0)::float8 AS seconds,
           coalesce(sum(t.price), 0)::float8 AS price
      FROM telephony_call_log t
      LEFT JOIN institutes i ON i.id = t.institute_id
     WHERE t.created_at > ${UTC_WINDOW}
     GROUP BY 1, 2, 3
     ORDER BY seconds DESC, calls DESC
     LIMIT 10`));
}

export interface PaymentSummaryRow {
  vendor: string;
  currency: string;
  status: string;
  payments: number;
  amount: number;
}

export function usePaymentSummary(hours: number) {
  return useQuery(insightQuery<PaymentSummaryRow>("payments", hours, `
    SELECT coalesce(nullif(vendor, ''), 'unknown') AS vendor,
           coalesce(upper(nullif(currency, '')), '') AS currency,
           coalesce(nullif(payment_status, ''), 'UNKNOWN') AS status,
           count(*)::int AS payments,
           coalesce(sum(payment_amount), 0)::float8 AS amount
      FROM payment_log
     WHERE created_at > ${UTC_WINDOW}
     GROUP BY 1, 2, 3`));
}

export interface WebhookSummaryRow {
  vendor: string;
  status: string;
  events: number;
}

export function useWebhookSummary(hours: number) {
  return useQuery(insightQuery<WebhookSummaryRow>("webhooks", hours, `
    SELECT vendor, status, count(*)::int AS events
      FROM web_hook
     WHERE created_at > ${UTC_WINDOW}
     GROUP BY 1, 2`));
}

export interface LoggedCallSummaryRow {
  vendor: string;
  operation: string;
  calls: number;
  failed: number;
  cost: number;
  currency: string | null;
  avg_ms: number | null;
}

export function useLoggedCallSummary(hours: number) {
  return useQuery(insightQuery<LoggedCallSummaryRow>("logged-calls", hours, `
    SELECT vendor, operation, count(*)::int AS calls,
           (count(*) FILTER (WHERE status = 'FAILED'))::int AS failed,
           coalesce(sum(cost_amount), 0)::float8 AS cost,
           max(cost_currency) AS currency,
           avg(duration_ms)::float8 AS avg_ms
      FROM external_api_call_log
     WHERE occurred_at > now() - make_interval(hours => $1::int)
     GROUP BY 1, 2
     ORDER BY calls DESC`));
}

/** WATI bulk-send totals, read as page totals from the payload endpoint (one row per request). */
export function useCommunicationTotals(hours: number) {
  return useQuery({
    queryKey: ["external-apis", "insight", "communication", hours],
    queryFn: async () => {
      const total = async (status?: string) => {
        const { data } = await api.get<CommunicationLogPage>(
          `${API_PREFIXES.NOTIFICATION}/external-communication-logs`,
          { params: { hours, page: 0, size: 1, ...(status ? { status } : {}) } },
        );
        return data.totalElements ?? 0;
      };
      const [all, success, failed] = await Promise.all([total(), total("SUCCESS"), total("FAILED")]);
      return { all, success, failed };
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** This window and the one before it, for "up 20% on the 7 days before". */
export function useAiComparison(hours: number) {
  const periods = useAiPeriods(hours);
  const rows = periods.data ?? [];
  const empty = { current: false, calls: 0, cost_usd: 0, credits: 0, dropped_calls: 0, institutes: 0 };
  const pick = (current: boolean): AiPeriodRow => rows.find((r) => r.current === current) ?? { ...empty, current };
  return { now: pick(true), before: pick(false), ready: !!periods.data };
}

export interface LoggedFailureRow {
  vendor: string;
  http_status: number | null;
  failed: number;
  last_at: string;
}

/** Failed logged calls by vendor and HTTP status, most frequent first. */
export function useLoggedFailures(hours: number) {
  return useQuery(insightQuery<LoggedFailureRow>("logged-failures", hours, `
    SELECT vendor, http_status, count(*)::int AS failed, max(occurred_at) AS last_at
      FROM external_api_call_log
     WHERE occurred_at > now() - make_interval(hours => $1::int) AND status = 'FAILED'
     GROUP BY 1, 2
     ORDER BY failed DESC
     LIMIT 50`));
}

// --- Messaging, read from notification-service's own table through the same proxy. ---
// Aggregates only: never body, channel_id (the recipient), user_id or message_payload.

const NOTIFICATION_DB = "notification_service";
// notification_date is a zoneless timestamp holding UTC.
const NL_WINDOW = "notification_date > (now() - make_interval(hours => $1::int)) AT TIME ZONE 'UTC'";

const messagingQuery = <Row>(name: string, hours: number, sql: string) =>
  ({
    queryKey: ["external-apis", "messaging", name, hours],
    queryFn: () => dbQuery<Row>(NOTIFICATION_DB, sql, [hours]),
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
    retry: false,
  }) as const;

export interface MessageStatusRow {
  /** EMAIL or WHATSAPP_MESSAGE_OUTGOING. */
  channel: string;
  /** SENT, DELIVERED, READ or FAILED from the WhatsApp status webhook; NO_STATUS when none arrived (always for email). */
  status: string;
  sends: number;
  billable: number;
}

export function useMessageStatuses(hours: number) {
  return useQuery(messagingQuery<MessageStatusRow>("statuses", hours, `
    SELECT notification_type AS channel,
           coalesce(nullif(delivery_status, ''), 'NO_STATUS') AS status,
           count(*)::int AS sends,
           (count(*) FILTER (WHERE pricing_billable))::int AS billable
      FROM notification_log
     WHERE notification_type IN ('EMAIL', 'WHATSAPP_MESSAGE_OUTGOING') AND ${NL_WINDOW}
     GROUP BY 1, 2`));
}

export interface EmailEventRow {
  /** DELIVERY, BOUNCE, COMPLAINT, OPEN, CLICK, SEND, ... as SES reports it. */
  event: string;
  events: number;
}

export function useEmailEvents(hours: number) {
  // left(body, 30) and the window match idx_nl_email_event_window, so this is a range scan.
  return useQuery(messagingQuery<EmailEventRow>("email-events", hours, `
    SELECT upper(split_part(substr(left(body, 30), 14), E'\\n', 1)) AS event, count(*)::int AS events
      FROM notification_log
     WHERE notification_type = 'EMAIL_EVENT' AND ${NL_WINDOW} AND left(body, 30) LIKE 'Email Event: %'
     GROUP BY 1`));
}

export interface WhatsAppErrorRow {
  code: string;
  failed: number;
}

export function useWhatsAppErrors(hours: number) {
  return useQuery(messagingQuery<WhatsAppErrorRow>("wa-errors", hours, `
    SELECT coalesce(nullif(delivery_error_code, ''), 'none') AS code, count(*)::int AS failed
      FROM notification_log
     WHERE notification_type = 'WHATSAPP_MESSAGE_OUTGOING' AND delivery_status = 'FAILED' AND ${NL_WINDOW}
     GROUP BY 1
     ORDER BY failed DESC
     LIMIT 10`));
}

export interface WhatsAppPricingRow {
  category: string;
  messages: number;
}

/** Messages Meta says it bills for, by pricing category (marketing, utility, authentication, ...). */
export function useWhatsAppPricing(hours: number) {
  return useQuery(messagingQuery<WhatsAppPricingRow>("wa-pricing", hours, `
    SELECT lower(coalesce(nullif(pricing_category, ''), 'unknown')) AS category, count(*)::int AS messages
      FROM notification_log
     WHERE notification_type = 'WHATSAPP_MESSAGE_OUTGOING' AND pricing_billable AND ${NL_WINDOW}
     GROUP BY 1
     ORDER BY messages DESC`));
}

export interface MessagingInstituteRow {
  institute_id: string;
  institute_name?: string | null;
  emails: number;
  whatsapp: number;
  whatsapp_failed: number;
  billable: number;
}

/** Institutes sending the most, with names looked up in admin-core (a different database). */
export function useMessagingTopInstitutes(hours: number) {
  return useQuery({
    queryKey: ["external-apis", "messaging", "institutes", hours],
    queryFn: async () => {
      const rows = await dbQuery<MessagingInstituteRow>(NOTIFICATION_DB, `
        SELECT institute_id,
               (count(*) FILTER (WHERE notification_type = 'EMAIL'))::int AS emails,
               (count(*) FILTER (WHERE notification_type = 'WHATSAPP_MESSAGE_OUTGOING'))::int AS whatsapp,
               (count(*) FILTER (WHERE notification_type = 'WHATSAPP_MESSAGE_OUTGOING' AND delivery_status = 'FAILED'))::int AS whatsapp_failed,
               (count(*) FILTER (WHERE pricing_billable))::int AS billable
          FROM notification_log
         WHERE notification_type IN ('EMAIL', 'WHATSAPP_MESSAGE_OUTGOING') AND ${NL_WINDOW}
           AND institute_id IS NOT NULL AND institute_id <> ''
         GROUP BY 1
         ORDER BY count(*) DESC
         LIMIT 10`, [hours]);
      if (!rows.length) return rows;
      const names = await aiQuery<{ id: string; name: string | null }>(
        "SELECT id, name FROM institutes WHERE id = ANY($1::text[])",
        [rows.map((r) => r.institute_id)],
      ).catch(() => []);
      const byId = new Map(names.map((n) => [n.id, n.name]));
      return rows.map((r) => ({ ...r, institute_name: byId.get(r.institute_id) ?? null }));
    },
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
