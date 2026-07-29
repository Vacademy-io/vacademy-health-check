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
  return res.json();
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
