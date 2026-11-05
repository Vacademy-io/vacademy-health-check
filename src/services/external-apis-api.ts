import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

// Two sources, on purpose:
// - AI call metadata and cost come from ai_usage_event through the analytics-api SQL proxy,
//   as Live Pulse does. That proxy only checks is_root_user, so these queries must stay free
//   of payloads and personal fields (no context, actor or subject columns).
// - Stored vendor bodies and logs come from allowlisted super-admin endpoints on
//   notification-service and admin-core. Key accounts come from ai-service.

const QUERY_ENDPOINT = "/analytics-api/query";
const AI_DB = "admin_core_service";

export const AI_PAGE_SIZE = 50;

// `provider` is optional on ai_usage_event and most writers leave it empty, so a vendor comes
// from the route when one was recorded. Failing that, a "maker/model" id names the model's
// maker only, which is marked so the page never passes it off as who was actually called.
const vendorSql = (t = "") => `coalesce(
    nullif(${t}provider, ''),
    nullif(${t}router, ''),
    CASE WHEN ${t}model_id LIKE '%/%' THEN 'model:' || split_part(${t}model_id, '/', 1) END,
    'none')`;

async function aiQuery<Row>(sql: string, params: unknown[]): Promise<Row[]> {
  const { data } = await api.post<{ rows: Row[] }>(QUERY_ENDPOINT, { db: AI_DB, sql, params });
  return data.rows;
}

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

export interface SpendBucketRow {
  bucket: string;
  cost_usd: number;
  credits: number;
}

export function useSpendSeries(hours: number) {
  // Hourly bars up to two days, then daily, matching the AI Usage page.
  const unit = hours <= 48 ? "hour" : "day";
  return useQuery({
    queryKey: ["external-apis", "spend-series", hours],
    queryFn: () =>
      aiQuery<SpendBucketRow>(
        `SELECT date_trunc($2::text, occurred_at) AS bucket,
                coalesce(sum(real_cost_usd), 0)::float8 AS cost_usd,
                coalesce(sum(credits_charged - refunded_credits), 0)::float8 AS credits
           FROM ai_usage_event
          WHERE occurred_at > now() - make_interval(hours => $1::int)
          GROUP BY 1
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
        `SELECT e.id, e.occurred_at, ${vendorSql("e.")} AS provider, e.model_id, e.use_case, e.source_service,
                e.institute_id, i.name AS institute_name, e.charge_status, e.billing_mode, e.free_reason,
                e.byo_key, e.prompt_tokens::float8 AS prompt_tokens,
                e.completion_tokens::float8 AS completion_tokens, e.characters,
                e.seconds::float8 AS seconds, e.real_cost_usd::float8 AS real_cost_usd, e.cost_source,
                e.credits_charged::float8 AS credits_charged,
                e.refunded_credits::float8 AS refunded_credits, e.ledger_tx_id, e.price_snapshot
           FROM ai_usage_event e
           LEFT JOIN institutes i ON i.id = e.institute_id
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
