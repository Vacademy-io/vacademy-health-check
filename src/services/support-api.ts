import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.SUPPORT;

// ---- Types (camelCase, matching community-service) ---------------------------------

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_ON_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";
export type TicketPriority = "MAJOR" | "MINOR";
export type TicketCategory = "BUG" | "QUESTION" | "BILLING" | "FEATURE_REQUEST" | "OTHER";
export type SenderType = "CUSTOMER" | "SUPPORT" | "SYSTEM";
export type TicketSource = "PORTAL" | "EMAIL" | "WHATSAPP" | "PHONE" | "MANUAL" | "OTHER";

export interface SupportPlanDto {
  key: string;
  displayName: string;
  description: string;
  hoursOfOperation: string;
  dedicatedEngineer: boolean;
  majorSlaHours: number | null;
  majorSlaText: string;
  minorSlaHours: number | null;
  minorSlaText: string;
}

export interface AttachmentDto {
  fileId?: string;
  fileName?: string;
  url?: string;
}

export interface SupportMessageDto {
  id: string;
  ticketId: string;
  senderType: SenderType;
  senderName: string | null;
  senderUserId: string | null;
  body: string;
  attachments: AttachmentDto[];
  internalNote: boolean;
  createdAt: string;
}

export interface SupportTicketDto {
  id: string;
  instituteId: string;
  instituteName: string | null;
  raisedByUserId: string | null;
  raisedByName: string | null;
  raisedByEmail: string | null;
  raisedByRole: string | null;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  planAtCreation: string | null;
  assignedEngineerId: string | null;
  assignedEngineerName: string | null;
  source: TicketSource | null;
  /** Support-set expected-resolution time (ISO); visible to the institute. */
  eta: string | null;
  /** Support-team-only ticket — the institute never sees it. */
  internalOnly: boolean;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
  /** Auto-captured diagnostics (browser/device + server IP); detail endpoint only. */
  clientContext?: Record<string, unknown> | null;
  messages?: SupportMessageDto[];
}

export interface SupportEngineerDto {
  id: string;
  name: string;
  email: string;
  userId: string | null;
  active: boolean;
  assignedInstituteCount: number | null;
  primary: boolean | null;
}

export interface InstituteSupportConfigDto {
  instituteId: string;
  instituteName: string | null;
  plan: string;
  planDetail: SupportPlanDto;
  alertEmails: string[];
  engineers: SupportEngineerDto[];
  openTicketCount: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface TicketSearchParams {
  status?: string;
  instituteId?: string;
  /** Multi-institute filter; empty/absent means all institutes. */
  instituteIds?: string[];
  engineerId?: string;
  overdue?: boolean;
  page?: number;
  size?: number;
}

// ---- Catalogue / counts ------------------------------------------------------------

export function useSupportPlans() {
  return useQuery({
    queryKey: ["support", "plans"],
    queryFn: async () => (await api.get<SupportPlanDto[]>(`${BASE}/plans`)).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTicketCounts() {
  return useQuery({
    queryKey: ["support", "counts"],
    queryFn: async () => (await api.get<Record<string, number>>(`${BASE}/tickets/counts`)).data,
    refetchInterval: 30000,
  });
}

// ---- Inbox -------------------------------------------------------------------------

export function useSupportTickets(params: TicketSearchParams) {
  return useQuery({
    queryKey: ["support", "tickets", params],
    queryFn: async () =>
      (
        await api.get<PageResponse<SupportTicketDto>>(`${BASE}/tickets`, {
          params: {
            status: params.status || undefined,
            instituteId: params.instituteId || undefined,
            instituteIds: params.instituteIds?.length ? params.instituteIds : undefined,
            engineerId: params.engineerId || undefined,
            overdue: params.overdue || undefined,
            page: params.page ?? 0,
            size: params.size ?? 25,
          },
          // Spring binds List<String> from repeated params: ?instituteIds=a&instituteIds=b
          paramsSerializer: { indexes: null },
        })
      ).data,
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
}

export function useSupportTicket(id: string | null) {
  return useQuery({
    queryKey: ["support", "ticket", id],
    queryFn: async () => (await api.get<SupportTicketDto>(`${BASE}/tickets/${id}`)).data,
    enabled: !!id,
    refetchInterval: id ? 15000 : false,
  });
}

function invalidateTicket(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
  queryClient.invalidateQueries({ queryKey: ["support", "counts"] });
  if (id) queryClient.invalidateQueries({ queryKey: ["support", "ticket", id] });
}

export function useReplyTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: string; internalNote?: boolean }) =>
      (
        await api.post<SupportTicketDto>(`${BASE}/tickets/${vars.id}/messages`, {
          body: vars.body,
          internalNote: vars.internalNote ?? false,
        })
      ).data,
    onSuccess: (_d, vars) => invalidateTicket(queryClient, vars.id),
  });
}

export function useAssignEngineer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; engineerId: string | null; status?: string }) =>
      (
        await api.post<SupportTicketDto>(`${BASE}/tickets/${vars.id}/assign`, {
          engineerId: vars.engineerId,
          status: vars.status,
        })
      ).data,
    onSuccess: (_d, vars) => invalidateTicket(queryClient, vars.id),
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status?: string; priority?: string }) =>
      (
        await api.post<SupportTicketDto>(`${BASE}/tickets/${vars.id}/status`, {
          status: vars.status,
          priority: vars.priority,
        })
      ).data,
    onSuccess: (_d, vars) => invalidateTicket(queryClient, vars.id),
  });
}

export interface CreateSupportTicketPayload {
  instituteId: string;
  instituteName?: string | null;
  subject: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  message: string;
  source?: TicketSource;
  /** ISO string or null. */
  eta?: string | null;
  assignedEngineerId?: string | null;
  /** true = support-team-only; hidden from the institute entirely. */
  internalOnly?: boolean;
  attachments?: AttachmentDto[];
}

/** Log a ticket on an institute's behalf (issue reported over email / WhatsApp, etc.). */
export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSupportTicketPayload) =>
      (await api.post<SupportTicketDto>(`${BASE}/tickets`, payload)).data,
    onSuccess: (d) => invalidateTicket(queryClient, d?.id),
  });
}

export interface UpdateTicketPayload {
  subject?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  source?: TicketSource;
  /** "" clears the assignee; undefined leaves it alone. */
  assignedEngineerId?: string | null;
  internalOnly?: boolean;
  /** Only applied when etaSet is true — lets an explicit null clear the ETA. */
  eta?: string | null;
  etaSet?: boolean;
  /** Replaces the body of the ticket's opening message. */
  message?: string;
  /** Replaces the opening message's attachments; only applied when attachmentsSet is true. */
  attachments?: AttachmentDto[];
  attachmentsSet?: boolean;
}

/** Edit an existing ticket (fields, internal flag, opening message + attachments). */
export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; payload: UpdateTicketPayload }) =>
      (await api.put<SupportTicketDto>(`${BASE}/tickets/${vars.id}`, vars.payload)).data,
    onSuccess: (_d, vars) => invalidateTicket(queryClient, vars.id),
  });
}

/** Set (ISO) or clear (null) the expected-resolution ETA. */
export function useSetTicketEta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; eta: string | null }) =>
      (await api.post<SupportTicketDto>(`${BASE}/tickets/${vars.id}/eta`, { eta: vars.eta })).data,
    onSuccess: (_d, vars) => invalidateTicket(queryClient, vars.id),
  });
}

// ---- Engineers ---------------------------------------------------------------------

export function useEngineers() {
  return useQuery({
    queryKey: ["support", "engineers"],
    queryFn: async () => (await api.get<SupportEngineerDto[]>(`${BASE}/engineers`)).data,
  });
}

export interface UpsertEngineer {
  name?: string;
  email?: string;
  userId?: string;
  active?: boolean;
}

export function useCreateEngineer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpsertEngineer) =>
      (await api.post<SupportEngineerDto>(`${BASE}/engineers`, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "engineers"] }),
  });
}

export function useUpdateEngineer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; payload: UpsertEngineer }) =>
      (await api.put<SupportEngineerDto>(`${BASE}/engineers/${vars.id}`, vars.payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "engineers"] }),
  });
}

export function useDeleteEngineer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/engineers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "engineers"] }),
  });
}

// ---- Per-institute config ----------------------------------------------------------

export function useInstituteConfig(instituteId: string | null, instituteName?: string | null) {
  return useQuery({
    queryKey: ["support", "institute-config", instituteId],
    queryFn: async () =>
      (
        await api.get<InstituteSupportConfigDto>(`${BASE}/institutes/${instituteId}/config`, {
          params: { instituteName: instituteName || undefined },
        })
      ).data,
    enabled: !!instituteId,
  });
}

export interface UpsertInstituteConfig {
  plan?: string;
  alertEmails?: string[];
  engineerIds?: string[];
  primaryEngineerId?: string;
  instituteName?: string;
}

export function useUpdateInstituteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { instituteId: string; payload: UpsertInstituteConfig }) =>
      (
        await api.put<InstituteSupportConfigDto>(
          `${BASE}/institutes/${vars.instituteId}/config`,
          vars.payload
        )
      ).data,
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["support", "institute-config", vars.instituteId] });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      // Engineer assignments changed → refresh the roster's "N institute(s)" counts.
      queryClient.invalidateQueries({ queryKey: ["support", "engineers"] });
    },
  });
}

// ---- Global settings ---------------------------------------------------------------

export function useGlobalSettings() {
  return useQuery({
    queryKey: ["support", "settings"],
    queryFn: async () => (await api.get<{ alertEmails: string[] }>(`${BASE}/settings`)).data,
  });
}

export function useUpdateGlobalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertEmails: string[]) =>
      (await api.put<{ alertEmails: string[] }>(`${BASE}/settings`, { alertEmails })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support", "settings"] }),
  });
}
