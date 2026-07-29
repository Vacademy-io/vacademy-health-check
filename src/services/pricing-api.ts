import { API_PREFIXES } from "@/lib/constants";

// ---- types (mirror the community_service pricing DTOs) ----------------------

export interface Bracket {
  code: string;
  name: string;
  maxStudents: number;
  perStudentPerYear: number;
  lmsAnnual: number;
  parentAppPerStudent: number;
  androidIncluded: boolean;
  iosIncluded: boolean;
  websiteIncluded: boolean;
  commsIncluded: boolean;
  includedSubOrgs: number;
  premiumSupportIncluded: boolean;
  includes: string[];
}

export interface RateCatalog {
  version: string;
  brackets: Bracket[];
  androidOneTime: number;
  iosOneTime: number;
  whatsappAndPayments: number;
  websiteAnnual: number;
  crmBase: number;
  crmIncludedSeats: number;
  crmExtraSeat: number;
  extraSubOrg: number;
  meetPerSessionHour: number;
  premiumSupportUpgrade: number;
  dedicatedSupportMonthly: number;
  gstRate: number;
  usdPerInr: number;
}

export type BillingCycle = "MONTHLY" | "HALF_YEARLY" | "ANNUAL";
export type SupportTier = "BASIC" | "PREMIUM" | "DEDICATED";

export interface QuoteRequest {
  submissionId?: string;
  slug?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  currency: "INR" | "USD";
  billingCycle: BillingCycle;
  studentCount?: number;
  bracketCode?: string;
  lms: boolean;
  crm: boolean;
  payments: boolean;
  whatsapp: boolean;
  android: boolean;
  ios: boolean;
  parentApp: boolean;
  website: boolean;
  subOrgs: boolean;
  vacademyMeet: boolean;
  crmSeats?: number;
  subOrgCount?: number;
  meetSessionsPerMonth?: number;
  supportTier: SupportTier;
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
  bracketCode: string;
  bracketName: string;
  studentCount: number;
  recurringLines: LineItem[];
  oneTimeLines: LineItem[];
  recurringAnnual: number;
  cycleAdjustment: number;
  cycleAdjustmentLabel: string;
  oneTimeTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  taxLabel: string;
  total: number;
  perPaymentAmount: number;
  perPaymentLabel: string;
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
