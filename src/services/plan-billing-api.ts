import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import {
  AUTOPAY_SETTING_KEY,
  STOREFRONT_MODE_SETTING_KEY,
  SUBSCRIPTION_PAYMENTS_SETTING_KEY,
  normalizeAudience,
  normalizeAudiencePreview,
  normalizeBilling,
  normalizeDocuments,
  billingInFlight,
  normalizeStorefront,
  storefrontModeOf,
} from "@/lib/plan-billing";
import { settingBool } from "@/lib/plans";
import type { AiSettingsResponse } from "@/types/ai-settings";
import type {
  AudiencePreview,
  AudiencePutBody,
  AudienceRule,
  BillingDocKind,
  BillingDocument,
  MarkPaidBody,
  PlanListingPatch,
  RefundBody,
  StorefrontInstitutePut,
  StorefrontState,
  SubscriptionBilling,
} from "@/types/plan-billing";

/**
 * Every endpoint this module calls, in one place (payments_design §7.3, as built). Reads, the
 * listing / audience / segment / storefront writes and queueing a payment link go to ai-service
 * (admin_core's billing job creates and emails the link). Anything that moves money or makes a
 * document (offline payments, waivers, refunds + credit notes, mandates, PDFs) goes to admin-core,
 * which owns Razorpay and the invoice series (AiSubscriptionOpsService).
 */
const PLANS = `${API_PREFIXES.AI}/plans`;
/** admin_core AiPlansBillingOpsController: /super-admin/v1/ai-plans-billing/institutes/{iid}/... */
const OPS = (iid: string) => `${API_PREFIXES.ADMIN_CORE}/ai-plans-billing/institutes/${encodeURIComponent(iid)}`;
const enc = encodeURIComponent;
export const PLAN_BILLING_ENDPOINTS = {
  listing: (planId: string) => `${PLANS}/plans/${enc(planId)}/listing`,
  audience: (planId: string) => `${PLANS}/plans/${enc(planId)}/audience`,
  storefrontPreview: `${PLANS}/storefront/preview`,
  storefrontAudience: `${PLANS}/storefront/audience`,
  storefrontInstitutes: `${PLANS}/storefront/institutes`,
  storefrontInstitute: (iid: string) => `${PLANS}/storefront/institutes/${enc(iid)}`,
  segment: (key: string) => `${PLANS}/storefront/segments/${enc(key)}`,
  subscriptionBilling: (sid: string) => `${PLANS}/subscriptions/${enc(sid)}/billing`,
  sendLink: (sid: string, cid: string) => `${PLANS}/subscriptions/${enc(sid)}/charges/${enc(cid)}/send-link`,
  /** Creates (or reuses a live) Razorpay link now and emails it; first purchases included. */
  resendLink: (iid: string, cid: string) => `${OPS(iid)}/charges/${enc(cid)}/resend-link`,
  markPaid: (iid: string, cid: string) => `${OPS(iid)}/charges/${enc(cid)}/mark-paid`,
  waive: (iid: string, cid: string) => `${OPS(iid)}/charges/${enc(cid)}/waive`,
  refund: (iid: string, ppId: string) => `${OPS(iid)}/payments/${enc(ppId)}/refund`,
  cancelMandate: (iid: string, mid: string) => `${OPS(iid)}/mandates/${enc(mid)}/cancel`,
  documents: (iid: string) => `${OPS(iid)}/documents`,
  invoicePdf: (iid: string, id: string) => `${OPS(iid)}/invoices/${enc(id)}/pdf`,
  creditNotePdf: (iid: string, id: string) => `${OPS(iid)}/credit-notes/${enc(id)}/pdf`,
  /** Staff credit note against an AI-plan invoice (offline refund, waiver after invoicing). */
  staffCreditNote: (iid: string, invoiceId: string) => `${OPS(iid)}/invoices/${enc(invoiceId)}/credit-note`,
} as const;
const E = PLAN_BILLING_ENDPOINTS;

const KEY = ["super-admin", "ai-plans"] as const;
const AI_SETTINGS_KEY = ["super-admin", "ai-settings"] as const;
const status = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;
const retryUnlessFinal = (count: number, err: unknown) => !isNotFound(err) && status(err) !== 403 && count < 1;

// ---------------------------------------------------------------- settings (read-only here)

/** billing.storefront.mode, billing.subscriptions.payments.enabled, billing.autopay.enabled (edited on AI settings). */
export function useBillingSwitches() {
  const q = useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: async () => (await api.get<AiSettingsResponse>(`${API_PREFIXES.AI}/ai-settings`)).data,
  });
  const settings = q.data?.settings ?? [];
  const find = (k: string) => settings.find((s) => s.key === k) ?? null;
  const modeEntry = find(STOREFRONT_MODE_SETTING_KEY);
  return {
    loaded: q.isSuccess,
    storefrontMode: storefrontModeOf(modeEntry),
    storefrontModeRegistered: modeEntry !== null,
    /** null = not registered on this ai-service yet (treated as off). */
    paymentsEnabled: settingBool(find(SUBSCRIPTION_PAYMENTS_SETTING_KEY)),
    autopayEnabled: settingBool(find(AUTOPAY_SETTING_KEY)),
  };
}

// ---------------------------------------------------------------- listing and audience (ai-service)

function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY, "plans"] });
    qc.invalidateQueries({ queryKey: [...KEY, "plan"] });
  };
}

export function usePatchListing() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async ({ planId, body }: { planId: string; body: PlanListingPatch }): Promise<unknown> => (await api.patch<unknown>(E.listing(planId), body)).data,
    onSuccess: invalidate,
  });
}

export function usePlanAudience(planId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "audience", planId],
    queryFn: async (): Promise<AudienceRule[]> => normalizeAudience((await api.get<unknown>(E.audience(planId!))).data),
    enabled: !!planId,
    retry: retryUnlessFinal,
  });
}

export function usePutPlanAudience(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AudiencePutBody): Promise<unknown> => (await api.put<unknown>(E.audience(planId), body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "audience", planId] });
      qc.invalidateQueries({ queryKey: [...KEY, "audience-preview", planId] });
    },
  });
}

export function useAudiencePreview(planId: string | null | undefined, instituteId: string | null) {
  return useQuery({
    queryKey: [...KEY, "audience-preview", planId, instituteId],
    queryFn: async (): Promise<AudiencePreview> =>
      normalizeAudiencePreview((await api.get<unknown>(E.storefrontPreview, { params: { institute_id: instituteId } })).data, planId),
    enabled: !!planId && !!instituteId,
    retry: retryUnlessFinal,
  });
}

// ---------------------------------------------------------------- storefront (ai-service)

export function useStorefront() {
  return useQuery({
    queryKey: [...KEY, "storefront"],
    queryFn: async (): Promise<StorefrontState> => {
      const [audience, institutes] = await Promise.all([api.get<unknown>(E.storefrontAudience), api.get<unknown>(E.storefrontInstitutes)]);
      return normalizeStorefront(audience.data, institutes.data);
    },
    retry: retryUnlessFinal,
  });
}

export function usePutStorefrontAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AudiencePutBody): Promise<unknown> => (await api.put<unknown>(E.storefrontAudience, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "storefront"] }),
  });
}

/** Replace a segment's member institutes (ai_institute_segment). An empty list empties the segment. */
export function usePutSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ segment, body }: { segment: string; body: { institute_ids: string[]; reason: string } }): Promise<unknown> =>
      (await api.put<unknown>(E.segment(segment), body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, "storefront"] });
      qc.invalidateQueries({ queryKey: [...KEY, "audience-preview"] });
    },
  });
}

export function usePutStorefrontInstitute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ instituteId, body }: { instituteId: string; body: StorefrontInstitutePut }): Promise<unknown> =>
      (await api.put<unknown>(E.storefrontInstitute(instituteId), body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "storefront"] }),
  });
}

// ---------------------------------------------------------------- billing timeline (ai-service read, admin-core money)

export function useSubscriptionBilling(subscriptionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "billing", subscriptionId],
    queryFn: async (): Promise<SubscriptionBilling> => normalizeBilling((await api.get<unknown>(E.subscriptionBilling(subscriptionId!))).data),
    enabled: !!subscriptionId,
    retry: retryUnlessFinal,
    // While a link, a debit or a mandate approval is out, a webhook can settle it at any moment.
    refetchInterval: (query) => (billingInFlight(query.state.data) ? 30_000 : false),
  });
}

/** After any money action: the timeline, the subscription (status flips on payment), events and documents. */
function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [...KEY, "billing"] });
    qc.invalidateQueries({ queryKey: [...KEY, "subscriptions"] });
    qc.invalidateQueries({ queryKey: [...KEY, "events"] });
    qc.invalidateQueries({ queryKey: [...KEY, "documents"] });
    qc.invalidateQueries({ queryKey: [...KEY, "pnl"] });
  };
}

export interface LinkResult {
  url: string | null;
  expires_at: string | null;
  /** The live link was reused (emailed again) rather than a new one created. */
  reused: boolean;
  /** How many admins the email went to (0 = nobody to send to, or the mail was withheld). */
  emailed_to: number;
}

/**
 * Two calls: ai-service records the request (reason in the subscription history) and marks the
 * charge for collection; admin_core then creates the link at once (reusing a live one) and emails
 * it. The billing job alone never makes a first-purchase link, so the second call is what sends it.
 */
export function useSendChargeLink() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, subscriptionId, chargeId, reason }: { instituteId: string; subscriptionId: string; chargeId: string; reason: string }): Promise<LinkResult> => {
      await api.post<unknown>(E.sendLink(subscriptionId, chargeId), { reason });
      const data = ((await api.post<unknown>(E.resendLink(instituteId, chargeId), {})).data ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
      return {
        url: str(data.url),
        expires_at: str(data.link_expires_at),
        reused: data.reused === true,
        emailed_to: typeof data.emailed_to === "number" ? data.emailed_to : 0,
      };
    },
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useMarkChargePaid() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, chargeId, body }: { instituteId: string; chargeId: string; body: MarkPaidBody }): Promise<unknown> =>
      (await api.post<unknown>(E.markPaid(instituteId, chargeId), body)).data,
    onSuccess: invalidate,
  });
}

export function useWaiveCharge() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, chargeId, reason }: { instituteId: string; chargeId: string; reason: string }): Promise<unknown> =>
      (await api.post<unknown>(E.waive(instituteId, chargeId), { reason })).data,
    onSuccess: invalidate,
  });
}

export function useRefundCharge() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, body }: { instituteId: string; body: RefundBody }): Promise<{ credit_note_number: string | null }> => {
      const data = ((await api.post<unknown>(E.refund(instituteId, body.platform_payment_id), { amount_minor: body.amount_minor, reason: body.reason })).data ??
        {}) as Record<string, unknown>;
      const cn = (data.credit_note ?? {}) as Record<string, unknown>;
      const num = [data.credit_note_number, data.creditNoteNumber, cn.number].find((v): v is string => typeof v === "string" && v !== "") ?? null;
      return { credit_note_number: num };
    },
    onSuccess: invalidate,
  });
}

export function useCancelMandate() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, mandateId, reason }: { instituteId: string; mandateId: string; reason: string }): Promise<unknown> =>
      (await api.post<unknown>(E.cancelMandate(instituteId, mandateId), { reason })).data,
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- invoices and credit notes (admin-core)

export function useBillingDocuments(instituteId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "documents", instituteId],
    queryFn: async (): Promise<BillingDocument[]> => normalizeDocuments((await api.get<unknown>(E.documents(instituteId!))).data),
    enabled: !!instituteId,
    retry: retryUnlessFinal,
  });
}

export function useIssueStaffCreditNote() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async ({ instituteId, invoiceId, body }: { instituteId: string; invoiceId: string; body: { amount_minor: number; reason: string } }): Promise<{ number: string | null; emailed: boolean }> => {
      const data = ((await api.post<unknown>(E.staffCreditNote(instituteId, invoiceId), body)).data ?? {}) as Record<string, unknown>;
      return { number: typeof data.number === "string" ? data.number : null, emailed: data.emailed === true };
    },
    onSuccess: invalidate,
  });
}

/** Fetches the PDF with the portal's auth header and opens it in a new tab. */
export async function openDocumentPdf(instituteId: string, doc: { id: string; doc_kind: BillingDocKind }): Promise<void> {
  const url = doc.doc_kind === "CREDIT_NOTE" ? E.creditNotePdf(instituteId, doc.id) : E.invoicePdf(instituteId, doc.id);
  // Open the tab first (popup blockers allow it only inside the click), then point it at the blob.
  const win = window.open("", "_blank");
  try {
    const res = await api.get<Blob>(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    if (win) win.location.href = blobUrl;
    else window.location.assign(blobUrl);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
