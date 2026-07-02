import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

const BASE = API_PREFIXES.WIDGETS;

// ---- Types (camelCase, matching community-service) ---------------------------------

export type WidgetType = "ONBOARDING_TRACKER" | "INFO_CARD";
export type WidgetTargetType = "INSTITUTE" | "LEAD_TAG";
export type WidgetStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type InfoSeverity = "INFO" | "WARNING" | "CRITICAL";

/** A single onboarding-tracker milestone, stored inside the widget payload. */
export interface Milestone {
  id: string;
  label: string;
  status: MilestoneStatus;
  estimatedDate?: string | null; // ISO date (yyyy-mm-dd)
  note?: string | null;
  source?: "TEMPLATE" | "CUSTOM";
}

/** payload for ONBOARDING_TRACKER widgets. */
export interface OnboardingPayload {
  milestones: Milestone[];
  overallNote?: string | null;
}

/** payload for INFO_CARD widgets. */
export interface InfoCardPayload {
  body?: string | null; // html
  severity?: InfoSeverity;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export interface DashboardWidgetDto {
  id: string;
  widgetType: WidgetType;
  targetType: WidgetTargetType;
  targetValue: string;
  visibleRoles: string[];
  title: string;
  payload: Record<string, unknown>;
  status: WidgetStatus;
  position: number;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface UpsertWidgetRequest {
  widgetType?: WidgetType;
  targetType?: WidgetTargetType;
  targetValue?: string;
  visibleRoles?: string[];
  title?: string;
  payload?: Record<string, unknown>;
  status?: WidgetStatus;
  position?: number;
}

export interface OnboardingMilestoneTemplateDto {
  key: string;
  label: string;
}

export interface WidgetInteractionDto {
  id: string;
  widgetId: string;
  milestoneId: string | null;
  interactionType: "COMMENT" | "CONFIRM";
  message: string | null;
  userId: string;
  userName: string | null;
  instituteId: string;
  createdAt: number | null;
}

// ---- Queries -----------------------------------------------------------------------

export function useInstituteWidgets(instituteId: string | null) {
  return useQuery({
    queryKey: ["widgets", "institute", instituteId],
    queryFn: async () =>
      (await api.get<DashboardWidgetDto[]>(BASE, { params: { instituteId } })).data,
    enabled: !!instituteId,
  });
}

export function useLeadTagWidgets(leadTag: string | null) {
  return useQuery({
    queryKey: ["widgets", "leadTag", leadTag],
    queryFn: async () =>
      (await api.get<DashboardWidgetDto[]>(BASE, { params: { leadTag } })).data,
    enabled: !!leadTag,
  });
}

export function useOnboardingTemplate() {
  return useQuery({
    queryKey: ["widgets", "onboarding-template"],
    queryFn: async () =>
      (await api.get<OnboardingMilestoneTemplateDto[]>(`${BASE}/onboarding-template`)).data,
    staleTime: 10 * 60 * 1000,
  });
}

export function useWidgetInteractions(widgetId: string | null) {
  return useQuery({
    queryKey: ["widgets", "interactions", widgetId],
    queryFn: async () =>
      (await api.get<WidgetInteractionDto[]>(`${BASE}/${widgetId}/interactions`)).data,
    enabled: !!widgetId,
  });
}

// ---- Mutations ---------------------------------------------------------------------

function invalidateWidgets(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["widgets"] });
}

export function useCreateWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpsertWidgetRequest) =>
      (await api.post<DashboardWidgetDto>(BASE, body)).data,
    onSuccess: () => invalidateWidgets(queryClient),
  });
}

export function useUpdateWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; body: UpsertWidgetRequest }) =>
      (await api.put<DashboardWidgetDto>(`${BASE}/${vars.id}`, vars.body)).data,
    onSuccess: () => invalidateWidgets(queryClient),
  });
}

export function useDeleteWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => invalidateWidgets(queryClient),
  });
}
