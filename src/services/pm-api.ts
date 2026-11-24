// PM View data.
//
// ISOLATION RULE (tests/pm-isolation.test.ts enforces it):
//   * platform endpoints are only ever called with GET from here;
//   * every write goes to the PM store (/pm-api/v1/*), which is separate from the platform backend.
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import type { PmHistoryEntry, PmRecord, PmTaskState } from "@/lib/pm-record";
import type { AccountCredits, AccountUsage, CallLite } from "@/lib/pm-view";
import { addDays } from "@/lib/pm-range";
import { AI_TOOLS_SQL, FEATURE_KEYS, FEATURE_SQL, isReadOnlySql, PRODUCT_SQL, STAFF_SQL, type AiToolRow, type FeatureKey, type FeatureRow, type ReadOnlyDb, type StaffRow } from "@/lib/pm-insights";
import type { AIPaginatedResponse, CrossInstituteActiveUsersDTO, InstituteCreditItem, InstituteListItemDTO, InstituteUserDTO, SuperAdminPageResponse } from "@/types/api";

const KEY = ["super-admin", "pm-view"] as const;
export const PM_API = "/pm-api/v1";

// ---------------------------------------------------------------- platform (read-only)

/** Every institute on the platform, 500 per page. Read-only. */
export function usePlatformInstitutes() {
  return useQuery({
    queryKey: [...KEY, "institutes"],
    queryFn: async () => {
      const all: InstituteListItemDTO[] = [];
      for (let page = 0; page < 50; page++) {
        const { data } = await api.get<SuperAdminPageResponse<InstituteListItemDTO>>(`${API_PREFIXES.ADMIN_CORE}/institutes`, { params: { page, size: 500 } });
        all.push(...(data.content ?? []));
        if (page + 1 >= (data.total_pages ?? 0) || (data.content ?? []).length === 0) break;
      }
      return all;
    },
    staleTime: 5 * 60_000,
  });
}

/** Users signed in right now, per institute. Read-only. */
export function useActiveNow() {
  return useQuery({
    queryKey: [...KEY, "active-now"],
    queryFn: async () => (await api.get<CrossInstituteActiveUsersDTO>(`${API_PREFIXES.AUTH}/active-users`)).data,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Who has signed in, per institute, from each institute's user list (read-only). Only asked for the
 * institutes passed in (trial and demo accounts), one request each, cached for 5 minutes.
 */
export function useAccountUsage(instituteIds: string[]): { usage: Map<string, AccountUsage>; isLoading: boolean } {
  const results = useQueries({
    queries: instituteIds.map((id) => ({
      queryKey: [...KEY, "usage", id],
      queryFn: async (): Promise<AccountUsage> => {
        const { data } = await api.get<SuperAdminPageResponse<InstituteUserDTO>>(`${API_PREFIXES.AUTH}/institutes/${encodeURIComponent(id)}/users`, { params: { page: 0, size: 200 } });
        const users = data.content ?? [];
        const logins = users.map((u) => u.last_login_time).filter((t): t is string => !!t).sort();
        return { users: data.total_elements ?? users.length, loggedIn: logins.length, lastLogin: logins.at(-1) ?? null };
      },
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const usage = new Map<string, AccountUsage>();
  results.forEach((r, i) => r.data && usage.set(instituteIds[i], r.data));
  return { usage, isLoading: results.some((r) => r.isLoading) };
}

/** The AI service's own reason for a 422 ("page_size: Input should be less than or equal to 20"). */
function apiReason(e: unknown): string {
  const data = (e as { response?: { data?: { detail?: unknown; message?: string; error?: string } } })?.response?.data;
  if (Array.isArray(data?.detail))
    return data.detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(-1)[0] ?? ""}: ${d.msg ?? ""}`).join("; ");
  if (typeof data?.detail === "string") return data.detail;
  return data?.message ?? data?.error ?? (e as Error)?.message ?? String(e);
}

/**
 * AI credit balance for every institute (AI service, read-only). Uses exactly the parameters the
 * Credits page uses (20 per page, sorted by balance), fetching 10 pages at a time. Amounts arrive
 * as decimal strings ("109.12") and are converted to numbers.
 */
export function useCreditsMap() {
  return useQuery({
    queryKey: [...KEY, "credits", 2],
    queryFn: async () => {
      const m = new Map<string, AccountCredits>();
      const n = (v: unknown) => {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };
      const get = async (page: number) => {
        try {
          return (await api.get<AIPaginatedResponse<InstituteCreditItem>>(`${API_PREFIXES.AI}/credits/all`, { params: { page, page_size: 20, sort_by: "current_balance", sort_direction: "ASC" } })).data;
        } catch (e) {
          throw new Error(apiReason(e));
        }
      };
      const add = (d: AIPaginatedResponse<InstituteCreditItem>) => {
        for (const c of d.items ?? []) m.set(c.institute_id, { total: n(c.total_credits), used: n(c.used_credits), balance: n(c.current_balance), low: !!c.is_low_balance });
      };
      const first = await get(1);
      add(first);
      const pages = Math.min(first.total_pages ?? 1, 500);
      for (let start = 2; start <= pages; start += 10) {
        const batch = await Promise.all(Array.from({ length: Math.min(10, pages - start + 1) }, (_, i) => get(start + i)));
        batch.forEach(add);
      }
      return m;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Exact totals for a period from the platform's calls summary (read-only). */
export interface CallTotals {
  calls: number;
  minutes: number;
  billed_inr: number;
}

/** Same page size as the Calls page; at most 200 pages (10,000 calls). */
const CALL_PAGE = 50;
const CALL_MAX_PAGES = 200;

/**
 * Every AI call since `from` (YYYY-MM-DD), paged from the call log (read-only), plus the exact
 * totals. Only the fields the PM View needs are kept. Stops at 10,000 calls and says so (`capped`).
 */
/** AI calls from `from` (YYYY-MM-DD), up to and including `to` when given (else up to now). */
export function useCallsSince(from: string, to?: string) {
  // The API's `to` is exclusive, so ask for the start of the next day.
  const range = to ? { from, to: addDays(to, 1) } : { from };
  return useQuery({
    queryKey: [...KEY, "calls", from, to ?? null, CALL_PAGE],
    queryFn: async () => {
      type CallPage = { content: CallLite[]; total_elements: number; total_pages: number };
      const get = async (page: number): Promise<CallPage> => {
        try {
          return (await api.get<CallPage>(`${API_PREFIXES.ADMIN_CORE}/calls`, { params: { ...range, page, size: CALL_PAGE } })).data;
        } catch (e) {
          throw new Error(apiReason(e));
        }
      };
      const calls: CallLite[] = [];
      const add = (d: CallPage) => {
        for (const c of d.content ?? []) calls.push({ institute_id: c.institute_id, institute_name: c.institute_name, call_start: c.call_start, duration_seconds: c.duration_seconds, billed_inr: c.billed_inr });
      };
      const first = await get(0);
      add(first);
      const total = first.total_elements ?? 0;
      const pages = Math.min(first.total_pages ?? 1, CALL_MAX_PAGES);
      const capped = (first.total_pages ?? 1) > CALL_MAX_PAGES;
      for (let start = 1; start < pages; start += 10) {
        const batch = await Promise.all(Array.from({ length: Math.min(10, pages - start) }, (_, i) => get(start + i)));
        batch.forEach(add);
      }
      let totals: CallTotals | null = null;
      try {
        totals = (await api.get<CallTotals>(`${API_PREFIXES.ADMIN_CORE}/calls/summary`, { params: range })).data;
      } catch {
        totals = null;
      }
      return { calls, total, capped, totals };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------- platform database (read-only)

/**
 * The analytics proxy the Live Pulse page uses (vacademy_devops/analytics-api.yaml). It runs SELECTs
 * against the production standby, which is physically read-only, as a SELECT-only role with
 * default_transaction_read_only on. Super-admin only. It can't change platform data, and
 * readOnlyQuery() below also refuses anything that isn't a single SELECT.
 */
export const READ_ONLY_QUERY = "/analytics-api/query";
type ReadDb = ReadOnlyDb;

async function readOnlyQuery<Row>(db: ReadDb, sql: string): Promise<Row[]> {
  if (!isReadOnlySql(sql)) throw new Error("Refused: only a single SELECT may be sent");
  try {
    const { data } = await api.post<{ rows: Row[] }>(`${READ_ONLY_QUERY}`, { db, sql });
    return data.rows ?? [];
  } catch (e) {
    throw new Error(apiReason(e));
  }
}

export interface InstituteSignals {
  /** Per feature: institute id → usage. Missing key = that query hasn't loaded (or failed). */
  features: Partial<Record<FeatureKey, Map<string, FeatureRow>>>;
  staff: Map<string, StaffRow> | null;
  aiTools: AiToolRow[] | null;
  errors: string[];
  isLoading: boolean;
  refetch: () => void;
}

/** Product per institute (vacademy, evalezy, telleo, voomsales, vimotion), from the platform database. Read-only. */
export function usePlatformProducts() {
  return useQuery({
    queryKey: [...KEY, "platform-products"],
    queryFn: async () => new Map((await readOnlyQuery<{ id: string; product: string }>("admin_core_service", PRODUCT_SQL)).map((r) => [String(r.id), String(r.product)])),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

type RawFeature = { institute_id: string; total: number; d30: number };
type RawStaff = { institute_id: string; staff: number; staff_logged_in: number; staff_last_login: string | null; students_active_30: number };
type SignalResult = { data?: unknown; error: unknown; isLoading: boolean; refetch: () => unknown };

/** Module-level so useQueries can keep the combined result stable between renders. */
function combineSignals(results: SignalResult[]): InstituteSignals {
  const features: InstituteSignals["features"] = {};
  const errors: string[] = [];
  FEATURE_KEYS.forEach((k, i) => {
    const q = results[i];
    if (q.data) features[k] = new Map((q.data as RawFeature[]).map((r) => [String(r.institute_id), { total: Number(r.total) || 0, d30: Number(r.d30) || 0 }]));
    if (q.error) errors.push(`${k}: ${(q.error as Error).message}`);
  });
  const staff = results[FEATURE_KEYS.length];
  const tools = results[FEATURE_KEYS.length + 1];
  if (staff.error) errors.push(`logins: ${(staff.error as Error).message}`);
  if (tools.error) errors.push(`AI tools: ${(tools.error as Error).message}`);
  return {
    features,
    staff: staff.data
      ? new Map((staff.data as RawStaff[]).map((r) => [String(r.institute_id), { staff: Number(r.staff) || 0, staffLoggedIn: Number(r.staff_logged_in) || 0, staffLastLogin: r.staff_last_login, studentsActive30: Number(r.students_active_30) || 0 }]))
      : null,
    aiTools: (tools.data as AiToolRow[] | undefined) ?? null,
    errors,
    isLoading: results.some((q) => q.isLoading),
    refetch: () => results.forEach((q) => q.refetch()),
  };
}

/** Feature usage and logins for every institute, straight from the platform database (read-only). */
export function useInstituteSignals(): InstituteSignals {
  const opts = { staleTime: 10 * 60_000, retry: 1 } as const;
  return useQueries({
    queries: [
      ...FEATURE_KEYS.map((k) => ({ queryKey: [...KEY, "signals", k], queryFn: (): Promise<unknown> => readOnlyQuery<RawFeature>(FEATURE_SQL[k].db, FEATURE_SQL[k].sql), ...opts })),
      { queryKey: [...KEY, "signals", "staff"], queryFn: (): Promise<unknown> => readOnlyQuery<RawStaff>("auth_service", STAFF_SQL), ...opts },
      { queryKey: [...KEY, "signals", "ai-tools"], queryFn: (): Promise<unknown> => readOnlyQuery<AiToolRow>("admin_core_service", AI_TOOLS_SQL), ...opts },
    ],
    combine: combineSignals,
  });
}

// ---------------------------------------------------------------- PM store (separate)

export interface PmRecordsResponse {
  configured: boolean;
  store?: string | null;
  message?: string | null;
  records: PmRecord[];
}

export function usePmRecords() {
  return useQuery({
    queryKey: [...KEY, "records"],
    queryFn: async () => (await api.get<PmRecordsResponse>(`${PM_API}/records`)).data,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePmHistory(instituteId: string | null) {
  return useQuery({
    queryKey: [...KEY, "history", instituteId],
    queryFn: async () => (await api.get<{ history: PmHistoryEntry[] }>(`${PM_API}/records/${encodeURIComponent(instituteId!)}/history`)).data.history ?? [],
    enabled: !!instituteId,
  });
}

export function usePmTasks() {
  return useQuery({
    queryKey: [...KEY, "tasks"],
    queryFn: async () => (await api.get<{ tasks: PmTaskState[] }>(`${PM_API}/tasks`)).data.tasks ?? [],
    staleTime: 30_000,
    retry: false,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY, "records"] });
    qc.invalidateQueries({ queryKey: [...KEY, "history"] });
  };
}

/** Save one full register entry (PM store only). */
export function useSavePmRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (r: PmRecord) => (await api.put<{ record: PmRecord }>(`${PM_API}/records/${encodeURIComponent(r.instituteId)}`, r)).data.record,
    onSuccess: invalidate,
  });
}

/** Merge partial records (bulk classify, CSV import) into the PM store. */
export function useBulkPmRecords() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (records: Record<string, unknown>[]) => (await api.post<{ saved: number; skipped: number }>(`${PM_API}/records/bulk`, { records })).data,
    onSuccess: invalidate,
  });
}

export function useDeletePmRecord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (instituteId: string) => (await api.delete(`${PM_API}/records/${encodeURIComponent(instituteId)}`)).data,
    onSuccess: invalidate,
  });
}

export function useSetTaskState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { key: string; state: "DONE" | "SNOOZED" | "OPEN"; until?: string }) =>
      t.state === "OPEN"
        ? (await api.delete(`${PM_API}/tasks/${encodeURIComponent(t.key)}`)).data
        : (await api.put(`${PM_API}/tasks/${encodeURIComponent(t.key)}`, { state: t.state, until: t.until })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "tasks"] }),
  });
}
