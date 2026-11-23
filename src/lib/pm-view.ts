// PM View logic: accounts list, health score, action inbox, key dates and CSV import / export.
// Pure functions only (tests/pm-view.test.ts runs them under node --test).
//
// ISOLATION: inputs are platform data read with GET plus PM records from the PM store. Nothing in
// this file produces a platform write; the PM classification never changes the platform lead tag.
import type { InstituteListItemDTO, LeadTag } from "../types/api";
import type { Subscription } from "../types/plans";
import { isPaidSubscription, periodPriceMinor, revenueBucket, monthlyValueMinor, type TrialRow } from "./command-center.ts";
import {
  PM_CLASS_LABEL,
  PM_CLASSES,
  SUBSCRIPTION_MONTHS,
  SUBSCRIPTION_TYPES,
  PAYMENT_MODES,
  normalizeDate,
  parseClass,
  recordMonthlyValue,
  type PmClass,
  type PmContact,
  type PmRecord,
  type PmTaskState,
} from "./pm-record.ts";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- dates

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `from` (YYYY-MM-DD) to `to` (YYYY-MM-DD or ISO); null if either is missing. */
export function daysBetween(from: string, to: string | null | undefined): number | null {
  if (!to) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Next yearly occurrence of `date` on or after `today`; 29 Feb falls on 28 Feb in other years. */
export function nextYearly(date: string, today: string): { date: string; years: number } | null {
  const d = normalizeDate(date);
  if (!d) return null;
  const [oy, om, od] = d.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  for (const y of [ty, ty + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = om === 2 && od === 29 && !leap ? 28 : od;
    const candidate = `${y}-${String(om).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate >= today) return { date: candidate, years: y - oy };
  }
  return null;
}

// ---------------------------------------------------------------- products

/** Display names for every product we track (GA config may add more; unknown keys show as-is). */
export const PRODUCT_LABELS: Record<string, string> = {
  vacademy: "Vacademy.io",
  voomsales: "Voomsales",
  telleo: "Telleo",
  evalezy: "Evalezy",
  vimotion: "Vimotion",
};
export const productName = (key: string) => PRODUCT_LABELS[key.toLowerCase()] ?? key;

const PRODUCT_WORDS: [string, string[]][] = [
  ["voomsales", ["voomsales", "voom", "crm", "sales"]],
  ["telleo", ["telleo", "call", "voice", "dialer"]],
  ["evalezy", ["evalezy", "evaluat", "answer_sheet", "answersheet", "grading"]],
  ["vimotion", ["vimotion", "video"]],
  ["vacademy", ["vacademy", "lms", "learning", "course"]],
];

/** Product key for a pricing product code ("LMS_PRO" → vacademy); unknown codes come back lower-cased. */
export function productFromCode(code: string): string {
  const c = code.toLowerCase();
  for (const [key, words] of PRODUCT_WORDS) if (words.some((w) => c.includes(w))) return key;
  return c;
}

/** Products picked in a saved quote's selections (JSON array or object keyed by product code). */
export function productsFromSelections(selections: string | null | undefined): string[] {
  if (!selections) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(selections);
  } catch {
    return [];
  }
  const codes: string[] = [];
  if (Array.isArray(parsed)) for (const x of parsed) {
    const code = (x as { productCode?: unknown })?.productCode;
    if (typeof code === "string" && code) codes.push(code);
  }
  else if (parsed && typeof parsed === "object") for (const [k, v] of Object.entries(parsed)) codes.push(typeof (v as { productCode?: unknown })?.productCode === "string" ? (v as { productCode: string }).productCode : k);
  return [...new Set(codes.map(productFromCode))];
}

// ---------------------------------------------------------------- accounts

/** Who from the institute has signed in, from the platform's user list (read-only). */
export interface AccountUsage {
  users: number;
  loggedIn: number;
  lastLogin: string | null;
}

/** AI credit balance from the AI service (read-only). */
export interface AccountCredits {
  total: number;
  used: number;
  balance: number;
  low: boolean;
}

/** AI calls made by one institute in a period (from the platform's call log, read-only). */
export interface InstituteCalls {
  instituteId: string;
  name: string;
  calls: number;
  /** Calls that lasted more than 0 seconds. */
  connected: number;
  minutes: number;
  billedInr: number;
  lastCall: string | null;
}

/** The call fields this view needs (CallRow from calls-api). */
export interface CallLite {
  institute_id: string | null;
  institute_name: string | null;
  call_start: string | null;
  duration_seconds: number | null;
  billed_inr: number | null;
}

/** Calls per institute, most calls first. Calls with no institute are grouped as "No institute". */
export function callsByInstitute(calls: CallLite[]): InstituteCalls[] {
  const m = new Map<string, InstituteCalls>();
  for (const c of calls) {
    const id = c.institute_id || "none";
    const r = m.get(id) ?? { instituteId: id, name: c.institute_name || (id === "none" ? "No institute" : id), calls: 0, connected: 0, minutes: 0, billedInr: 0, lastCall: null };
    r.calls++;
    const secs = Number(c.duration_seconds) || 0;
    if (secs > 0) r.connected++;
    r.minutes += secs / 60;
    r.billedInr += Number(c.billed_inr) || 0;
    if (c.call_start && (!r.lastCall || c.call_start > r.lastCall)) r.lastCall = c.call_start;
    if (!r.name || r.name === id) r.name = c.institute_name || r.name;
    m.set(id, r);
  }
  return [...m.values()].sort((a, b) => b.calls - a.calls || b.minutes - a.minutes);
}

/** Calls per day for the last `days` days (oldest first, zero-filled), by call start date. */
export function callsPerDay(calls: CallLite[], days: number, today: string): { date: string; calls: number; minutes: number }[] {
  const out: { date: string; calls: number; minutes: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    idx.set(key, out.length);
    out.push({ date: key, calls: 0, minutes: 0 });
  }
  for (const c of calls) {
    const i = c.call_start ? idx.get(c.call_start.slice(0, 10)) : undefined;
    if (i === undefined) continue;
    out[i].calls++;
    out[i].minutes += (Number(c.duration_seconds) || 0) / 60;
  }
  return out;
}

/** Extra read-only platform data joined onto accounts when it's loaded. */
export interface AccountExtras {
  usage?: Map<string, AccountUsage>;
  credits?: Map<string, AccountCredits>;
  /** Products picked in the quote a demo workspace was created from. */
  quoteProducts?: Map<string, string[]>;
  /** AI calls in the last 30 days, per institute. */
  calls30?: Map<string, InstituteCalls>;
}

/** Where a trial account is, from first login to paying. */
export type TrialStage = "NOT_LOGGED_IN" | "SETTING_UP" | "BUILDING" | "ACTIVE" | "EXPIRED" | "CONVERTED";
export const TRIAL_STAGE_LABEL: Record<TrialStage, string> = {
  NOT_LOGGED_IN: "Not logged in yet",
  SETTING_UP: "Logged in, no course yet",
  BUILDING: "Course created, no students",
  ACTIVE: "Using it (students added)",
  EXPIRED: "Trial ended",
  CONVERTED: "Paying",
};

export function trialStage(a: { paid: boolean; trial: TrialRow | null; usage: AccountUsage | null; courses: number; students: number; activeNow: number }): TrialStage | null {
  if (!a.trial) return null;
  if (a.paid) return "CONVERTED";
  if (a.trial.daysLeft !== null && a.trial.daysLeft < 0) return "EXPIRED";
  if (a.students > 0) return "ACTIVE";
  if (a.courses > 0) return "BUILDING";
  const loggedIn = (a.usage?.loggedIn ?? 0) > 0 || a.activeNow > 0;
  return loggedIn ? "SETTING_UP" : "NOT_LOGGED_IN";
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  subdomain: string;
  city: string;
  state: string;
  createdAt: string;
  students: number;
  courses: number;
  /** Platform lead tag: read-only, shown as-is. */
  platformTag: LeadTag | null;
  /** The subscription that best describes the account (paying > due > trial > other). */
  subscription: Subscription | null;
  platformPlan: string | null;
  platformMrrMinor: number;
  paid: boolean;
  /** Start of the first paid subscription (platform), if any. */
  paidSince: string | null;
  trial: TrialRow | null;
  /** When the demo workspace (and its login) was created and sent; null if not a demo workspace. */
  credentialsSentAt: string | null;
  /** Sign-ins from the institute's user list; null until loaded (only fetched for trial accounts). */
  usage: AccountUsage | null;
  trialStage: TrialStage | null;
  credits: AccountCredits | null;
  /** AI calls in the last 30 days; null until loaded. */
  calls30: InstituteCalls | null;
  /** Product keys: from the register if set there, else from the demo quote. */
  products: string[];
  productSource: "register" | "quote" | null;
  instituteType: string;
  activeNow: number;
  /** PM data, from the PM store. */
  record: PmRecord | null;
  pmClass: PmClass | null;
  /** Register renewal date, else contract end. */
  renewalDate: string | null;
  daysToRenewal: number | null;
  registerMonthly: number | null;
  mismatches: string[];
  health: number;
  healthLabel: "Healthy" | "Watch" | "At risk";
}

const SUB_RANK: Record<string, number> = { MRR: 0, DUE: 1, TRIAL: 2, NON_REVENUE: 3, OTHER: 4, ENDED: 5 };

function pickSubscription(list: Subscription[]): Subscription | null {
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) => (SUB_RANK[revenueBucket(a)] ?? 9) - (SUB_RANK[revenueBucket(b)] ?? 9) || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  )[0];
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Where the PM's classification and the platform disagree. Flagged only, never synced. */
export function findMismatches(a: Pick<AccountRow, "pmClass" | "platformTag" | "paid" | "subscription" | "record">): string[] {
  const out: string[] = [];
  const customer = a.pmClass === "PRODUCTION";
  if (customer && a.platformTag === "TEST") out.push("Platform tag is TEST");
  else if (customer && !a.paid && a.platformTag !== "PROD") out.push("No PROD tag or paid subscription on the platform");
  if ((a.pmClass === "TEST" || a.pmClass === "INTERNAL" || a.pmClass === "LOST") && (a.paid || a.platformTag === "PROD"))
    out.push(`Platform shows it as ${a.paid ? "paying" : "PROD"}`);
  const r = a.record;
  if (r?.finalPrice != null && r.subscriptionType && a.subscription && a.paid) {
    const months = SUBSCRIPTION_MONTHS[r.subscriptionType];
    const platformPrice = periodPriceMinor(a.subscription) / 100;
    if (months && months === a.subscription.period_months && Math.abs(platformPrice - r.finalPrice) >= 1)
      out.push(`Price differs: register ${rupees(r.finalPrice)}, platform ${rupees(platformPrice)}`);
  }
  return out;
}

/** 0–100 from what the portal can see today: live activity, setup depth, paying status, time left. */
export function healthScore(a: Pick<AccountRow, "activeNow" | "students" | "courses" | "paid" | "pmClass" | "trial" | "daysToRenewal">): number {
  let s = 0;
  if (a.activeNow > 0) s += 25;
  if (a.students > 0) s += 15;
  if (a.courses > 0) s += 15;
  if (a.paid || a.pmClass === "PRODUCTION") s += 20;
  const left = a.trial?.daysLeft ?? a.daysToRenewal;
  if (left === null || left === undefined) s += 15;
  else if (left > 14) s += 25;
  else if (left > 3) s += 10;
  if (a.pmClass === "LOST") s = Math.min(s, 20);
  return Math.max(0, Math.min(100, s));
}

export const healthLabel = (n: number): AccountRow["healthLabel"] => (n >= 70 ? "Healthy" : n >= 40 ? "Watch" : "At risk");

export function buildAccounts(
  institutes: InstituteListItemDTO[],
  subs: Subscription[],
  trials: TrialRow[],
  activeNow: Map<string, number>,
  records: Map<string, PmRecord>,
  today: string,
  extras: AccountExtras = {}
): AccountRow[] {
  const usage = extras.usage ?? new Map<string, AccountUsage>();
  const subsBy = new Map<string, Subscription[]>();
  for (const s of subs) subsBy.set(s.institute_id, [...(subsBy.get(s.institute_id) ?? []), s]);
  const trialBy = new Map(trials.map((t) => [t.instituteId, t]));

  const row = (id: string, base: Partial<InstituteListItemDTO>): AccountRow => {
    const list = subsBy.get(id) ?? [];
    const subscription = pickSubscription(list);
    const record = records.get(id) ?? null;
    const paid = list.some((s) => revenueBucket(s) === "MRR" || (isPaidSubscription(s) && s.status !== "EXPIRED" && s.status !== "CANCELLED"));
    const renewalDate = record?.renewalDate || record?.endDate || null;
    const paidStarts = list.filter(isPaidSubscription).map((s) => s.start_at ?? s.created_at).filter((d): d is string => !!d).sort();
    const partial = {
      id,
      name: base.name || record?.name || subscription?.institute_name || id,
      email: base.email ?? "",
      subdomain: base.subdomain ?? "",
      city: base.city ?? "",
      state: base.state ?? "",
      createdAt: base.created_at ?? "",
      students: base.student_count ?? 0,
      courses: base.course_count ?? 0,
      platformTag: base.lead_tag ?? null,
      subscription,
      platformPlan: subscription ? subscription.plan_name ?? subscription.plan_key ?? null : null,
      platformMrrMinor: list.filter((s) => revenueBucket(s) === "MRR").reduce((t, s) => t + monthlyValueMinor(s), 0),
      paid,
      paidSince: paidStarts[0] ?? null,
      trial: trialBy.get(id) ?? null,
      credentialsSentAt: (() => {
        const t = trialBy.get(id);
        return t && t.sources.includes("DEMO") ? t.startedAt : null;
      })(),
      usage: usage.get(id) ?? null,
      credits: extras.credits?.get(id) ?? null,
      calls30: extras.calls30?.get(id) ?? (extras.calls30 ? { instituteId: id, name: base.name ?? id, calls: 0, connected: 0, minutes: 0, billedInr: 0, lastCall: null } : null),
      ...(() => {
        if (record?.products.length) return { products: record.products.map((p) => p.toLowerCase()), productSource: "register" as const };
        const q = extras.quoteProducts?.get(id);
        return q?.length ? { products: q, productSource: "quote" as const } : { products: [] as string[], productSource: null };
      })(),
      instituteType: base.type ?? "",
      activeNow: activeNow.get(id) ?? 0,
      record,
      pmClass: record?.classification ?? null,
      renewalDate,
      daysToRenewal: daysBetween(today, renewalDate),
      registerMonthly: record ? recordMonthlyValue(record) : null,
    };
    const mismatches = findMismatches(partial);
    const health = healthScore(partial);
    return { ...partial, trialStage: trialStage(partial), mismatches, health, healthLabel: healthLabel(health) };
  };

  const out = institutes.map((i) => row(i.id, i));
  // Register entries for institutes the list didn't return (deleted on the platform, or entered by hand).
  const seen = new Set(out.map((r) => r.id));
  for (const r of records.values()) if (!seen.has(r.instituteId)) out.push(row(r.instituteId, { name: r.name }));
  return out;
}

// ---------------------------------------------------------------- quick filters

export const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active institutes (now)" },
  { key: "production", label: "Production" },
  { key: "paying", label: "PROD / paying on platform" },
  { key: "trial", label: "On trial" },
  { key: "expiring", label: "Expiring soon" },
  { key: "unreviewed", label: "Not yet reviewed" },
  { key: "test", label: "Test / internal" },
  { key: "mismatch", label: "PM ≠ platform" },
  { key: "noproduct", label: "Product not set" },
  { key: "lowcredits", label: "Low AI credits" },
] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number]["key"];

const onTrial = (a: AccountRow) => (a.trial !== null && (a.trial.daysLeft === null || a.trial.daysLeft >= 0)) || a.platformTag === "FREE_TRIAL";

export function matchesQuick(a: AccountRow, f: QuickFilter): boolean {
  switch (f) {
    case "active":
      return a.activeNow > 0;
    case "production":
      return a.pmClass === "PRODUCTION";
    case "paying":
      return a.platformTag === "PROD" || a.paid;
    case "trial":
      return onTrial(a);
    case "expiring":
      return (a.trial?.daysLeft != null && a.trial.daysLeft >= 0 && a.trial.daysLeft <= 7) || (a.daysToRenewal !== null && a.daysToRenewal >= 0 && a.daysToRenewal <= 30);
    case "unreviewed":
      return a.pmClass === null;
    case "test":
      return a.platformTag === "TEST" || a.pmClass === "TEST" || a.pmClass === "INTERNAL";
    case "mismatch":
      return a.mismatches.length > 0;
    case "noproduct":
      return a.products.length === 0;
    case "lowcredits":
      return !!a.credits?.low;
    default:
      return true;
  }
}

/** Several quick filters together = all must match (e.g. Active institutes + PROD on platform + Not yet reviewed). */
export function filterAccounts(rows: AccountRow[], filters: QuickFilter[], search: string): AccountRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter(
    (a) =>
      filters.every((f) => matchesQuick(a, f)) &&
      (!q || [a.name, a.email, a.subdomain, a.city, a.id, a.record?.owner ?? "", a.record?.planName ?? ""].some((v) => v.toLowerCase().includes(q)))
  );
}

// ---------------------------------------------------------------- key dates (renewal calendar)

export type EventType = "RENEWAL" | "CONTRACT_END" | "PAYMENT_DUE" | "ANNIVERSARY" | "TRIAL_END" | "CUSTOM" | "BIRTHDAY";

export const EVENT_LABEL: Record<EventType, string> = {
  RENEWAL: "Renewal",
  CONTRACT_END: "Contract ends",
  PAYMENT_DUE: "Payment due",
  ANNIVERSARY: "Anniversary",
  TRIAL_END: "Trial ends",
  CUSTOM: "Key date",
  BIRTHDAY: "Birthday",
};

export interface KeyDate {
  date: string;
  daysAway: number;
  type: EventType;
  instituteId: string;
  name: string;
  detail: string;
  /** Monthly value at stake (register), for renewals and contract ends. */
  amount: number | null;
}

/** Every dated event from `today` through `today + days` (past-due payments included), soonest first. */
export function upcomingKeyDates(accounts: AccountRow[], today: string, days: number): KeyDate[] {
  const out: KeyDate[] = [];
  const push = (a: AccountRow, date: string | null | undefined, type: EventType, detail: string, amount: number | null = null, allowPast = false) => {
    const away = daysBetween(today, date);
    if (away === null || away > days || (away < 0 && !allowPast)) return;
    out.push({ date: date!.slice(0, 10), daysAway: away, type, instituteId: a.id, name: a.name, detail, amount });
  };
  for (const a of accounts) {
    const r = a.record;
    if (a.trial?.endsAt && !a.paid) push(a, a.trial.endsAt, "TRIAL_END", "Platform trial");
    if (!r || r.classification === "LOST" || r.classification === "TEST" || r.classification === "INTERNAL") continue;
    const value = recordMonthlyValue(r) ?? r.finalPrice;
    if (r.renewalDate) push(a, r.renewalDate, "RENEWAL", [r.planName, r.autoRenew ? "auto-renews" : "manual renewal"].filter(Boolean).join(" · "), value);
    if (r.endDate && r.endDate !== r.renewalDate) push(a, r.endDate, "CONTRACT_END", r.planName || "Contract", value);
    if (r.nextPaymentDue) push(a, r.nextPaymentDue, "PAYMENT_DUE", r.finalPrice != null ? rupees(r.finalPrice) : "Next payment", r.finalPrice, true);
    const origin = r.anniversaryDate || r.goLiveDate || r.startDate;
    const ann = origin ? nextYearly(origin, today) : null;
    if (ann && ann.years >= 1) push(a, ann.date, "ANNIVERSARY", `${ann.years} year${ann.years === 1 ? "" : "s"} as a customer`);
    for (const c of r.customDates) {
      const when = c.yearly ? nextYearly(c.date, today)?.date : c.date;
      push(a, when, "CUSTOM", c.label);
    }
    for (const c of r.contacts) {
      const bd = c.birthday ? nextYearly(c.birthday, today) : null;
      if (bd) push(a, bd.date, "BIRTHDAY", `${c.name || c.email}${c.role ? ` (${c.role})` : ""}`);
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name));
}

// ---------------------------------------------------------------- action inbox (what to do today)

export type Severity = "high" | "medium" | "low" | "info";
export type TaskKind = "TRIAL" | "FOLLOW_UP" | "RENEWAL" | "PAYMENT" | "RELATIONSHIP" | "REVIEW" | "DATA";
/** The goal a task serves; the work list is grouped by it. */
export type TaskGroup = "TRIALS" | "RETAIN" | "RELATIONSHIP" | "HOUSEKEEPING";
export type TaskWhen = "OVERDUE" | "TODAY" | "THIS_WEEK" | "LATER";

export const TASK_GROUPS: { key: TaskGroup; label: string; goal: string }[] = [
  { key: "TRIALS", label: "Trial follow-ups", goal: "After the demo: are they using it, and what's their decision" },
  { key: "RETAIN", label: "Keep customers", goal: "Renewals, payments and customers at risk" },
  { key: "RELATIONSHIP", label: "Relationships", goal: "Anniversaries, birthdays and key dates" },
  { key: "HOUSEKEEPING", label: "Housekeeping", goal: "Keep the account list and tracking accurate" },
];
export const WHEN_LABEL: Record<TaskWhen, string> = { OVERDUE: "Overdue", TODAY: "Today", THIS_WEEK: "This week", LATER: "Later" };

export interface InboxTask {
  key: string;
  kind: TaskKind;
  group: TaskGroup;
  severity: Severity;
  when: TaskWhen;
  title: string;
  /** Why it's on the list. */
  detail: string;
  /** The recommended next step, in plain words. */
  action: string;
  /** ₹ at stake when known; used to rank equally urgent tasks. */
  impact: number;
  instituteId?: string;
  /** Accounts filter to open, for summary tasks. */
  filter?: QuickFilter;
}

export interface InboxSignals {
  /** GA products that reported zero visitors in the period. */
  gaZeroProducts?: string[];
  /** The platform activity endpoint reported no sign-ins at all. */
  platformActivityZero?: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
const WHEN_RANK: Record<TaskWhen, number> = { OVERDUE: 0, TODAY: 1, THIS_WEEK: 2, LATER: 3 };

/** Days until due → when bucket (negative = overdue). */
export function whenOf(daysLeft: number | null): TaskWhen {
  if (daysLeft === null) return "THIS_WEEK";
  if (daysLeft < 0) return "OVERDUE";
  if (daysLeft === 0) return "TODAY";
  return daysLeft <= 7 ? "THIS_WEEK" : "LATER";
}

const inDays = (n: number) => (n < 0 ? `${-n}d overdue` : n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`);

/** Most urgent first: overdue/today before later, then severity, then ₹ at stake. */
export function rankTasks(tasks: InboxTask[]): InboxTask[] {
  return [...tasks].sort(
    (a, b) => WHEN_RANK[a.when] - WHEN_RANK[b.when] || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.impact - a.impact || a.title.localeCompare(b.title)
  );
}

/** The few tasks to do first: urgent and important, never housekeeping or info. */
export function topFocus(tasks: InboxTask[], n = 3): InboxTask[] {
  return rankTasks(tasks.filter((t) => t.severity !== "info" && t.group !== "HOUSEKEEPING" && t.when !== "LATER")).slice(0, n);
}

const OUT_OF_SCOPE = new Set<PmClass>(["LOST", "TEST", "INTERNAL"]);

export function buildInbox(accounts: AccountRow[], today: string, signals: InboxSignals = {}): InboxTask[] {
  const tasks: InboxTask[] = [];
  const add = (t: Omit<InboxTask, "impact"> & { impact?: number }) => tasks.push({ impact: 0, ...t });

  for (const a of accounts) {
    const r = a.record;
    const skip = a.pmClass !== null && OUT_OF_SCOPE.has(a.pmClass);
    const t = a.trial;
    const lastUpdate = r?.followUps[0]?.date ?? null;
    const sinceUpdate = lastUpdate ? -(daysBetween(today, lastUpdate) ?? 0) : null;
    const updateNote = lastUpdate ? `last update ${sinceUpdate === 0 ? "today" : `${sinceUpdate}d ago`}` : "no update recorded yet";

    // Trial follow-ups: what happened after the demo, from usage.
    if (t && !a.paid && !skip) {
      const sent = a.credentialsSentAt ?? t.startedAt ?? a.createdAt;
      const sinceSent = sent ? -(daysBetween(today, sent) ?? 0) : 0;
      const stage = a.trialStage;
      if (t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 3)
        add({ key: `trial-end:${a.id}:${t.endsAt}`, kind: "TRIAL", group: "TRIALS", severity: "high", when: whenOf(t.daysLeft), title: a.name, detail: `Trial ends ${inDays(t.daysLeft)} · ${stage ? TRIAL_STAGE_LABEL[stage].toLowerCase() : ""} · ${updateNote}`, action: "Get their decision: buying, extending or dropping", instituteId: a.id });
      else if (t.daysLeft !== null && t.daysLeft < 0 && t.daysLeft >= -7 && !r?.followUps.some((f) => f.date >= (t.endsAt ?? "").slice(0, 10)))
        add({ key: `trial-expired:${a.id}:${t.endsAt}`, kind: "TRIAL", group: "TRIALS", severity: "medium", when: "THIS_WEEK", title: a.name, detail: `Trial ended ${-t.daysLeft}d ago, not paying`, action: "Record the outcome: why they didn't buy", instituteId: a.id });
      else if (stage === "NOT_LOGGED_IN" && sinceSent >= 2)
        add({ key: `trial-nologin:${a.id}:${sent?.slice(0, 10)}`, kind: "TRIAL", group: "TRIALS", severity: "high", when: sinceSent >= 4 ? "OVERDUE" : "TODAY", title: a.name, detail: `Credentials sent ${sinceSent}d ago, nobody has logged in`, action: "Check they got the login details and can sign in", instituteId: a.id });
      else if (stage === "SETTING_UP" && sinceSent >= 3)
        add({ key: `trial-setup:${a.id}:${today.slice(0, 7)}`, kind: "TRIAL", group: "TRIALS", severity: "medium", when: "THIS_WEEK", title: a.name, detail: `Logged in but no course after ${sinceSent}d${t.daysLeft !== null ? ` · ${t.daysLeft}d left` : ""}`, action: "Get an update: what's blocking setup?", instituteId: a.id });
      else if (sinceUpdate === null ? sinceSent >= 5 : sinceUpdate >= 7)
        add({ key: `trial-update:${a.id}:${lastUpdate ?? "none"}`, kind: "FOLLOW_UP", group: "TRIALS", severity: "low", when: "THIS_WEEK", title: a.name, detail: `${stage ? TRIAL_STAGE_LABEL[stage] : "On trial"} · ${updateNote}`, action: "Check in and record an update", instituteId: a.id });
    }

    // Follow-up date you set yourself.
    const nextLeft = daysBetween(today, r?.nextFollowUp);
    if (r && !skip && nextLeft !== null && nextLeft <= 0)
      add({ key: `followup:${a.id}:${r.nextFollowUp}`, kind: "FOLLOW_UP", group: t && !a.paid ? "TRIALS" : "RETAIN", severity: nextLeft < 0 ? "high" : "medium", when: whenOf(nextLeft), title: a.name, detail: `Follow-up you planned ${nextLeft === 0 ? "for today" : `${-nextLeft}d ago`}${r.followUps[0]?.note ? ` · "${r.followUps[0].note.slice(0, 60)}"` : ""}`, action: "Check in and record an update", instituteId: a.id });

    if (!r || skip) continue;
    const monthly = recordMonthlyValue(r) ?? r.finalPrice ?? 0;

    // Keep customers: renewals and payments.
    const due = r.renewalDate || r.endDate;
    const left = daysBetween(today, due);
    if (left !== null && left <= 30 && left >= -15)
      add({
        key: `renewal:${a.id}:${due}`,
        kind: "RENEWAL",
        group: "RETAIN",
        severity: left <= 7 ? "high" : "medium",
        when: whenOf(left),
        title: a.name,
        detail: `Renewal ${inDays(left)}${r.planName ? ` · ${r.planName}` : ""}${monthly ? ` · ${rupees(monthly)}/mo` : ""}`,
        action: left < 0 ? "Chase the renewal today" : left <= 7 ? "Confirm the renewal and send the invoice" : "Send the renewal reminder",
        impact: monthly,
        instituteId: a.id,
      });
    const payLeft = daysBetween(today, r.nextPaymentDue);
    if (payLeft !== null && payLeft <= 7)
      add({ key: `payment:${a.id}:${r.nextPaymentDue}`, kind: "PAYMENT", group: "RETAIN", severity: payLeft < 0 ? "high" : "medium", when: whenOf(payLeft), title: a.name, detail: `Payment due ${inDays(payLeft)}${r.finalPrice != null ? ` · ${rupees(r.finalPrice)}` : ""}`, action: payLeft < 0 ? "Follow up on the overdue payment" : "Send a payment reminder", impact: r.finalPrice ?? 0, instituteId: a.id });
    const overdue = r.payments.filter((p) => p.status === "OVERDUE");
    if (overdue.length)
      add({ key: `overdue:${a.id}:${overdue.map((p) => p.date).join(",")}`, kind: "PAYMENT", group: "RETAIN", severity: "high", when: "OVERDUE", title: a.name, detail: `${overdue.length} payment${overdue.length === 1 ? "" : "s"} marked overdue in the register`, action: "Call about the overdue payment", impact: overdue.reduce((s, p) => s + (p.amount ?? 0), 0), instituteId: a.id });
    if (r.classification === "PRODUCTION" && a.healthLabel === "At risk")
      add({ key: `risk:${a.id}:${today.slice(0, 7)}`, kind: "RELATIONSHIP", group: "RETAIN", severity: "medium", when: "THIS_WEEK", title: a.name, detail: `Health ${a.health}/100${a.activeNow === 0 ? " · nobody signed in now" : ""}`, action: "Check in: ask how it's going and fix blockers", impact: monthly, instituteId: a.id });
  }

  // Relationships: anniversaries, birthdays, custom dates this week.
  for (const k of upcomingKeyDates(accounts, today, 7)) {
    if (k.type !== "ANNIVERSARY" && k.type !== "BIRTHDAY" && k.type !== "CUSTOM") continue;
    add({
      key: `date:${k.type}:${k.instituteId}:${k.date}:${k.detail}`,
      kind: "RELATIONSHIP",
      group: "RELATIONSHIP",
      severity: "low",
      when: whenOf(k.daysAway),
      title: k.name,
      detail: `${EVENT_LABEL[k.type]} ${inDays(k.daysAway)} · ${k.detail}`,
      action: k.type === "ANNIVERSARY" ? "Send an anniversary thank-you" : k.type === "BIRTHDAY" ? "Send birthday wishes" : "Prepare for this date",
      instituteId: k.instituteId,
    });
  }

  // Housekeeping.
  const unreviewedPaying = accounts.filter((a) => a.pmClass === null && (a.platformTag === "PROD" || a.paid)).length;
  if (unreviewedPaying)
    add({ key: `review:prod:${unreviewedPaying}`, kind: "REVIEW", group: "HOUSEKEEPING", severity: "low", when: "THIS_WEEK", title: `${unreviewedPaying} paying institute${unreviewedPaying === 1 ? "" : "s"} not marked yet`, detail: "PROD tag or paid subscription on the platform", action: "Review them and mark the real clients Production", filter: "unreviewed" });
  const mismatched = accounts.filter((a) => a.mismatches.length).length;
  if (mismatched)
    add({ key: `review:mismatch:${mismatched}`, kind: "REVIEW", group: "HOUSEKEEPING", severity: "low", when: "THIS_WEEK", title: `${mismatched} account${mismatched === 1 ? "" : "s"} where PM and platform disagree`, detail: "Nothing is synced automatically", action: "Check each one and fix it where it's wrong", filter: "mismatch" });
  for (const p of signals.gaZeroProducts ?? [])
    add({ key: `data:ga-zero:${p}:${today}`, kind: "DATA", group: "HOUSEKEEPING", severity: "info", when: "THIS_WEEK", title: `No website traffic recorded for ${p}`, detail: "Google Analytics tracking may be missing on this site", action: "Check the GA tag on the site" });
  if (signals.platformActivityZero)
    add({ key: `data:activity-zero:${today}`, kind: "DATA", group: "HOUSEKEEPING", severity: "info", when: "THIS_WEEK", title: "Platform login activity shows 0", detail: "Sign-ins aren't being reported, so active-institute numbers can't be trusted yet", action: "Ask the backend team to check activity tracking" });

  return rankTasks(tasks);
}

/** Drops tasks marked done, and snoozed ones until their time. */
export function openTasks(tasks: InboxTask[], states: PmTaskState[], now: Date): InboxTask[] {
  const by = new Map(states.map((s) => [s.key, s]));
  return tasks.filter((t) => {
    const s = by.get(t.key);
    if (!s) return true;
    if (s.state === "DONE") return false;
    return new Date(s.until).getTime() <= now.getTime();
  });
}

// ---------------------------------------------------------------- where to focus (insights)

export type InsightTone = "bad" | "warn" | "good" | "info";

export interface Insight {
  key: string;
  tone: InsightTone;
  /** What the numbers say. */
  headline: string;
  /** What to do about it. */
  focus: string;
}

export interface InsightInput {
  days: number;
  gaConfigured: boolean;
  visitors: number;
  leads: number;
  newInstitutes: number;
  activated: number;
  trialsStarted: number;
  paidStarted: number;
  trialsEndingThisWeek: number;
  trialsStuck: number;
  topLeadSource: { name: string; leads: number } | null;
  /** Products whose visitors this week fell or rose sharply vs the week before. */
  trafficChanges: { product: string; changePct: number }[];
  renewals30: number;
  renewalValue30: number;
  unreviewedPaying: number;
}

const TONE_RANK: Record<InsightTone, number> = { bad: 0, warn: 1, good: 2, info: 3 };
const pctText = (a: number, b: number) => `${b > 0 ? Math.round((a / b) * 1000) / 10 : 0}%`;

/** Plain-language reading of the numbers, each with what to focus on. Worst first. */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  if (i.trialsStarted >= 3) {
    const rate = i.paidStarted / i.trialsStarted;
    if (rate < 0.15)
      out.push({ key: "trial-conversion", tone: "bad", headline: `Only ${pctText(i.paidStarted, i.trialsStarted)} of trials became paid (${i.paidStarted} of ${i.trialsStarted}, last ${i.days} days).`, focus: i.trialsEndingThisWeek ? `${i.trialsEndingThisWeek} trial${i.trialsEndingThisWeek === 1 ? " ends" : "s end"} this week: get an update and a decision from each.` : "Check in with every active trial and record where they are." });
    else out.push({ key: "trial-conversion", tone: "good", headline: `${pctText(i.paidStarted, i.trialsStarted)} of trials became paid (${i.paidStarted} of ${i.trialsStarted}).`, focus: "Keep doing what works; note what these customers had in common." });
  }
  if (i.newInstitutes >= 3 && i.activated / i.newInstitutes < 0.4)
    out.push({ key: "activation", tone: "warn", headline: `Only ${pctText(i.activated, i.newInstitutes)} of new institutes created a course (${i.activated} of ${i.newInstitutes}).`, focus: i.trialsStuck ? `${i.trialsStuck} trial${i.trialsStuck === 1 ? " hasn't" : "s haven't"} logged in or set up a course: find out what's blocking them.` : "Check new institutes in their first days and help them get a course live." });
  if (i.gaConfigured && i.visitors >= 300 && i.leads / i.visitors < 0.01)
    out.push({ key: "lead-rate", tone: "warn", headline: `${i.visitors.toLocaleString("en-IN")} visitors but only ${i.leads} leads (${pctText(i.leads, i.visitors)}).`, focus: "Check the demo / sign-up buttons on each site and that lead events are tracked." });
  for (const c of i.trafficChanges) {
    if (c.changePct <= -30) out.push({ key: `traffic-down:${c.product}`, tone: "warn", headline: `${c.product} website traffic is down ${-c.changePct}% this week.`, focus: "Check what changed: campaigns paused, site issues or tracking." });
    else if (c.changePct >= 50) out.push({ key: `traffic-up:${c.product}`, tone: "good", headline: `${c.product} website traffic is up ${c.changePct}% this week.`, focus: "Find out what drove it and do more of it." });
  }
  if (i.topLeadSource && i.topLeadSource.leads > 0)
    out.push({ key: "top-source", tone: "info", headline: `${i.topLeadSource.name} brings the most leads (${i.topLeadSource.leads}).`, focus: "Put more effort into this channel." });
  if (i.renewals30 > 0)
    out.push({ key: "renewals", tone: "info", headline: `${i.renewals30} renewal${i.renewals30 === 1 ? "" : "s"} in the next 30 days${i.renewalValue30 ? `, ₹${Math.round(i.renewalValue30).toLocaleString("en-IN")}/mo at stake` : ""}.`, focus: "Confirm each renewal at least 2 weeks before it's due." });
  if (i.unreviewedPaying > 0)
    out.push({ key: "unreviewed", tone: "info", headline: `${i.unreviewedPaying} paying institute${i.unreviewedPaying === 1 ? " isn't" : "s aren't"} marked in the register.`, focus: "Mark them Production and add contract dates so renewals show up here." });
  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

/** Visitors this week vs the week before, per product, from GA daily rows (needs ≥14 days). */
export function weeklyTrafficChange(products: { product: string; daily: { date: string; activeUsers: number }[] }[], label: (p: string) => string): { product: string; changePct: number }[] {
  const out: { product: string; changePct: number }[] = [];
  for (const p of products) {
    if (p.daily.length < 14) continue;
    const last = p.daily.slice(-7).reduce((t, d) => t + d.activeUsers, 0);
    const prev = p.daily.slice(-14, -7).reduce((t, d) => t + d.activeUsers, 0);
    if (prev < 20) continue;
    out.push({ product: label(p.product), changePct: Math.round(((last - prev) / prev) * 100) });
  }
  return out;
}

// ---------------------------------------------------------------- dashboard

/** Test / internal accounts: left out of every dashboard number. */
export const isTestAccount = (a: Pick<AccountRow, "platformTag" | "pmClass">) => a.platformTag === "TEST" || a.pmClass === "TEST" || a.pmClass === "INTERNAL";

/** Trial list filters the dashboard links to (the Trials tab understands all of these). */
export type TrialFilter = TrialStage | "ALL" | "ENDING" | "DUE";

export interface DashboardStats {
  institutes: number;
  newThisWeek: number;
  newLastWeek: number;
  onTrial: number;
  trialsEndingIn7: number;
  paying: number;
  courses: number;
  institutesWithCourses: number;
  students: number;
  onlineInstitutes: number;
  onlinePeople: number;
  aiCreditsUsed: number;
  /** "Needs attention" counts; each maps to a list the PM can open. */
  attention: {
    notLoggedIn: number;
    noCourse: number;
    endingIn3: number;
    endedNotPaying: number;
    followUpsDue: number;
    lowCredits: number;
    renewals30: number;
  };
  /** Trial accounts per stage (live or ended in the last 2 weeks). */
  trialStages: Record<TrialStage, number>;
  /** Last 12 weeks, oldest first: new institutes and trials started per week (Monday start). */
  weekly: { week: string; institutes: number; trials: number }[];
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function dashboardStats(accounts: AccountRow[], today: string): DashboardStats {
  const real = accounts.filter((a) => !isTestAccount(a));
  const since = (a: AccountRow) => (a.createdAt ? -(daysBetween(today, a.createdAt) ?? 999) : 999);
  const liveTrial = (a: AccountRow) => !!a.trial && !a.paid && (a.trial.daysLeft === null || a.trial.daysLeft >= 0);
  const trials = real.filter((a) => a.trialStage && (a.trial!.daysLeft === null || a.trial!.daysLeft >= -14));
  const stages = { NOT_LOGGED_IN: 0, SETTING_UP: 0, BUILDING: 0, ACTIVE: 0, EXPIRED: 0, CONVERTED: 0 } as Record<TrialStage, number>;
  for (const a of trials) stages[a.trialStage!]++;

  const thisWeek = weekStart(today);
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const weekly = weeks.map((week) => ({ week, institutes: 0, trials: 0 }));
  const idx = new Map(weeks.map((w, i) => [w, i]));
  for (const a of real) {
    if (a.createdAt) {
      const i = idx.get(weekStart(a.createdAt));
      if (i !== undefined) weekly[i].institutes++;
    }
    const t = a.trial?.startedAt ?? (a.trial ? a.createdAt : null);
    if (t) {
      const i = idx.get(weekStart(t));
      if (i !== undefined) weekly[i].trials++;
    }
  }

  return {
    institutes: real.length,
    newThisWeek: real.filter((a) => since(a) >= 0 && since(a) <= 6).length,
    newLastWeek: real.filter((a) => since(a) >= 7 && since(a) <= 13).length,
    onTrial: real.filter(liveTrial).length,
    trialsEndingIn7: real.filter((a) => liveTrial(a) && a.trial!.daysLeft !== null && a.trial!.daysLeft <= 7).length,
    paying: real.filter((a) => a.paid || a.platformTag === "PROD").length,
    courses: real.reduce((t, a) => t + a.courses, 0),
    institutesWithCourses: real.filter((a) => a.courses > 0).length,
    students: real.reduce((t, a) => t + a.students, 0),
    onlineInstitutes: real.filter((a) => a.activeNow > 0).length,
    onlinePeople: real.reduce((t, a) => t + a.activeNow, 0),
    aiCreditsUsed: real.reduce((t, a) => t + (a.credits?.used ?? 0), 0),
    attention: {
      notLoggedIn: stages.NOT_LOGGED_IN,
      noCourse: stages.SETTING_UP,
      endingIn3: real.filter((a) => liveTrial(a) && a.trial!.daysLeft !== null && a.trial!.daysLeft <= 3).length,
      endedNotPaying: stages.EXPIRED,
      followUpsDue: real.filter((a) => a.record?.nextFollowUp && (daysBetween(today, a.record.nextFollowUp) ?? 1) <= 0).length,
      lowCredits: real.filter((a) => a.credits?.low && (a.paid || a.platformTag === "PROD" || liveTrial(a))).length,
      renewals30: real.filter((a) => a.daysToRenewal !== null && a.daysToRenewal >= 0 && a.daysToRenewal <= 30).length,
    },
    trialStages: stages,
    weekly,
  };
}

// ---------------------------------------------------------------- conversions (demo request → trial → paid)

export const CONVERSION_STEPS = ["REQUESTED", "TRIAL", "USING", "PAID"] as const;
export type ConversionStep = (typeof CONVERSION_STEPS)[number];
export const CONVERSION_STEP_LABEL: Record<ConversionStep, string> = {
  REQUESTED: "Requested, no trial yet",
  TRIAL: "On trial, not using yet",
  USING: "Using the trial",
  PAID: "Paying",
};

/** Saved quote fields used here (SavedQuote from pricing-api). */
export interface ConversionQuote {
  id: string;
  source?: string;
  status?: string;
  organizationName?: string;
  contactName?: string;
  contactEmail?: string;
  createdAt?: string;
  provisionedInstituteId?: string;
  selections?: string;
}

const QUOTE_SOURCE_LABEL: Record<string, string> = {
  STANDALONE: "Website pricing page",
  ONBOARDING: "Onboarding form",
  INTERNAL: "Added by team",
};

export interface ConversionRow {
  key: string;
  instituteId: string | null;
  name: string;
  contact: string;
  /** When they asked for a demo (quote date), else when the trial account was created. */
  requestedAt: string;
  /** Where the request came from: quote source, else the register's lead source. */
  source: string;
  products: string[];
  step: ConversionStep;
  /** The trial ended without paying. */
  lost: boolean;
  trialStage: TrialStage | null;
  paidSince: string | null;
  daysToPaid: number | null;
  lastUpdate: string | null;
}

/**
 * One row per demo request or trial: quotes (website pricing page, onboarding form, team) joined to
 * the workspace created from them, plus trial accounts that had no quote. Newest first.
 */
export function buildConversions(accounts: AccountRow[], quotes: ConversionQuote[]): ConversionRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows: ConversionRow[] = [];
  const seen = new Set<string>();
  const stepOf = (a: AccountRow | null): ConversionStep =>
    !a ? "REQUESTED" : a.paid ? "PAID" : a.trialStage === "ACTIVE" || a.trialStage === "BUILDING" || a.trialStage === "SETTING_UP" ? "USING" : a.trial ? "TRIAL" : a.courses > 0 ? "USING" : "TRIAL";
  const row = (key: string, a: AccountRow | null, requestedAt: string, source: string, name: string, contact: string, quoteProducts: string[]): ConversionRow => {
    const step = stepOf(a);
    const paidSince = a?.paidSince ?? null;
    const daysToPaid = step === "PAID" && paidSince ? Math.max(0, daysBetween(requestedAt.slice(0, 10), paidSince) ?? 0) : null;
    return {
      key,
      instituteId: a?.id ?? null,
      name,
      contact,
      requestedAt,
      source,
      products: a?.products.length ? a.products : quoteProducts,
      step,
      lost: step !== "PAID" && (a?.trialStage === "EXPIRED" || a?.pmClass === "LOST"),
      trialStage: a?.trialStage ?? null,
      paidSince,
      daysToPaid,
      lastUpdate: a?.record?.followUps[0] ? `${FOLLOW_UP_TEXT[a.record.followUps[0].outcome]}${a.record.followUps[0].note ? `: ${a.record.followUps[0].note}` : ""}` : null,
    };
  };

  for (const q of quotes) {
    if (!q.createdAt) continue;
    const a = q.provisionedInstituteId ? byId.get(q.provisionedInstituteId) ?? null : null;
    if (a?.pmClass === "TEST" || a?.pmClass === "INTERNAL" || a?.platformTag === "TEST") continue;
    if (a) seen.add(a.id);
    const source = QUOTE_SOURCE_LABEL[q.source ?? ""] ?? (q.source ? q.source.toLowerCase() : "Unknown");
    rows.push(row(`quote:${q.id}`, a, q.createdAt, source, a?.name || q.organizationName || q.contactName || "Unnamed request", q.contactEmail || q.contactName || a?.email || "", productsFromSelections(q.selections)));
  }
  for (const a of accounts) {
    if (!a.trial || seen.has(a.id) || a.pmClass === "TEST" || a.pmClass === "INTERNAL" || a.platformTag === "TEST") continue;
    rows.push(row(`trial:${a.id}`, a, a.trial.startedAt ?? a.createdAt, a.record?.source || "Not recorded", a.name, a.trial.contact || a.email, []));
  }
  return rows.sort((x, y) => y.requestedAt.localeCompare(x.requestedAt));
}

const FOLLOW_UP_TEXT: Record<string, string> = {
  POSITIVE: "Going well",
  NEEDS_HELP: "Needs help",
  EVALUATING: "Still evaluating",
  NO_RESPONSE: "No response",
  NOT_INTERESTED: "Not interested",
  CONVERTED: "Wants to buy",
};

export interface ConversionSummary {
  name: string;
  requests: number;
  trials: number;
  using: number;
  paid: number;
  lost: number;
  /** Requests that became paying, in %. */
  rate: number | null;
  medianDaysToPaid: number | null;
}

/** Counts per group (source, product, or everything). A request "reached" a step if it is at it or past it. */
export function summarizeConversions(rows: ConversionRow[], groupBy: (r: ConversionRow) => string[]): ConversionSummary[] {
  const m = new Map<string, ConversionRow[]>();
  for (const r of rows) for (const g of groupBy(r)) m.set(g, [...(m.get(g) ?? []), r]);
  const reached = (r: ConversionRow, s: ConversionStep) => CONVERSION_STEPS.indexOf(r.step) >= CONVERSION_STEPS.indexOf(s);
  return [...m.entries()]
    .map(([name, list]) => {
      const days = list.map((r) => r.daysToPaid).filter((d): d is number => d !== null).sort((a, b) => a - b);
      const paid = list.filter((r) => r.step === "PAID").length;
      return {
        name,
        requests: list.length,
        trials: list.filter((r) => reached(r, "TRIAL")).length,
        using: list.filter((r) => reached(r, "USING")).length,
        paid,
        lost: list.filter((r) => r.lost).length,
        rate: list.length ? Math.round((paid / list.length) * 1000) / 10 : null,
        medianDaysToPaid: days.length ? days[Math.floor((days.length - 1) / 2)] : null,
      };
    })
    .sort((a, b) => b.paid - a.paid || b.requests - a.requests || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- CSV

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Leading = + - @ would run as a formula in Excel; prefix with a quote.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Register columns, in template order. `match` columns identify the institute and are not stored. */
export const REGISTER_COLUMNS = [
  { key: "institute_id", label: "Institute ID", match: true },
  { key: "institute_name", label: "Institute name", match: true },
  { key: "subdomain", label: "Subdomain", match: true },
  { key: "email", label: "Institute email", match: true },
  { key: "classification", label: `Classification (${PM_CLASSES.join("/")})` },
  { key: "owner", label: "Owner" },
  { key: "products", label: "Products (separate with ;)" },
  { key: "plan_name", label: "Plan name" },
  { key: "subscription_type", label: `Subscription type (${SUBSCRIPTION_TYPES.join("/")})` },
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date" },
  { key: "renewal_date", label: "Renewal date" },
  { key: "auto_renew", label: "Auto renew (yes/no)" },
  { key: "notice_days", label: "Notice period (days)" },
  { key: "list_price", label: "List price" },
  { key: "discount", label: "Discount" },
  { key: "final_price", label: "Final price (per period)" },
  { key: "currency", label: "Currency" },
  { key: "gst_percent", label: "GST %" },
  { key: "payment_mode", label: `Payment mode (${PAYMENT_MODES.join("/")})` },
  { key: "seats", label: "Seats / students" },
  { key: "ai_credits", label: "AI credits included" },
  { key: "next_payment_due", label: "Next payment due" },
  { key: "signed_on", label: "Signed on" },
  { key: "go_live_date", label: "Go-live date" },
  { key: "first_payment_date", label: "First payment date" },
  { key: "anniversary_date", label: "Anniversary date" },
  { key: "source", label: "Lead source" },
  { key: "referred_by", label: "Referred by" },
  { key: "contact_name", label: "Contact name" },
  { key: "contact_role", label: "Contact role" },
  { key: "contact_email", label: "Contact email" },
  { key: "contact_phone", label: "Contact phone" },
  { key: "contact_birthday", label: "Contact birthday" },
  { key: "notes", label: "Notes" },
] as const;
type ColumnKey = (typeof REGISTER_COLUMNS)[number]["key"];

const FIELD_OF: Partial<Record<ColumnKey, keyof PmRecord>> = {
  classification: "classification",
  owner: "owner",
  plan_name: "planName",
  subscription_type: "subscriptionType",
  start_date: "startDate",
  end_date: "endDate",
  renewal_date: "renewalDate",
  auto_renew: "autoRenew",
  notice_days: "noticeDays",
  list_price: "listPrice",
  discount: "discount",
  final_price: "finalPrice",
  currency: "currency",
  gst_percent: "gstPercent",
  payment_mode: "paymentMode",
  seats: "seats",
  ai_credits: "aiCredits",
  next_payment_due: "nextPaymentDue",
  signed_on: "signedOn",
  go_live_date: "goLiveDate",
  first_payment_date: "firstPaymentDate",
  anniversary_date: "anniversaryDate",
  source: "source",
  referred_by: "referredBy",
  notes: "notes",
};
const DATE_COLS = new Set<ColumnKey>(["start_date", "end_date", "renewal_date", "next_payment_due", "signed_on", "go_live_date", "first_payment_date", "anniversary_date", "contact_birthday"]);
const NUMBER_COLS = new Set<ColumnKey>(["notice_days", "list_price", "discount", "final_price", "gst_percent", "seats", "ai_credits"]);

/** Blank register template: header row plus one example row. */
export function registerTemplateCsv(): string {
  const example: Record<string, string> = {
    institute_id: "",
    institute_name: "Example Academy",
    subdomain: "example",
    classification: "PRODUCTION",
    plan_name: "Growth",
    subscription_type: "ANNUAL",
    start_date: "2026-04-01",
    end_date: "2027-03-31",
    renewal_date: "2027-04-01",
    auto_renew: "no",
    final_price: "60000",
    currency: "INR",
    gst_percent: "18",
    payment_mode: "BANK_TRANSFER",
    go_live_date: "2026-04-10",
    contact_name: "Priya Sharma",
    contact_role: "Director",
    contact_email: "priya@example.com",
  };
  return toCsv(REGISTER_COLUMNS.map((c) => c.label), [REGISTER_COLUMNS.map((c) => example[c.key] ?? "")]);
}

function cellValue(r: PmRecord | null, a: AccountRow | null, key: ColumnKey): string | number | boolean | null {
  switch (key) {
    case "institute_id":
      return a?.id ?? r?.instituteId ?? "";
    case "institute_name":
      return a?.name ?? r?.name ?? "";
    case "subdomain":
      return a?.subdomain ?? "";
    case "email":
      return a?.email ?? "";
    case "products":
      return r?.products.join(";") ?? "";
    case "contact_name":
    case "contact_role":
    case "contact_email":
    case "contact_phone":
    case "contact_birthday": {
      const c = r?.contacts[0];
      const field = key.replace("contact_", "") as keyof PmContact;
      return c ? c[field] : "";
    }
    case "auto_renew":
      return r ? (r.autoRenew ? "yes" : "no") : "";
    default: {
      const f = FIELD_OF[key];
      const v = f && r ? r[f] : "";
      return v === null || v === undefined ? "" : (v as string | number | boolean);
    }
  }
}

/** Register export: same columns as the template, so an export can be edited and re-imported. */
export function registerCsv(accounts: AccountRow[]): string {
  return toCsv(
    REGISTER_COLUMNS.map((c) => c.label),
    accounts.map((a) => REGISTER_COLUMNS.map((c) => cellValue(a.record, a, c.key)))
  );
}

/** Accounts export: platform columns (read-only) side by side with PM columns. */
export function accountsCsv(accounts: AccountRow[]): string {
  const headers = [
    "Institute ID", "Institute", "Email", "Subdomain", "City", "State", "Created", "Students", "Courses",
    "Platform tag", "Platform plan", "Platform subscription status", "Platform MRR (₹)", "Paying (platform)", "Trial ends", "People online now",
    "PM classification", "Owner", "Register plan", "Subscription type", "Start", "End", "Renewal", "Final price (₹)", "Monthly value (₹)",
    "Health", "Health label", "PM ≠ platform",
  ];
  return toCsv(
    headers,
    accounts.map((a) => [
      a.id, a.name, a.email, a.subdomain, a.city, a.state, a.createdAt.slice(0, 10), a.students, a.courses,
      a.platformTag ?? "", a.platformPlan ?? "", a.subscription?.status ?? "", Math.round(a.platformMrrMinor / 100), a.paid ? "yes" : "no", a.trial?.endsAt?.slice(0, 10) ?? "", a.activeNow,
      a.pmClass ? PM_CLASS_LABEL[a.pmClass] : "", a.record?.owner ?? "", a.record?.planName ?? "", a.record?.subscriptionType ?? "", a.record?.startDate ?? "", a.record?.endDate ?? "", a.record?.renewalDate ?? "",
      a.record?.finalPrice ?? "", a.registerMonthly ?? "", a.health, a.healthLabel, a.mismatches.join("; "),
    ])
  );
}

// ---------------------------------------------------------------- CSV import (preview, then save)

export interface ImportRow {
  rowNo: number;
  status: "new" | "update" | "unchanged" | "unmatched" | "error";
  instituteId: string | null;
  name: string;
  matchedBy: "id" | "subdomain" | "email" | "name" | null;
  errors: string[];
  /** Only the non-empty cells: an empty cell keeps what's already stored. */
  patch: Record<string, unknown>;
  changedFields: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Header text → column key; accepts the template labels or the raw keys. */
function headerKey(h: string): ColumnKey | null {
  const n = norm(h);
  const hit = REGISTER_COLUMNS.find((c) => norm(c.label) === n || c.key === n.replace(/[\s-]+/g, "_") || norm(c.label.replace(/\s*\(.*\)$/, "")) === n);
  return hit ? hit.key : null;
}

export function planImport(text: string, institutes: Pick<InstituteListItemDTO, "id" | "name" | "subdomain" | "email">[], records: Map<string, PmRecord>): { rows: ImportRow[]; unknownColumns: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], unknownColumns: [] };
  const [header, ...body] = table;
  const keys = header.map(headerKey);
  const unknownColumns = header.filter((_, i) => keys[i] === null).map((h) => h.trim()).filter(Boolean);

  const byId = new Map(institutes.map((i) => [i.id, i]));
  const index = (field: "subdomain" | "email" | "name") => {
    const m = new Map<string, string[]>();
    for (const i of institutes) {
      const v = norm(i[field] ?? "");
      if (v) m.set(v, [...(m.get(v) ?? []), i.id]);
    }
    return m;
  };
  const bySub = index("subdomain");
  const byEmail = index("email");
  const byName = index("name");
  const seen = new Set<string>();

  const rows = body.map((cells, idx): ImportRow => {
    const get = (k: ColumnKey) => {
      const i = keys.indexOf(k);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const errors: string[] = [];
    let instituteId: string | null = null;
    let matchedBy: ImportRow["matchedBy"] = null;
    const tryMatch = (m: Map<string, string[]>, v: string, how: NonNullable<ImportRow["matchedBy"]>) => {
      if (instituteId || !v) return;
      const ids = m.get(norm(v)) ?? [];
      if (ids.length === 1) {
        instituteId = ids[0];
        matchedBy = how;
      } else if (ids.length > 1) errors.push(`${ids.length} institutes share this ${how}; add the institute ID`);
    };
    const id = get("institute_id");
    if (id && byId.has(id)) {
      instituteId = id;
      matchedBy = "id";
    } else if (id && records.has(id)) {
      instituteId = id;
      matchedBy = "id";
    } else if (id) errors.push("Institute ID not found");
    tryMatch(bySub, get("subdomain"), "subdomain");
    tryMatch(byEmail, get("email"), "email");
    tryMatch(byName, get("institute_name"), "name");
    const name = (instituteId && byId.get(instituteId)?.name) || get("institute_name") || id || `Row ${idx + 2}`;

    const patch: Record<string, unknown> = {};
    for (const col of REGISTER_COLUMNS) {
      if ("match" in col) continue;
      const v = get(col.key);
      if (!v) continue;
      if (DATE_COLS.has(col.key) && !normalizeDate(v)) {
        errors.push(`${col.label}: "${v}" isn't a date (use YYYY-MM-DD or DD/MM/YYYY)`);
        continue;
      }
      if (NUMBER_COLS.has(col.key) && !Number.isFinite(Number(v.replace(/[₹,\s]/g, "")))) {
        errors.push(`${col.label}: "${v}" isn't a number`);
        continue;
      }
      if (col.key === "classification" && !parseClass(v)) {
        errors.push(`Classification "${v}" isn't one of ${PM_CLASSES.join(", ")}`);
        continue;
      }
      if (col.key === "subscription_type" && !(SUBSCRIPTION_TYPES as readonly string[]).includes(v.toUpperCase().replace(/[\s-]+/g, "_"))) {
        errors.push(`Subscription type "${v}" isn't one of ${SUBSCRIPTION_TYPES.join(", ")}`);
        continue;
      }
      if (col.key === "payment_mode" && !(PAYMENT_MODES as readonly string[]).includes(v.toUpperCase().replace(/[\s-]+/g, "_"))) {
        errors.push(`Payment mode "${v}" isn't one of ${PAYMENT_MODES.join(", ")}`);
        continue;
      }
      const field = FIELD_OF[col.key];
      if (field) patch[field] = v;
    }
    const products = get("products");
    if (products) patch.products = products.split(/[;|]/).map((p) => p.trim()).filter(Boolean);
    const contact = { name: get("contact_name"), role: get("contact_role"), email: get("contact_email"), phone: get("contact_phone"), birthday: get("contact_birthday") };
    if (contact.name || contact.email || contact.phone) {
      const existing = (instituteId && records.get(instituteId)?.contacts) || [];
      patch.contacts = [contact, ...existing.filter((c) => !(contact.email && norm(c.email) === norm(contact.email)) && !(contact.role && norm(c.role) === norm(contact.role)))];
    }

    if (instituteId) {
      if (seen.has(instituteId)) errors.push("This institute appears earlier in the file");
      seen.add(instituteId);
      patch.instituteId = instituteId;
      patch.name = name;
    }
    const existing = instituteId ? records.get(instituteId) ?? null : null;
    const changedFields = Object.keys(patch).filter((k) => k !== "instituteId" && k !== "name" && JSON.stringify(normalizeForCompare(k, patch[k])) !== JSON.stringify(existing ? (existing as unknown as Record<string, unknown>)[k] : undefined));
    const status: ImportRow["status"] = errors.length ? "error" : !instituteId ? "unmatched" : !existing ? "new" : changedFields.length ? "update" : "unchanged";
    return { rowNo: idx + 2, status, instituteId, name, matchedBy, errors, patch, changedFields };
  });
  return { rows, unknownColumns };
}

/** Brings an imported cell to the stored shape so unchanged values don't show as changes. */
function normalizeForCompare(field: string, v: unknown): unknown {
  if (typeof v !== "string") return v;
  if (/Date$|^signedOn$|^nextPaymentDue$/.test(field)) return normalizeDate(v);
  if (["noticeDays", "listPrice", "discount", "finalPrice", "gstPercent", "seats", "aiCredits"].includes(field)) return Number(v.replace(/[₹,\s]/g, ""));
  if (field === "autoRenew") return ["yes", "true", "1"].includes(v.toLowerCase());
  if (field === "classification") return parseClass(v);
  if (["subscriptionType", "paymentMode"].includes(field)) return v.toUpperCase().replace(/[\s-]+/g, "_");
  if (field === "currency") return v.toUpperCase();
  return v;
}
