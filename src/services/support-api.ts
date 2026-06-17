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
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
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
            engineerId: params.engineerId || undefined,
            overdue: params.overdue || undefined,
            page: params.page ?? 0,
            size: params.size ?? 25,
          },
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
