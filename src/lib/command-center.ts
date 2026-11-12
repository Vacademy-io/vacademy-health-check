// Command Center (Phase 1): revenue and accounts derived from data the portal already loads.
// Spec: docs/command-center/Unified_Product_Command_Center_Plan_v2.html, sections 4 and 7.
// Pure functions only, so tests/command-center.test.ts can run them under node --test.
import type { LeadTag, InstituteListItemDTO } from "../types/api";
import type { Subscription } from "../types/plans";

const DAY_MS = 86_400_000;

/** Statuses that keep a subscription in MRR. TRIAL is not revenue yet; GRACE is paid-up but at risk. */
const MRR_STATUSES = new Set(["ACTIVE", "GRACE"]);
const ENDED_STATUSES = new Set(["EXPIRED", "CANCELLED"]);
/** Period payment states that mean nothing was (or will be) collected for it. */
const NOT_REVENUE_PAYMENTS = new Set(["WAIVED", "COMPLIMENTARY", "REFUNDED"]);

/** Price for one billing period, in paise: override, else the period snapshot, else the version list price. */
export function periodPriceMinor(s: Pick<Subscription, "price_override_minor" | "current_period" | "version_price_minor">): number {
  const p = s.price_override_minor ?? s.current_period?.price_minor_snapshot ?? s.version_price_minor ?? 0;
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/** Monthly value in paise: annual plans / 12, quarterly / 3. */
export function monthlyValueMinor(s: Pick<Subscription, "price_override_minor" | "current_period" | "version_price_minor" | "period_months">): number {
  const months = s.period_months > 0 ? s.period_months : 1;
  return Math.round(periodPriceMinor(s) / months);
}

export type RevenueBucket = "MRR" | "DUE" | "TRIAL" | "NON_REVENUE" | "ENDED" | "OTHER";

/**
 * Where a subscription lands on the Revenue screen.
 * MRR: ACTIVE/GRACE with the current period PAID (marked-paid offline payments included).
 * DUE: ACTIVE/GRACE/PENDING with a price but the period not paid yet.
 * NON_REVENUE: complimentary source, zero price, or a waived/complimentary/refunded period.
 */
export function revenueBucket(s: Subscription): RevenueBucket {
  if (ENDED_STATUSES.has(s.status)) return "ENDED";
  if (s.status === "TRIAL") return "TRIAL";
  const payment = s.current_period?.payment_status ?? null;
  if (s.source === "COMPLIMENTARY" || periodPriceMinor(s) === 0 || (payment !== null && NOT_REVENUE_PAYMENTS.has(payment))) {
    return MRR_STATUSES.has(s.status) || s.status === "PENDING" ? "NON_REVENUE" : "OTHER";
  }
  if (MRR_STATUSES.has(s.status)) return payment === "PAID" ? "MRR" : "DUE";
  if (s.status === "PENDING") return "DUE";
  return "OTHER";
}

function within(iso: string | null | undefined, from: number, to: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from && t <= to;
}

export interface PlanMixRow {
  plan: string;
  subscriptions: number;
  mrrMinor: number;
}

export interface RevenueSummary {
  mrrMinor: number;
  payingInstitutes: number;
  /** GRACE subscriptions inside MRR: paid period over, renewal not collected yet. */
  atRiskMinor: number;
  atRiskCount: number;
  dueMinor: number;
  dueCount: number;
  trials: number;
  newCount: number;
  newMinor: number;
  churnedCount: number;
  churnedMinor: number;
  planMix: PlanMixRow[];
  mrrRows: Subscription[];
  dueRows: Subscription[];
  churnedRows: Subscription[];
}

/** Revenue screen numbers; "new" and "churned" use the last `days` days ending at `now`. */
export function summarizeRevenue(subs: Subscription[], now: Date = new Date(), days = 30): RevenueSummary {
  const to = now.getTime();
  const from = to - days * DAY_MS;
  const mrrRows: Subscription[] = [];
  const dueRows: Subscription[] = [];
  const churnedRows: Subscription[] = [];
  let trials = 0;

  for (const s of subs) {
    const bucket = revenueBucket(s);
    if (bucket === "MRR") mrrRows.push(s);
    else if (bucket === "DUE") dueRows.push(s);
    else if (bucket === "TRIAL") trials++;
    else if (bucket === "ENDED" && s.source !== "COMPLIMENTARY" && periodPriceMinor(s) > 0 && within(s.end_at ?? s.updated_at, from, to)) {
      churnedRows.push(s);
    }
  }

  const sum = (rows: Subscription[]) => rows.reduce((t, s) => t + monthlyValueMinor(s), 0);
  const grace = mrrRows.filter((s) => s.status === "GRACE");
  const fresh = mrrRows.filter((s) => within(s.start_at ?? s.created_at, from, to));

  const mix = new Map<string, PlanMixRow>();
  for (const s of mrrRows) {
    const plan = s.plan_name ?? s.plan_key ?? "Unnamed plan";
    const row = mix.get(plan) ?? { plan, subscriptions: 0, mrrMinor: 0 };
    row.subscriptions++;
    row.mrrMinor += monthlyValueMinor(s);
    mix.set(plan, row);
  }

  const byValue = (a: Subscription, b: Subscription) => monthlyValueMinor(b) - monthlyValueMinor(a);
  return {
    mrrMinor: sum(mrrRows),
    payingInstitutes: new Set(mrrRows.map((s) => s.institute_id)).size,
    atRiskMinor: sum(grace),
    atRiskCount: grace.length,
    dueMinor: dueRows.reduce((t, s) => t + periodPriceMinor(s), 0),
    dueCount: dueRows.length,
    trials,
    newCount: fresh.length,
    newMinor: sum(fresh),
    churnedCount: churnedRows.length,
    churnedMinor: sum(churnedRows),
    planMix: [...mix.values()].sort((a, b) => b.mrrMinor - a.mrrMinor || a.plan.localeCompare(b.plan)),
    mrrRows: [...mrrRows].sort(byValue),
    dueRows: [...dueRows].sort(byValue),
    churnedRows: [...churnedRows].sort(byValue),
  };
}

// ---------------------------------------------------------------- daily platform series

export interface PlatformDay {
  /** Local YYYY-MM-DD. */
  date: string;
  accounts: number;
  trials: number;
  paid: number;
}

function localDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A subscription that was paid for at some point (not a trial, not free, not still awaiting its first payment). */
export function isPaidSubscription(s: Subscription): boolean {
  if (s.source === "COMPLIMENTARY" || periodPriceMinor(s) === 0) return false;
  if (["TRIAL", "PENDING", "SCHEDULED"].includes(s.status)) return false;
  const payment = s.current_period?.payment_status ?? null;
  if (ENDED_STATUSES.has(s.status)) return payment !== "WAIVED" && payment !== "COMPLIMENTARY";
  return revenueBucket(s) === "MRR";
}

/**
 * Accounts created, trials started and paid subscriptions started per day, for the last `days`
 * days ending today (local time), zero-filled and oldest first.
 */
export function dailyPlatformSeries(
  accountsCreatedAt: (string | null | undefined)[],
  trials: Pick<TrialRow, "startedAt">[],
  subs: Subscription[],
  days: number,
  now: Date = new Date()
): { daily: PlatformDay[]; totals: { accounts: number; trials: number; paid: number } } {
  const rows = new Map<string, PlatformDay>();
  const order: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = localDay(d.toISOString())!;
    rows.set(key, { date: key, accounts: 0, trials: 0, paid: 0 });
    order.push(key);
  }
  const bump = (iso: string | null | undefined, field: "accounts" | "trials" | "paid") => {
    const row = rows.get(localDay(iso) ?? "");
    if (row) row[field]++;
  };
  accountsCreatedAt.forEach((iso) => bump(iso, "accounts"));
  trials.forEach((t) => bump(t.startedAt, "trials"));
  subs.filter(isPaidSubscription).forEach((s) => bump(s.start_at ?? s.created_at, "paid"));

  const daily = order.map((k) => rows.get(k)!);
  const totals = daily.reduce((t, d) => ({ accounts: t.accounts + d.accounts, trials: t.trials + d.trials, paid: t.paid + d.paid }), { accounts: 0, trials: 0, paid: 0 });
  return { daily, totals };
}

// ---------------------------------------------------------------- stages (lead tags)

export type Stage = "Lead" | "Trial" | "Paid" | "Test" | "Untagged";

/** Lead tag → lifecycle stage (plan v2 §5.1). Per-product state replaces this once product_entitlements exists. */
export function stageFromLeadTag(tag: LeadTag | null | undefined): Stage {
  switch (tag) {
    case "LEAD":
      return "Lead";
    case "FREE_TRIAL":
      return "Trial";
    case "PROD":
      return "Paid";
    case "TEST":
      return "Test";
    default:
      return "Untagged";
  }
}

/** Institutes per stage from per-tag totals; whatever the tags don't cover is Untagged (never negative). */
export function stageCounts(total: number, byTag: Partial<Record<LeadTag, number>>): Record<Stage, number> {
  const lead = byTag.LEAD ?? 0;
  const trial = byTag.FREE_TRIAL ?? 0;
  const paid = byTag.PROD ?? 0;
  const test = byTag.TEST ?? 0;
  return { Lead: lead, Trial: trial, Paid: paid, Test: test, Untagged: Math.max(0, total - lead - trial - paid - test) };
}

// ---------------------------------------------------------------- products

export type ProductKey = "vacademy" | "voomsales" | "telleo" | "evalezy";

export interface ProductInfo {
  key: ProductKey;
  label: string;
  site: string;
  /** Where the trial user signs in. */
  loginUrl: string;
  /** False until the product's login runs on Vacademy auth-service (plan v2 §2.3). */
  canProvision: boolean;
  blockedReason?: string;
  defaultTrialDays: number;
}

export const PRODUCTS: ProductInfo[] = [
  { key: "vacademy", label: "Vacademy.io", site: "vacademy.io", loginUrl: "https://dash.vacademy.io", canProvision: true, defaultTrialDays: 14 },
  { key: "telleo", label: "Telleo", site: "telleo.ai", loginUrl: "https://dash.vacademy.io", canProvision: true, defaultTrialDays: 7 },
  { key: "evalezy", label: "Evalezy", site: "evalezy.com", loginUrl: "https://dash.vacademy.io", canProvision: true, defaultTrialDays: 14 },
  {
    key: "voomsales",
    label: "Voomsales",
    site: "voomsales.com",
    loginUrl: "https://app.voomsales.com/login",
    canProvision: false,
    blockedReason: "Voomsales sign-in isn't connected to Vacademy accounts yet, so a trial created here couldn't log in.",
    defaultTrialDays: 14,
  },
];

/** The module preset whose key or name mentions the product, if one exists (e.g. "telleo_trial"). */
export function suggestPresetKey(product: ProductKey, presets: { key: string; name: string }[]): string | null {
  const words: Record<ProductKey, string[]> = {
    vacademy: ["vacademy", "lms"],
    voomsales: ["voomsales", "voom", "crm"],
    telleo: ["telleo", "calling", "voice"],
    evalezy: ["evalezy", "evaluation"],
  };
  for (const w of words[product]) {
    const hit = presets.find((p) => `${p.key} ${p.name}`.toLowerCase().includes(w));
    if (hit) return hit.key;
  }
  return null;
}

/** "YYYY-MM-DD" `days` from `now` (local date), for the trial end-date input. */
export function trialEndDate(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------- trials

export type TrialSource = "DEMO" | "TAG" | "AI_PLAN";

export const TRIAL_SOURCE_LABEL: Record<TrialSource, string> = {
  DEMO: "Demo workspace",
  TAG: "Tagged free trial",
  AI_PLAN: "AI plan trial",
};

export interface TrialRow {
  instituteId: string;
  name: string;
  /** Every place this institute shows up as a trial; the first is the most specific. */
  sources: TrialSource[];
  startedAt: string | null;
  endsAt: string | null;
  /** Whole days until endsAt (negative once expired); null when there is no end date. */
  daysLeft: number | null;
  contact: string | null;
}

/** Just the quote fields the trials list needs (SavedQuote from pricing-api). */
export interface DemoQuote {
  provisionedInstituteId?: string;
  provisionedAt?: string;
  demoExpiresAt?: string;
  organizationName?: string;
  contactName?: string;
  contactEmail?: string;
}

export function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

/**
 * One row per institute that is on a trial anywhere: a demo workspace provisioned from a quote,
 * a FREE_TRIAL lead tag, or an AI plan subscription in TRIAL. Sorted by fewest days left first.
 */
export function buildTrials(
  quotes: DemoQuote[],
  tagged: Pick<InstituteListItemDTO, "id" | "name" | "email" | "created_at">[],
  subs: Subscription[],
  now: Date = new Date()
): TrialRow[] {
  const rows = new Map<string, TrialRow>();
  const add = (id: string, source: TrialSource, patch: Partial<TrialRow>) => {
    const row = rows.get(id) ?? { instituteId: id, name: id, sources: [], startedAt: null, endsAt: null, daysLeft: null, contact: null };
    if (!row.sources.includes(source)) row.sources.push(source);
    if (patch.name && row.name === id) row.name = patch.name;
    row.startedAt = row.startedAt ?? patch.startedAt ?? null;
    row.endsAt = row.endsAt ?? patch.endsAt ?? null;
    row.contact = row.contact ?? patch.contact ?? null;
    rows.set(id, row);
  };

  for (const q of quotes) {
    if (!q.provisionedInstituteId) continue;
    add(q.provisionedInstituteId, "DEMO", {
      name: q.organizationName,
      startedAt: q.provisionedAt ?? null,
      endsAt: q.demoExpiresAt ?? null,
      contact: q.contactEmail ?? q.contactName ?? null,
    });
  }
  for (const s of subs) {
    if (s.status !== "TRIAL") continue;
    add(s.institute_id, "AI_PLAN", { name: s.institute_name ?? undefined, startedAt: s.start_at, endsAt: s.current_period?.period_end ?? s.end_at });
  }
  for (const i of tagged) {
    add(i.id, "TAG", { name: i.name, startedAt: i.created_at, contact: i.email || null });
  }

  const out = [...rows.values()].map((r) => ({ ...r, daysLeft: daysUntil(r.endsAt, now) }));
  return out.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name));
}
