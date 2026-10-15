import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import {
  DEFAULT_INR_PER_USD,
  INR_PER_USD_SETTING_KEY,
  PLANS_ENABLED_SETTING_KEY,
  normalizeEvents,
  normalizeFeature,
  normalizeFeatures,
  normalizeOverride,
  normalizeOverrides,
  normalizePlan,
  normalizePlans,
  normalizePnl,
  normalizeSimulation,
  normalizeSubscription,
  normalizeSubscriptions,
  normalizeVersion,
  settingBool,
  settingNumber,
} from "@/lib/plans";
import type { AiSettingsResponse } from "@/types/ai-settings";
import type {
  BillingFeature,
  FeaturePatch,
  OverrideCreate,
  Plan,
  PlanCreate,
  PlanItemPut,
  PlanVersion,
  PnlResponse,
  SimulationResult,
  Subscription,
  SubscriptionCreate,
  SubscriptionEvent,
  SubscriptionOverride,
  SubscriptionPatch,
  VersionTermsPatch,
} from "@/types/plans";

const PLANS = `${API_PREFIXES.AI}/plans`;
const KEY = ["super-admin", "ai-plans"] as const;
/** Shared with ai-settings-api / limits-api: the raw AI settings response. */
const AI_SETTINGS_KEY = ["super-admin", "ai-settings"] as const;

const status = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;
/** A 404 (not deployed) or 403 (not a super admin) is final; other errors retry once. */
const retryUnlessFinal = (count: number, err: unknown) => !isNotFound(err) && status(err) !== 403 && count < 1;
const enc = encodeURIComponent;

// ---------------------------------------------------------------- catalogue

export function useBillingFeatures() {
  return useQuery({
    queryKey: [...KEY, "features"],
    queryFn: async (): Promise<BillingFeature[]> => normalizeFeatures((await api.get<unknown>(`${PLANS}/features`)).data),
    retry: retryUnlessFinal,
    staleTime: 60_000,
  });
}

export function usePatchFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...body }: FeaturePatch & { key: string }): Promise<BillingFeature> =>
      normalizeFeature((await api.patch<unknown>(`${PLANS}/features/${enc(key)}`, body)).data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "features"] }),
  });
}

// ---------------------------------------------------------------- plans and versions

export function usePlans() {
  return useQuery({
    queryKey: [...KEY, "plans"],
    queryFn: async (): Promise<Plan[]> => normalizePlans((await api.get<unknown>(`${PLANS}/plans`)).data),
    retry: retryUnlessFinal,
  });
}

/** One plan with every version and its items. */
export function usePlan(planId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "plan", planId],
    queryFn: async (): Promise<Plan> => normalizePlan((await api.get<unknown>(`${PLANS}/plans/${enc(planId!)}`)).data),
    enabled: !!planId,
    retry: retryUnlessFinal,
  });
}

function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY, "plans"] });
    qc.invalidateQueries({ queryKey: [...KEY, "plan"] });
  };
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async (body: PlanCreate): Promise<Plan> => normalizePlan((await api.post<unknown>(`${PLANS}/plans`, body)).data),
    onSuccess: invalidate,
  });
}

export function useCreateVersion() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ planId, copy_from_version_id, reason }: { planId: string; copy_from_version_id: string | null; reason: string }): Promise<PlanVersion> =>
      normalizeVersion((
        await api.post<unknown>(`${PLANS}/plans/${enc(planId)}/versions`, {
          copy_from_version_id,
          // ai-service copies the latest version unless told not to; "start empty" must say so.
          copy_latest: copy_from_version_id !== null,
          reason,
        })
      ).data, planId),
    onSuccess: invalidate,
  });
}

export function usePatchVersion() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ versionId, ...body }: VersionTermsPatch & { versionId: string }): Promise<unknown> =>
      (await api.patch<unknown>(`${PLANS}/versions/${enc(versionId)}`, body)).data,
    onSuccess: invalidate,
  });
}

export function usePutItems() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ versionId, items, reason }: { versionId: string; items: PlanItemPut[]; reason: string }): Promise<unknown> =>
      (await api.put<unknown>(`${PLANS}/versions/${enc(versionId)}/items`, { items, reason })).data,
    onSuccess: invalidate,
  });
}

export function useVersionTransition() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ versionId, action, reason }: { versionId: string; action: "publish" | "retire"; reason: string }): Promise<unknown> =>
      (await api.post<unknown>(`${PLANS}/versions/${enc(versionId)}/${action}`, { reason })).data,
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- subscriptions

export function useSubscriptions(instituteId?: string | null) {
  return useQuery({
    queryKey: [...KEY, "subscriptions", instituteId ?? null],
    queryFn: async (): Promise<Subscription[]> =>
      normalizeSubscriptions((await api.get<unknown>(`${PLANS}/subscriptions`, { params: instituteId ? { institute_id: instituteId } : undefined })).data),
    retry: retryUnlessFinal,
  });
}

function useInvalidateSubscriptions() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY, "subscriptions"] });
    qc.invalidateQueries({ queryKey: [...KEY, "events"] });
    qc.invalidateQueries({ queryKey: [...KEY, "overrides"] });
    qc.invalidateQueries({ queryKey: [...KEY, "plans"] });
    qc.invalidateQueries({ queryKey: [...KEY, "pnl"] });
  };
}

export function useCreateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: async (body: SubscriptionCreate): Promise<Subscription> => normalizeSubscription((await api.post<unknown>(`${PLANS}/subscriptions`, body)).data),
    onSuccess: invalidate,
  });
}

export function usePatchSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: async ({ id, ...body }: SubscriptionPatch & { id: string }): Promise<Subscription> =>
      normalizeSubscription((await api.patch<unknown>(`${PLANS}/subscriptions/${enc(id)}`, body)).data),
    onSuccess: invalidate,
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: async ({ id, reason, immediate }: { id: string; reason: string; immediate: boolean }): Promise<unknown> =>
      (await api.post<unknown>(`${PLANS}/subscriptions/${enc(id)}/cancel`, { reason, immediate })).data,
    onSuccess: invalidate,
  });
}

export function useSubscriptionOverrides(subscriptionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "overrides", subscriptionId],
    queryFn: async (): Promise<SubscriptionOverride[]> =>
      normalizeOverrides((await api.get<unknown>(`${PLANS}/subscriptions/${enc(subscriptionId!)}/overrides`)).data),
    enabled: !!subscriptionId,
    retry: retryUnlessFinal,
  });
}

export function useCreateOverride(subscriptionId: string) {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: async (body: OverrideCreate): Promise<SubscriptionOverride> =>
      normalizeOverride((await api.post<unknown>(`${PLANS}/subscriptions/${enc(subscriptionId)}/overrides`, body)).data),
    onSuccess: invalidate,
  });
}

export function useDeleteOverride(subscriptionId: string) {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: async ({ overrideId, reason }: { overrideId: string; reason: string }): Promise<void> => {
      await api.delete(`${PLANS}/subscriptions/${enc(subscriptionId)}/overrides/${enc(overrideId)}`, { params: { reason } });
    },
    onSuccess: invalidate,
  });
}

export function useSubscriptionEvents(subscriptionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "events", subscriptionId],
    queryFn: async (): Promise<SubscriptionEvent[]> =>
      normalizeEvents((await api.get<unknown>(`${PLANS}/subscriptions/${enc(subscriptionId!)}/events`)).data),
    enabled: !!subscriptionId,
    retry: retryUnlessFinal,
  });
}

// ---------------------------------------------------------------- simulate and P&L

export function useSimulate() {
  return useMutation({
    mutationFn: async (args: {
      plan_version_id: string;
      institute_id: string;
      days: number;
      price_minor: number;
      period_months: number;
      inr_per_usd: number;
    }): Promise<SimulationResult> => {
      const { data } = await api.post<unknown>(
        `${PLANS}/simulate`,
        { plan_version_id: args.plan_version_id, institute_id: args.institute_id, days: args.days },
        // A replay of 90 days of usage can take a while on a busy institute.
        { timeout: 120_000 }
      );
      return normalizeSimulation(data, args);
    },
  });
}

export function usePnl(period: "current" | "previous", instituteId: string | null, inrPerUsd: number) {
  return useQuery({
    queryKey: [...KEY, "pnl", period, instituteId],
    queryFn: async (): Promise<PnlResponse> => {
      const { data } = await api.get<unknown>(`${PLANS}/pnl`, { params: { period, institute_id: instituteId || undefined } });
      return normalizePnl(data, period, inrPerUsd);
    },
    retry: retryUnlessFinal,
  });
}

// ---------------------------------------------------------------- platform settings (read-only here)

/** billing.plans.enabled and billing.inr_per_usd from the AI settings list (edited on the AI settings page). */
export function usePlanSettings() {
  const q = useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: async () => (await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`)).data,
  });
  const settings = q.data?.settings ?? [];
  const enabledEntry = settings.find((s) => s.key === PLANS_ENABLED_SETTING_KEY) ?? null;
  const rateEntry = settings.find((s) => s.key === INR_PER_USD_SETTING_KEY) ?? null;
  return {
    loaded: q.isSuccess,
    /** null = the setting is not registered yet (ai-service older than this release): plans are off. */
    enabled: settingBool(enabledEntry),
    inrPerUsd: settingNumber(rateEntry, DEFAULT_INR_PER_USD),
  };
}
