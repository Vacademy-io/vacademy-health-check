// PM View "Product insights": sign-ups, onboarding, real usage, drop-off, features, churn reasons
// and which features paying customers use. Pure functions (tests/pm-insights.test.ts).
//
// ISOLATION: inputs are platform data read with GET or read-only SELECTs, plus PM records from the
// PM store. Nothing here writes anywhere.
import type { Subscription } from "../types/plans";
import { LOST_REASON_LABEL, LOST_REASONS, type LostReason } from "./pm-record.ts";
import { daysBetween, isTestAccount, type AccountRow } from "./pm-view.ts";

// ---------------------------------------------------------------- inputs

/** Features read from the platform database, one query each. */
export const FEATURE_KEYS = ["courses", "students", "live", "assessments", "ai", "leads"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
/** Features compared in the adoption table: the database ones plus AI voice calls (calls API). */
export type AdoptionKey = FeatureKey | "calls";

export const FEATURE_LABEL: Record<AdoptionKey, string> = {
  courses: "Courses",
  students: "Students enrolled",
  live: "Live classes",
  assessments: "Assessments",
  ai: "AI tools",
  leads: "Leads / CRM",
  calls: "AI voice calls",
};
export const FEATURE_HINT: Record<AdoptionKey, string> = {
  courses: "Created at least one course",
  students: "Enrolled at least one student",
  live: "Scheduled a live class",
  assessments: "Created an assessment",
  ai: "Used an AI tool (last 6 months)",
  leads: "Has leads in the CRM",
  calls: "Made an AI voice call (last 30 days)",
};

/** Usage of one feature by one institute: all-time total and the last 30 days. */
export interface FeatureRow {
  total: number;
  d30: number;
}
/** Staff (non-student) logins and recently active students, per institute. */
export interface StaffRow {
  staff: number;
  staffLoggedIn: number;
  staffLastLogin: string | null;
  studentsActive30: number;
}
export interface AiToolRow {
  request_type: string;
  requests: number;
  institutes: number;
}

export interface Signals {
  features: Partial<Record<FeatureKey, Map<string, FeatureRow>>>;
  staff: Map<string, StaffRow> | null;
}

// ---------------------------------------------------------------- read-only SQL (platform standby)

export type ReadOnlyDb = "admin_core_service" | "auth_service" | "assessment_service";

/** True for one SELECT (or WITH … SELECT) statement with no second statement and no write keywords. */
export function isReadOnlySql(sql: string): boolean {
  const s = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(s) || s.includes(";")) return false;
  return !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do|vacuum|lock|refresh|reindex|comment|security|set\s+role)\b/i.test(s.replace(/'[^']*'/g, "''"));
}

const D30 = "created_at > now() - interval '30 days'";
/** One query per feature, so a slow or failing one doesn't hide the others. */
export const FEATURE_SQL: Record<FeatureKey, { db: ReadOnlyDb; sql: string }> = {
  courses: {
    db: "admin_core_service",
    sql: `SELECT pi.institute_id, count(DISTINCT p.id)::int AS total, count(DISTINCT p.id) FILTER (WHERE p.${D30})::int AS d30
            FROM package_institute pi JOIN package p ON p.id = pi.package_id
           WHERE pi.institute_id IS NOT NULL AND coalesce(p.status, '') <> 'DELETED' GROUP BY 1`,
  },
  students: {
    db: "admin_core_service",
    sql: `SELECT institute_id, count(DISTINCT user_id)::int AS total, count(DISTINCT user_id) FILTER (WHERE ${D30})::int AS d30
            FROM student_session_institute_group_mapping WHERE institute_id IS NOT NULL GROUP BY 1`,
  },
  live: {
    db: "admin_core_service",
    sql: `SELECT institute_id, count(*)::int AS total, count(*) FILTER (WHERE ${D30})::int AS d30
            FROM live_session WHERE institute_id IS NOT NULL AND coalesce(status, '') <> 'DELETED' GROUP BY 1`,
  },
  assessments: {
    db: "assessment_service",
    sql: `SELECT m.institute_id, count(DISTINCT a.id)::int AS total, count(DISTINCT a.id) FILTER (WHERE a.${D30})::int AS d30
            FROM assessment_institute_mapping m JOIN assessment a ON a.id = m.assessment_id
           WHERE m.institute_id IS NOT NULL AND coalesce(a.status, '') <> 'DELETED' GROUP BY 1`,
  },
  ai: {
    db: "admin_core_service",
    sql: `SELECT institute_id, count(*)::int AS total, count(*) FILTER (WHERE ${D30})::int AS d30
            FROM ai_token_usage WHERE institute_id IS NOT NULL AND created_at > now() - interval '180 days' GROUP BY 1`,
  },
  leads: {
    db: "admin_core_service",
    sql: `SELECT institute_id, count(*)::int AS total, count(*) FILTER (WHERE ${D30})::int AS d30
            FROM user_lead_profile WHERE institute_id IS NOT NULL GROUP BY 1`,
  },
};

export const STAFF_SQL = `SELECT ur.institute_id,
       count(DISTINCT u.id) FILTER (WHERE coalesce(r.role_name, '') <> 'STUDENT')::int AS staff,
       count(DISTINCT u.id) FILTER (WHERE coalesce(r.role_name, '') <> 'STUDENT' AND u.last_login_time IS NOT NULL)::int AS staff_logged_in,
       max(u.last_login_time) FILTER (WHERE coalesce(r.role_name, '') <> 'STUDENT') AS staff_last_login,
       count(DISTINCT u.id) FILTER (WHERE r.role_name = 'STUDENT' AND u.last_login_time > now() - interval '30 days')::int AS students_active_30
  FROM user_role ur JOIN users u ON u.id = ur.user_id LEFT JOIN roles r ON r.id = ur.role_id
 WHERE ur.institute_id IS NOT NULL AND coalesce(ur.status, 'ACTIVE') <> 'DELETED'
 GROUP BY 1`;

export const AI_TOOLS_SQL = `SELECT coalesce(request_type, 'unknown') AS request_type, count(*)::int AS requests, count(DISTINCT institute_id)::int AS institutes
  FROM ai_token_usage WHERE ${D30} GROUP BY 1 ORDER BY 2 DESC LIMIT 30`;

// ---------------------------------------------------------------- per account

export interface AccountSignal {
  /** null when neither the login query nor the per-institute user list has loaded. */
  loggedIn: boolean | null;
  hasCourse: boolean;
  hasStudents: boolean;
  /** Any staff or student login, created content, AI use or AI call in the last 30 days. */
  active30: boolean;
  /** Features used ever (AI: last 6 months; calls: last 30 days). */
  used: AdoptionKey[];
  used30: AdoptionKey[];
}

const within = (today: string, iso: string | null | undefined, days: number) => {
  const d = daysBetween(today, iso);
  return d !== null && d <= 0 && d >= -days;
};

export function accountSignal(a: AccountRow, s: Signals, today: string): AccountSignal {
  const staff = s.staff?.get(a.id);
  const loggedIn = s.staff ? (staff?.staffLoggedIn ?? 0) > 0 || (a.usage?.loggedIn ?? 0) > 0 : a.usage ? a.usage.loggedIn > 0 : null;
  const used: AdoptionKey[] = [];
  const used30: AdoptionKey[] = [];
  for (const k of FEATURE_KEYS) {
    const row = s.features[k]?.get(a.id);
    const ever = (row?.total ?? 0) > 0 || (k === "courses" && a.courses > 0) || (k === "students" && a.students > 0);
    if (ever) used.push(k);
    if ((row?.d30 ?? 0) > 0) used30.push(k);
  }
  if ((a.calls30?.calls ?? 0) > 0) {
    used.push("calls");
    used30.push("calls");
  }
  const recentLogin = within(today, staff?.staffLastLogin, 30) || within(today, a.usage?.lastLogin, 30) || (staff?.studentsActive30 ?? 0) > 0;
  return {
    loggedIn,
    hasCourse: used.includes("courses"),
    hasStudents: used.includes("students"),
    active30: recentLogin || used30.length > 0,
    used,
    used30,
  };
}

/** Paying = paid platform subscription, PROD tag, or your Production label. */
export const isPayingAccount = (a: Pick<AccountRow, "paid" | "platformTag" | "pmClass">) => a.paid || a.platformTag === "PROD" || a.pmClass === "PRODUCTION";

/** Monthly revenue in rupees: the platform plan, else what you entered in the register. */
export const monthlyRupees = (a: Pick<AccountRow, "platformMrrMinor" | "registerMonthly">) => (a.platformMrrMinor > 0 ? a.platformMrrMinor / 100 : a.registerMonthly ?? 0);

// ---------------------------------------------------------------- sign-ups

/** Real (non-test) institutes created within the last `days` days, optionally for one product ("NONE" = not set). */
export function cohort(accounts: AccountRow[], today: string, days: number, product: string): AccountRow[] {
  return accounts.filter((a) => !isTestAccount(a) && within(today, a.createdAt, days - 1) && matchesProduct(a, product));
}

export function matchesProduct(a: Pick<AccountRow, "products">, product: string): boolean {
  if (!product) return true;
  return product === "NONE" ? a.products.length === 0 : a.products.includes(product);
}

/** Sign-ups per week (weeks start Monday), oldest first, covering the last `weeks` weeks. */
export function signupsByWeek(accounts: AccountRow[], today: string, weeks: number): { week: string; count: number }[] {
  const monday = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const start = new Date(`${monday(today)}T00:00:00Z`);
  const out = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
    return { week: d.toISOString().slice(0, 10), count: 0 };
  });
  const index = new Map(out.map((w, i) => [w.week, i]));
  for (const a of accounts) {
    if (!a.createdAt) continue;
    const i = index.get(monday(a.createdAt));
    if (i !== undefined) out[i].count++;
  }
  return out;
}

// ---------------------------------------------------------------- funnel

export const FUNNEL_STEPS = [
  { key: "signed_up", label: "Signed up", hint: "Institute created" },
  { key: "logged_in", label: "Logged in", hint: "An admin or teacher signed in" },
  { key: "course", label: "Created a course", hint: "At least one course" },
  { key: "students", label: "Added students", hint: "At least one student enrolled" },
  { key: "active", label: "Actively using", hint: "Any login or activity in the last 30 days" },
  { key: "paying", label: "Paying", hint: "Paid plan, PROD tag or your Production label" },
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"];

export interface FunnelStep {
  key: FunnelKey;
  label: string;
  hint: string;
  count: number;
  /** Share of everyone who signed up. */
  ofStart: number;
  /** Share of the previous step that didn't reach this one. */
  dropFromPrev: number;
  /** Reached the previous step but not this one: where they stopped. */
  stuck: AccountRow[];
}

/**
 * Each step counts only accounts that also passed every step before it, so the drop between two
 * steps is exactly the accounts that stopped there. Logins unknown (still loading) count as not logged in.
 */
export function buildFunnel(accounts: AccountRow[], sig: (a: AccountRow) => AccountSignal): FunnelStep[] {
  const tests: Record<FunnelKey, (a: AccountRow, s: AccountSignal) => boolean> = {
    signed_up: () => true,
    logged_in: (_a, s) => s.loggedIn === true,
    course: (_a, s) => s.hasCourse,
    students: (_a, s) => s.hasStudents,
    active: (_a, s) => s.active30,
    paying: (a) => isPayingAccount(a),
  };
  let remaining = accounts;
  const start = accounts.length;
  const out: FunnelStep[] = [];
  for (const step of FUNNEL_STEPS) {
    const passed = remaining.filter((a) => tests[step.key](a, sig(a)));
    const prev = remaining.length;
    out.push({
      ...step,
      count: passed.length,
      ofStart: start ? passed.length / start : 0,
      dropFromPrev: prev ? 1 - passed.length / prev : 0,
      stuck: remaining.filter((a) => !passed.includes(a)),
    });
    remaining = passed;
  }
  return out;
}

/** The step (after sign-up) that loses the most accounts. */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  return steps.slice(1).reduce<FunnelStep | null>((best, s) => (s.stuck.length > (best?.stuck.length ?? 0) ? s : best), null);
}

// ---------------------------------------------------------------- features

export interface FeatureAdoption {
  key: AdoptionKey;
  label: string;
  hint: string;
  /** Institutes that have used it (see FEATURE_HINT for the time range). */
  using: number;
  using30: number;
  payingUsing: number;
  payingTotal: number;
  /** Non-paying institutes that logged in at least once (a fair comparison group). */
  freeUsing: number;
  freeTotal: number;
  /** Monthly revenue (₹) from paying institutes that use it. */
  revenue: number;
  /** Paying adoption minus free adoption, in percentage points. */
  lift: number;
}

const ADOPTION_KEYS: AdoptionKey[] = [...FEATURE_KEYS, "calls"];

export function featureAdoption(accounts: AccountRow[], sig: (a: AccountRow) => AccountSignal): FeatureAdoption[] {
  const real = accounts.filter((a) => !isTestAccount(a));
  const paying = real.filter(isPayingAccount);
  const free = real.filter((a) => !isPayingAccount(a) && sig(a).loggedIn === true);
  const share = (n: number, d: number) => (d ? (n / d) * 100 : 0);
  return ADOPTION_KEYS.map((key) => {
    const uses = (a: AccountRow) => sig(a).used.includes(key);
    const payingUsing = paying.filter(uses);
    const freeUsing = free.filter(uses).length;
    return {
      key,
      label: FEATURE_LABEL[key],
      hint: FEATURE_HINT[key],
      using: real.filter(uses).length,
      using30: real.filter((a) => sig(a).used30.includes(key)).length,
      payingUsing: payingUsing.length,
      payingTotal: paying.length,
      freeUsing,
      freeTotal: free.length,
      revenue: payingUsing.reduce((t, a) => t + monthlyRupees(a), 0),
      lift: Math.round(share(payingUsing.length, paying.length) - share(freeUsing, free.length)),
    };
  }).sort((a, b) => b.using - a.using);
}

// ---------------------------------------------------------------- churn

export interface ChurnItem {
  instituteId: string;
  name: string;
  what: string;
  when: string | null;
  reason: string;
}
export interface ChurnSummary {
  /** AI plans that were cancelled or ran out in the window. */
  plansEnded: ChurnItem[];
  /** Still active but set to cancel at the end of the period. */
  cancelling: ChurnItem[];
  /** Trials that ended in the window without paying. */
  trialsLost: ChurnItem[];
  /** Your Lost labels, grouped by the reason you recorded. */
  reasons: { reason: LostReason | "NONE"; label: string; count: number }[];
  lostTotal: number;
}

export function churnSummary(accounts: AccountRow[], subs: Subscription[], today: string, days: number): ChurnSummary {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const name = (id: string, fallback: string | null) => byId.get(id)?.name ?? fallback ?? id;
  const test = (id: string) => {
    const a = byId.get(id);
    return a ? isTestAccount(a) : false;
  };
  const payingIds = new Set(subs.filter((s) => s.status === "ACTIVE" || s.status === "GRACE").map((s) => s.institute_id));

  const plansEnded = subs
    .filter((s) => (s.status === "CANCELLED" || s.status === "EXPIRED") && !test(s.institute_id) && !payingIds.has(s.institute_id))
    .map((s) => ({ s, when: s.status === "CANCELLED" ? s.updated_at ?? s.end_at : s.end_at ?? s.updated_at }))
    .filter(({ when }) => within(today, when, days))
    .map(({ s, when }) => ({
      instituteId: s.institute_id,
      name: name(s.institute_id, s.institute_name),
      what: `${s.plan_name ?? "AI plan"} ${s.status === "CANCELLED" ? "cancelled" : "expired"}`,
      when: when ?? null,
      reason: s.reason?.trim() || "",
    }));

  const cancelling = subs
    .filter((s) => s.cancel_at_period_end && (s.status === "ACTIVE" || s.status === "GRACE") && !test(s.institute_id))
    .map((s) => ({ instituteId: s.institute_id, name: name(s.institute_id, s.institute_name), what: `${s.plan_name ?? "AI plan"} ends ${s.end_at?.slice(0, 10) ?? "at period end"}`, when: s.end_at, reason: s.reason?.trim() || "" }));

  const real = accounts.filter((a) => !isTestAccount(a));
  const trialsLost = real
    .filter((a) => a.trial?.endsAt && (a.trial.daysLeft ?? 0) < 0 && !isPayingAccount(a) && within(today, a.trial.endsAt, days))
    .map((a) => ({ instituteId: a.id, name: a.name, what: "Trial ended, didn't pay", when: a.trial!.endsAt, reason: a.record?.lostReason ? LOST_REASON_LABEL[a.record.lostReason] : "" }));

  const lost = real.filter((a) => a.pmClass === "LOST");
  const counts = new Map<LostReason | "NONE", number>();
  for (const a of lost) {
    const r = a.record?.lostReason ?? "NONE";
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const reasons = [...LOST_REASONS, "NONE" as const]
    .map((r) => ({ reason: r, label: r === "NONE" ? "Not recorded yet" : LOST_REASON_LABEL[r], count: counts.get(r) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return { plansEnded, cancelling, trialsLost, reasons, lostTotal: lost.length };
}

/** "content_generation" → "Content generation". */
export const toolLabel = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/[_-]+/g, " ") : "Unknown");
