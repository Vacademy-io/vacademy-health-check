import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

/** A product sold under its own name: its row in the platform settings table. */
export interface ProductConfig {
  product_key: string;
  display_name: string;
  from_email: string;
  from_name: string;
  website_url: string | null;
  contact_email: string | null;
  theme_color: string | null;
  logo_url: string | null;
  /** Public https PNG/JPG at the top of the product's mails. */
  email_logo_url?: string | null;
  app_path: string;
  login_url: string | null;
  trial_days: number;
  self_signup_enabled: boolean;
  return_hosts: string | null;
  /** Credits a new institute opens with. Empty keeps the platform's default. */
  demo_credits: number | null;
  /** Credits the one-screen demo page (/demo: name, email, phone) opens with. Empty uses demo_credits. */
  demo_portal_credits?: number | null;
  /** Institute whose CRM gets every instant-demo sign-up as a lead. Empty: no lead. */
  demo_leads_institute_id?: string | null;
  /** That lead list's name. Empty: "Product <name> ( Instant - Demo )". */
  demo_leads_list_name?: string | null;
  signup_alert_emails: string | null;
  signup_alert_whatsapp: string | null;
  signup_alert_template: string | null;
  signup_alert_language: string | null;
  whatsapp_waba_id: string | null;
  /** Paid plans the product's website shows, in order. */
  plans?: ProductPlan[] | null;
  /** How long a plan and its credits last. */
  plan_validity_months?: number | null;
  /** What one extra credit costs after a plan's credits are used, in rupees (shown on the website). */
  extra_credit_price_inr?: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

export type { ProductPlan } from "@/components/products/plans";
import type { ProductPlan } from "@/components/products/plans";

export type TrialStatus = "ON_TRIAL" | "EXPIRED" | "PAID" | "NOT_ON_TRIAL" | "PAYMENT_PENDING";

export interface ProductInstitute {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  lead_tag: string | null;
  trial_status: TrialStatus;
  trial_ends_at: string | null;
  credit_balance: number | null;
  credits_used: number | null;
  created_at: string | null;
}

export interface ProductInstitutePage {
  content: ProductInstitute[];
  total: number;
  page: number;
  size: number;
}

export interface AlertTemplate {
  name: string;
  language: string;
  body: string | null;
  status: string;
  category: string | null;
  rejected_reason: string | null;
}

export interface AlertResult {
  deliveries: { channel: "EMAIL" | "WHATSAPP"; to: string; sent: boolean; error: string | null }[];
}

export interface CreditPack {
  id: string;
  code: string;
  name: string;
  credits: number;
  is_active: boolean;
  prices: { currency: string; amount_minor: number }[];
}

const QUERY_KEY = ["super-admin", "products"] as const;
const PACKS_KEY = ["super-admin", "credit-packs"] as const;
const productPath = (key: string) => `${API_PREFIXES.ADMIN_CORE}/products/${encodeURIComponent(key)}`;

export function useProducts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<ProductConfig[]>(`${API_PREFIXES.ADMIN_CORE}/products`);
      return data;
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: ProductConfig) => {
      const { data } = await api.put<ProductConfig>(productPath(product.product_key), product);
      return data;
    },
    onSuccess: (_, product) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["super-admin", "alert-template", product.product_key] });
    },
  });
}

export function useProductInstitutes(
  productKey: string,
  page: number,
  search: string,
  status: string
) {
  return useQuery({
    queryKey: ["super-admin", "product-institutes", productKey, page, search, status],
    queryFn: async () => {
      const { data } = await api.get<ProductInstitutePage>(`${productPath(productKey)}/institutes`, {
        params: { page, size: 20, search: search || undefined, status: status || undefined },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useChangeTrial(productKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      instituteId,
      ...body
    }: {
      instituteId: string;
      extend_days?: number;
      ends_on?: string;
    }) => {
      const { data } = await api.put<ProductInstitute>(
        `${productPath(productKey)}/institutes/${encodeURIComponent(instituteId)}/trial`,
        body
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["super-admin", "product-institutes", productKey] }),
  });
}

export function useAlertTemplate(productKey: string) {
  return useQuery({
    queryKey: ["super-admin", "alert-template", productKey],
    queryFn: async () => {
      const { data } = await api.get<AlertTemplate>(`${productPath(productKey)}/alert-template`);
      return data;
    },
    retry: false,
  });
}

export function useRegisterAlertTemplate(productKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await api.post<AlertTemplate>(`${productPath(productKey)}/alert-template`, {
        body,
      });
      return data;
    },
    onSuccess: (data) =>
      qc.setQueryData(["super-admin", "alert-template", productKey], data),
  });
}

export function useTestSignupAlert(productKey: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AlertResult>(`${productPath(productKey)}/signup-alert/test`);
      return data;
    },
  });
}

export function useCreditPacks() {
  return useQuery({
    queryKey: PACKS_KEY,
    queryFn: async () => {
      const { data } = await api.get<CreditPack[]>(`${API_PREFIXES.ADMIN_CORE}/credit-packs`);
      return data;
    },
  });
}

export function useUpdateCreditPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pack: CreditPack) => {
      const { data } = await api.put<CreditPack>(
        `${API_PREFIXES.ADMIN_CORE}/credit-packs/${encodeURIComponent(pack.id)}`,
        pack
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKS_KEY }),
  });
}
