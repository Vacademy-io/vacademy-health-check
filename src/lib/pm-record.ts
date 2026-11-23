// PM View record: what the PM records about one institute (classification + Customer Register).
// Shared by the browser and the PM store server (server/pm-store.ts), so it imports nothing.
//
// ISOLATION: these records live only in the PM store. Nothing here is ever written to the
// platform backend; the platform's lead tags and subscriptions are read, never changed.

// "Production" = a real client. (An earlier "Genuine client" label meant the same and is read as PRODUCTION.)
export const PM_CLASSES = ["PRODUCTION", "TRIAL", "DEMO", "TEST", "INTERNAL", "LOST"] as const;
export type PmClass = (typeof PM_CLASSES)[number];

export const PM_CLASS_LABEL: Record<PmClass, string> = {
  PRODUCTION: "Production",
  TRIAL: "Trial",
  DEMO: "Demo",
  TEST: "Test",
  INTERNAL: "Internal",
  LOST: "Lost",
};

export const SUBSCRIPTION_TYPES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL", "ONE_TIME", "CUSTOM"] as const;
export type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];
export const SUBSCRIPTION_TYPE_LABEL: Record<SubscriptionType, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  ANNUAL: "Annual",
  ONE_TIME: "One-time",
  CUSTOM: "Custom",
};
/** Months per billing period, for monthly value; null = not recurring. */
export const SUBSCRIPTION_MONTHS: Record<SubscriptionType, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
  ONE_TIME: null,
  CUSTOM: null,
};

export const PAYMENT_MODES = ["RAZORPAY", "BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "INVOICE", "OTHER"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ["PAID", "PENDING", "OVERDUE", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** How a trial / customer check-in went. */
export const FOLLOW_UP_OUTCOMES = ["POSITIVE", "NEEDS_HELP", "EVALUATING", "NO_RESPONSE", "NOT_INTERESTED", "CONVERTED"] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];
export const FOLLOW_UP_LABEL: Record<FollowUpOutcome, string> = {
  POSITIVE: "Going well",
  NEEDS_HELP: "Needs help",
  EVALUATING: "Still evaluating",
  NO_RESPONSE: "No response",
  NOT_INTERESTED: "Not interested",
  CONVERTED: "Wants to buy",
};

/** One update the PM recorded after checking in with the account. */
export interface PmFollowUp {
  date: string;
  outcome: FollowUpOutcome;
  note: string;
  by: string;
}

export interface PmContact {
  role: string;
  name: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD, optional. */
  birthday: string;
}

export interface PmPayment {
  date: string;
  amount: number | null;
  invoice: string;
  status: PaymentStatus;
  note: string;
}

export interface PmCustomDate {
  label: string;
  date: string;
  /** Repeats every year on the same day (birthdays, academic year start). */
  yearly: boolean;
}

export interface PmRecord {
  instituteId: string;
  /** Name as entered or as it was when first saved; the live platform name wins in the UI. */
  name: string;
  classification: PmClass | null;
  owner: string;
  products: string[];
  contacts: PmContact[];
  // Contract
  planName: string;
  subscriptionType: SubscriptionType | null;
  startDate: string;
  endDate: string;
  renewalDate: string;
  autoRenew: boolean;
  noticeDays: number | null;
  // Pricing (whole rupees)
  listPrice: number | null;
  discount: number | null;
  finalPrice: number | null;
  currency: string;
  gstPercent: number | null;
  paymentMode: PaymentMode | null;
  seats: number | null;
  aiCredits: number | null;
  nextPaymentDue: string;
  payments: PmPayment[];
  // Key dates
  signedOn: string;
  goLiveDate: string;
  firstPaymentDate: string;
  /** Overrides the anniversary worked out from go-live / start date. */
  anniversaryDate: string;
  customDates: PmCustomDate[];
  // Trial / customer follow-ups (newest first)
  followUps: PmFollowUp[];
  /** When to check in next (YYYY-MM-DD). */
  nextFollowUp: string;
  // Context
  source: string;
  referredBy: string;
  notes: string;
  /** Links to the agreement, PO or invoices (stored elsewhere, e.g. Drive). */
  attachments: string[];
  updatedAt: string;
  updatedBy: string;
}

export function emptyRecord(instituteId: string, name = ""): PmRecord {
  return {
    instituteId,
    name,
    classification: null,
    owner: "",
    products: [],
    contacts: [],
    planName: "",
    subscriptionType: null,
    startDate: "",
    endDate: "",
    renewalDate: "",
    autoRenew: false,
    noticeDays: null,
    listPrice: null,
    discount: null,
    finalPrice: null,
    currency: "INR",
    gstPercent: null,
    paymentMode: null,
    seats: null,
    aiCredits: null,
    nextPaymentDue: "",
    payments: [],
    signedOn: "",
    goLiveDate: "",
    firstPaymentDate: "",
    anniversaryDate: "",
    customDates: [],
    followUps: [],
    nextFollowUp: "",
    source: "",
    referredBy: "",
    notes: "",
    attachments: [],
    updatedAt: "",
    updatedBy: "",
  };
}

// ---------------------------------------------------------------- sanitising (server and import)

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const bool = (v: unknown) => v === true || v === "true" || v === "yes" || v === "1" || v === 1;
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
/** Classification from any input; "Genuine", "Genuine client" and "PROD" are read as PRODUCTION. */
export function parseClass(v: unknown): PmClass | null {
  const s = str(v).toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "GENUINE" || s === "GENUINE_CLIENT" || s === "PROD") return "PRODUCTION";
  return (PM_CLASSES as readonly string[]).includes(s) ? (s as PmClass) : null;
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  const s = str(v).toUpperCase().replace(/[\s-]+/g, "_");
  return (list as readonly string[]).includes(s) ? (s as T) : null;
}

/** "2026-03-01", "01/03/2026", "1-3-2026", "2026-03-01T…" → "2026-03-01"; anything else → "". Day-first for slashes (India). */
export function normalizeDate(v: unknown): string {
  const s = str(v, 40);
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
  } else {
    return "";
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const list = <T>(v: unknown, map: (x: unknown) => T | null, max = 50): T[] =>
  Array.isArray(v) ? v.slice(0, max).map(map).filter((x): x is T => x !== null) : [];

/**
 * Coerces anything (a JSON body, an imported CSV row) into a valid PmRecord. Unknown fields are
 * dropped, enums must match, dates are normalised to YYYY-MM-DD. Returns null without an institute id.
 */
export function sanitizeRecord(input: unknown): PmRecord | null {
  const r = (input ?? {}) as Record<string, unknown>;
  const instituteId = str(r.instituteId, 100);
  if (!instituteId) return null;
  const base = emptyRecord(instituteId, str(r.name, 200));
  return {
    ...base,
    classification: parseClass(r.classification),
    owner: str(r.owner, 100),
    products: list(r.products, (x) => str(x, 40) || null, 10),
    contacts: list(r.contacts, (x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const contact: PmContact = { role: str(c.role, 60), name: str(c.name, 120), email: str(c.email, 200), phone: str(c.phone, 40), birthday: normalizeDate(c.birthday) };
      return contact.name || contact.email || contact.phone ? contact : null;
    }, 10),
    planName: str(r.planName, 120),
    subscriptionType: oneOf(SUBSCRIPTION_TYPES, r.subscriptionType),
    startDate: normalizeDate(r.startDate),
    endDate: normalizeDate(r.endDate),
    renewalDate: normalizeDate(r.renewalDate),
    autoRenew: bool(r.autoRenew),
    noticeDays: numOrNull(r.noticeDays),
    listPrice: numOrNull(r.listPrice),
    discount: numOrNull(r.discount),
    finalPrice: numOrNull(r.finalPrice),
    currency: str(r.currency, 8).toUpperCase() || "INR",
    gstPercent: numOrNull(r.gstPercent),
    paymentMode: oneOf(PAYMENT_MODES, r.paymentMode),
    seats: numOrNull(r.seats),
    aiCredits: numOrNull(r.aiCredits),
    nextPaymentDue: normalizeDate(r.nextPaymentDue),
    payments: list(r.payments, (x) => {
      const p = (x ?? {}) as Record<string, unknown>;
      const date = normalizeDate(p.date);
      if (!date) return null;
      return { date, amount: numOrNull(p.amount), invoice: str(p.invoice, 60), status: oneOf(PAYMENT_STATUSES, p.status) ?? "PAID", note: str(p.note, 200) };
    }, 200),
    signedOn: normalizeDate(r.signedOn),
    goLiveDate: normalizeDate(r.goLiveDate),
    firstPaymentDate: normalizeDate(r.firstPaymentDate),
    anniversaryDate: normalizeDate(r.anniversaryDate),
    customDates: list(r.customDates, (x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const date = normalizeDate(c.date);
      const label = str(c.label, 80);
      return date && label ? { label, date, yearly: bool(c.yearly) } : null;
    }, 20),
    followUps: list(r.followUps, (x) => {
      const f = (x ?? {}) as Record<string, unknown>;
      const date = normalizeDate(f.date);
      const outcome = oneOf(FOLLOW_UP_OUTCOMES, f.outcome);
      return date && outcome ? { date, outcome, note: str(f.note, 2000), by: str(f.by, 100) } : null;
    }, 200).sort((a, b) => b.date.localeCompare(a.date)),
    nextFollowUp: normalizeDate(r.nextFollowUp),
    source: str(r.source, 120),
    referredBy: str(r.referredBy, 120),
    notes: str(r.notes, 5000),
    attachments: list(r.attachments, (x) => {
      const u = str(x, 1000);
      return /^https?:\/\//i.test(u) ? u : null;
    }, 20),
    updatedAt: str(r.updatedAt, 40),
    updatedBy: str(r.updatedBy, 100),
  };
}

/** Monthly value in rupees from the register (final price per period); null when not recurring or no price. */
export function recordMonthlyValue(r: Pick<PmRecord, "finalPrice" | "subscriptionType">): number | null {
  if (r.finalPrice === null || !r.subscriptionType) return null;
  const months = SUBSCRIPTION_MONTHS[r.subscriptionType];
  return months ? Math.round(r.finalPrice / months) : null;
}

/** End date from a start date and plan length (the day before the next period starts); "" if unknown. */
export function endDateFor(start: string, type: SubscriptionType | null): string {
  const months = type ? SUBSCRIPTION_MONTHS[type] : null;
  const d0 = normalizeDate(start);
  if (!months || !d0) return "";
  const [y, m, d] = d0.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  // Month overflow (31 Jan + 1 month) lands early next month; step back to that month's last day.
  if (end.getUTCDate() !== d) end.setUTCDate(0);
  else end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** "12 months", "1 year 2 months", "45 days" between two dates (inclusive); "" if either is missing. */
export function durationText(start: string, end: string): string {
  const a = normalizeDate(start);
  const b = normalizeDate(end);
  if (!a || !b || b < a) return "";
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const next = new Date(Date.UTC(by, bm - 1, bd));
  next.setUTCDate(next.getUTCDate() + 1);
  let months = (next.getUTCFullYear() - ay) * 12 + (next.getUTCMonth() - (am - 1));
  if (next.getUTCDate() < ad) months--;
  if (months < 1) {
    const days = Math.round((next.getTime() - Date.UTC(ay, am - 1, ad)) / 86_400_000);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

/** Digits for tel: / WhatsApp links; Indian 10-digit numbers get +91. */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  return d.length === 10 ? `91${d}` : d;
}

// ---------------------------------------------------------------- task state (inbox done / snoozed)

export interface PmTaskState {
  key: string;
  state: "DONE" | "SNOOZED";
  /** SNOOZED until this ISO time. */
  until: string;
  at: string;
  by: string;
}

export interface PmHistoryEntry {
  instituteId: string;
  at: string;
  by: string;
  /** Field names that changed; "created" / "deleted" for whole-record events. */
  changes: { field: string; before: unknown; after: unknown }[];
}

/** Field-level diff for the edit history (ignores updatedAt / updatedBy). */
export function diffRecords(before: PmRecord | null, after: PmRecord | null): PmHistoryEntry["changes"] {
  if (!before && after) return [{ field: "created", before: null, after: after.classification }];
  if (before && !after) return [{ field: "deleted", before: before.classification, after: null }];
  if (!before || !after) return [];
  const out: PmHistoryEntry["changes"] = [];
  for (const k of Object.keys(after) as (keyof PmRecord)[]) {
    if (k === "updatedAt" || k === "updatedBy") continue;
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) out.push({ field: k, before: before[k] ?? null, after: after[k] ?? null });
  }
  return out;
}
