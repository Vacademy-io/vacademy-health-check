import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

// ---- types (mirror the community_service pricing DTOs) ----------------------

export type PricingModel =
  | "PER_LEARNER_TIER"
  | "FLAT_ANNUAL"
  | "ONE_TIME"
  | "SEAT_BASED"
  | "COUNT_BASED"
  | "USAGE";

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanInclusion {
  productCode: string;
  productName?: string;
  /** Null means any plan of that product; set means only that plan is free. */
  planCode?: string;
  /** Null means the whole product; a number means that many units are free. */
  quantity?: number;
}

export interface Plan {
  code: string;
  name: string;
  description?: string;
  unitCount?: number;
  /** Per unit for PER_LEARNER_TIER, absolute otherwise. */
  price: number;
  /** One year at list, already multiplied out for learner tiers. */
  annualPrice: number;
  popular: boolean;
  features: PlanFeature[];
  /** Other products this plan bundles in for free. */
  inclusions?: PlanInclusion[];
}

export interface Product {
  code: string;
  name: string;
  tagline?: string;
  icon?: string;
  pricingModel: PricingModel;
  basePrice?: number;
  unitPrice?: number;
  includedUnits?: number;
  unitLabel?: string;
  minQuantity: number;
  /** Only sellable alongside this product. */
  requiresProductCode?: string;
  /** Its tier follows whichever plan was chosen for that product. */
  mirrorsProductCode?: string;
  fromPrice?: number;
  plans: Plan[];
}

export interface RateCatalog {
  version: string;
  products: Product[];
  settings: Record<string, string>;
}

export type BillingCycle = "MONTHLY" | "HALF_YEARLY" | "ANNUAL";

export interface Selection {
  productCode: string;
  planCode?: string;
  quantity?: number;
}

export interface QuoteRequest {
  submissionId?: string;
  slug?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  currency: "INR" | "USD";
  billingCycle: BillingCycle;
  selections: Selection[];
}

export interface LineItem {
  code: string;
  label: string;
  detail?: string;
  amount: number;
  oneTime: boolean;
  includedFree: boolean;
}

export interface Quote {
  quoteId?: string;
  rateCardVersion: string;
  currency: "INR" | "USD";
  currencySymbol: string;
  billingCycle: BillingCycle;
  recurringLines: LineItem[];
  oneTimeLines: LineItem[];
  recurringAnnual: number;
  recurringAnnualAdjusted: number;
  cycleAdjustment: number;
  cycleAdjustmentLabel: string;
  oneTimeTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  taxLabel: string;
  /** Everything owed across the first year, inc-tax — not what a single payment looks like. */
  total: number;
  /** One billing period's recurring cost, inc-tax. Excludes one-time fees. */
  perPaymentAmount: number;
  perPaymentLabel: string;
  paymentsPerYear: number;
  oneTimeTotalWithTax: number;
  included: string[];
}

const PUB = API_PREFIXES.PRICING_PUBLIC;

export async function fetchRateCatalog(): Promise<RateCatalog> {
  const res = await fetch(`${PUB}/catalog`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Couldn't load pricing (${res.status})`);

  // A missing route can still answer 200 with the SPA's index.html, and an older backend
  // answers with a different shape entirely. Treat anything that isn't a real catalogue as a
  // failure here, so the page shows its error state instead of crashing mid-render.
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.products)) {
    throw new Error("Pricing isn't available yet — the backend may need deploying.");
  }
  return { version: data.version ?? "unversioned", products: data.products, settings: data.settings ?? {} };
}

export async function priceQuote(req: QuoteRequest): Promise<Quote> {
  const res = await fetch(`${PUB}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Couldn't price this plan (${res.status})`);
  return res.json();
}

export async function saveQuote(req: QuoteRequest): Promise<Quote> {
  const res = await fetch(`${PUB}/quote/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Couldn't save this plan (${res.status})`);
  }
  return res.json();
}

/** Formats an amount in the quote's currency without dragging in a formatting library. */
export function money(amount: number, symbol: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasPaise = rounded % 1 !== 0;
  return (
    symbol +
    rounded.toLocaleString(symbol === "₹" ? "en-IN" : "en-US", {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** True when a product needs a quantity from the user rather than a plan choice. */
export function needsQuantity(p: Product): boolean {
  return p.pricingModel === "SEAT_BASED" || p.pricingModel === "COUNT_BASED" || p.pricingModel === "USAGE";
}

/** True when a product offers a real choice of plans (rather than a single implicit one). */
export function hasPlanChoice(p: Product): boolean {
  return !p.mirrorsProductCode && p.plans.length > 1;
}

// ---- super-admin (authenticated) -------------------------------------------

/** Raw rows as the admin endpoints return them — editable, unlike the public catalogue. */
export interface AdminProduct {
  id: string;
  code: string;
  name: string;
  tagline?: string;
  icon?: string;
  pricingModel: PricingModel;
  basePrice?: number;
  unitPrice?: number;
  includedUnits?: number;
  unitLabel?: string;
  minQuantity: number;
  requiresProductCode?: string;
  mirrorsProductCode?: string;
  sortOrder: number;
  active: boolean;
}

export interface AdminPlan {
  id: string;
  productCode: string;
  code: string;
  name: string;
  description?: string;
  unitCount?: number;
  price: number;
  popular: boolean;
  sortOrder: number;
  active: boolean;
}

export interface AdminSetting {
  key: string;
  value: string;
  label?: string;
}

export interface SavedQuote {
  id: string;
  submissionId?: string;
  source: "ONBOARDING" | "STANDALONE" | "INTERNAL";
  status: "DRAFT" | "SENT" | "AGREED" | "LOST";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  currency: "INR" | "USD";
  bracketCode?: string;
  billingCycle: BillingCycle;
  selections?: string;
  breakdown?: string;
  recurringAnnual: number;
  oneTimeTotal: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  rateCardVersion?: string;
  createdAt?: string;
  /** Demo workspace provisioned from this quote, if any. */
  provisionedInstituteId?: string;
  provisionedAt?: string;
  demoExpiresAt?: string;
}

export interface QuotePage {
  content: SavedQuote[];
  totalElements: number;
  totalPages: number;
  number: number;
}

const ADM = API_PREFIXES.PRICING_ADMIN;

export async function adminListQuotes(params: {
  status?: string;
  source?: string;
  page?: number;
  size?: number;
}): Promise<QuotePage> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.source) q.set("source", params.source);
  q.set("page", String(params.page ?? 0));
  q.set("size", String(params.size ?? 20));
  return (await api.get<QuotePage>(`${ADM}/quotes?${q.toString()}`)).data;
}

export async function adminUpdateQuoteStatus(id: string, status: string): Promise<SavedQuote> {
  return (await api.put<SavedQuote>(`${ADM}/quotes/${id}/status?status=${status}`)).data;
}

export async function adminListProducts(): Promise<AdminProduct[]> {
  return (await api.get<AdminProduct[]>(`${ADM}/products`)).data;
}

export async function adminSaveProduct(product: AdminProduct): Promise<AdminProduct> {
  return (await api.post<AdminProduct>(`${ADM}/products`, product)).data;
}

export async function adminListPlans(productCode: string): Promise<AdminPlan[]> {
  return (await api.get<AdminPlan[]>(`${ADM}/products/${productCode}/plans`)).data;
}

export async function adminSavePlan(plan: AdminPlan): Promise<AdminPlan> {
  return (await api.post<AdminPlan>(`${ADM}/plans`, plan)).data;
}

export async function adminListSettings(): Promise<AdminSetting[]> {
  return (await api.get<AdminSetting[]>(`${ADM}/settings`)).data;
}

export async function adminSaveSetting(setting: AdminSetting): Promise<AdminSetting> {
  return (await api.post<AdminSetting>(`${ADM}/settings`, setting)).data;
}

// ---- demo provisioning (auth_service, authenticated) ------------------------

export interface DemoProvisionRequest {
  quoteId?: string;
  instituteName: string;
  instituteType?: string;
  adminFullName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  adminPhone?: string;
  /** ISO-8601. A bare date means end of that day. */
  expiresAt: string;
  templateInstituteId?: string;
}

export interface DemoProvisionResponse {
  instituteId: string;
  instituteName: string;
  adminUsername: string;
  expiresAt: string;
  adminPortalUrl: string;
}

export async function provisionDemo(req: DemoProvisionRequest): Promise<DemoProvisionResponse> {
  return (await api.post<DemoProvisionResponse>("/auth-service/super-admin/v1/demo/provision", req)).data;
}

/** A username the prospect can actually type, derived from their organisation name. */
export function suggestUsername(org?: string, contact?: string): string {
  const base = (org || contact || "demo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return `${base || "demo"}_admin`;
}

/** Readable throwaway password — this gets typed by a human off a screen or a WhatsApp message. */
export function suggestPassword(): string {
  const words = ["swift", "bright", "clever", "solid", "eager", "prime", "keen", "brisk"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Default trial length, as agreed: four days from now. */
export function defaultExpiry(days = 4): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Records the demo workspace a quote produced, so the row can show it. */
export async function markQuoteProvisioned(
  quoteId: string,
  instituteId: string,
  demoExpiresAt?: string
): Promise<SavedQuote> {
  const q = new URLSearchParams({ instituteId });
  if (demoExpiresAt) q.set("demoExpiresAt", String(new Date(demoExpiresAt).getTime()));
  return (await api.put<SavedQuote>(`${ADM}/quotes/${quoteId}/provisioned?${q.toString()}`)).data;
}

/** Moves a trial's end date. */
export async function extendTrial(instituteId: string, expiresAt: string): Promise<unknown> {
  return (
    await api.put(
      `/auth-service/super-admin/v1/demo/${instituteId}/expiry?expiresAt=${encodeURIComponent(expiresAt)}`
    )
  ).data;
}
