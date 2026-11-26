// PM View "Feature usage": every feature of every product, with who hasn't started it, who started
// and got stuck, and who finished. Pure functions (tests/pm-features.test.ts).
//
// ISOLATION: the queries are read-only SELECTs (checked by isReadOnlySql) sent through the analytics
// proxy to the platform's read-only standby. Nothing here writes anywhere.
import type { ReadOnlyDb } from "./pm-insights.ts";
import { isTestAccount, type AccountRow } from "./pm-view.ts";

export const FEATURE_GROUPS = [
  { key: "SETUP", label: "Sign-up & setup", hint: "Getting the account ready" },
  { key: "LMS", label: "LMS", hint: "Courses, students, live classes, assessments" },
  { key: "CRM", label: "CRM", hint: "Leads, forms, workflows, follow-ups" },
  { key: "AI_CALLING", label: "AI calling", hint: "Telleo: agents and calls" },
  { key: "EVALEZY", label: "Evalezy", hint: "AI evaluation of answer sheets" },
  { key: "VIMOTION", label: "Vimotion & AI tools", hint: "AI videos and other AI tools" },
] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number]["key"];

/**
 * One feature. `sql` returns one row per institute with:
 *   institute_id, started (int > 0 when they began), completed (int > 0 when they finished / got value),
 *   d30 (int, activity in the last 30 days), last_at (timestamp of the latest activity, may be null).
 */
export interface FeatureDef {
  key: string;
  group: FeatureGroup;
  label: string;
  /** What counts as starting, and as finishing, in plain words. */
  started: string;
  completed: string;
  /** What the main number counts, e.g. "calls made", "courses created". */
  unit: string;
  /** What the other count means, e.g. "answered" for calls; for completed-volume features, the set-up count. */
  secondary: string;
  /** Which count is the feature's volume: started rows (default) or completed rows. */
  main?: "started" | "completed";
  db: ReadOnlyDb;
  sql: string;
}

/** The feature's volume for one institute (calls made, courses created …). */
export const volumeOf = (def: Pick<FeatureDef, "main">, r: FeatureRowData | null | undefined) => (r ? (def.main === "completed" ? r.completed : r.started) : 0);
/** The other count shown next to the volume (answered calls, active courses, gateways connected …). */
export const secondaryOf = (def: Pick<FeatureDef, "main">, r: FeatureRowData | null | undefined) => (r ? (def.main === "completed" ? r.started : r.completed) : 0);

export interface FeatureRowData {
  started: number;
  completed: number;
  d30: number;
  lastAt: string | null;
}

export type FeatureState = "COMPLETED" | "STUCK" | "NOT_STARTED";
export const FEATURE_STATE_LABEL: Record<FeatureState, string> = {
  COMPLETED: "Using it",
  STUCK: "Started, didn't finish",
  NOT_STARTED: "Not started",
};

export function featureState(row: FeatureRowData | undefined): FeatureState {
  if (!row) return "NOT_STARTED";
  if (row.completed > 0) return "COMPLETED";
  if (row.started > 0) return "STUCK";
  return "NOT_STARTED";
}

export interface FeatureStat {
  def: FeatureDef;
  /** Institutes counted (real, in scope). */
  base: number;
  completed: AccountRow[];
  stuck: AccountRow[];
  notStarted: AccountRow[];
  /** Institutes with activity in the last 30 days. */
  active30: number;
  /** Volume: total calls made / courses created … across institutes in scope. */
  total: number;
  /** Total of the secondary count (answered calls, active courses …). */
  totalSecondary: number;
  /** Volume in the last 30 days. */
  total30: number;
  /** Institutes with any volume, highest first. */
  ranking: { account: AccountRow; value: number; secondary: number; d30: number; lastAt: string | null }[];
  /** completed / base. */
  adoption: number;
  /** stuck / (stuck + completed): how many who try it don't get through. */
  stuckRate: number;
  loaded: boolean;
}

/** Feature-by-feature counts for the given institutes (test and internal accounts are left out). */
export function featureStats(defs: FeatureDef[], accounts: AccountRow[], data: Record<string, Map<string, FeatureRowData> | undefined>): FeatureStat[] {
  const real = accounts.filter((a) => !isTestAccount(a));
  return defs.map((def) => {
    const rows = data[def.key];
    const completed: AccountRow[] = [];
    const stuck: AccountRow[] = [];
    const notStarted: AccountRow[] = [];
    let active30 = 0;
    let total = 0;
    let totalSecondary = 0;
    let total30 = 0;
    const ranking: FeatureStat["ranking"] = [];
    for (const a of real) {
      const r = rows?.get(a.id);
      const s = featureState(r);
      (s === "COMPLETED" ? completed : s === "STUCK" ? stuck : notStarted).push(a);
      if ((r?.d30 ?? 0) > 0) active30++;
      const value = volumeOf(def, r);
      total += value;
      totalSecondary += secondaryOf(def, r);
      total30 += r?.d30 ?? 0;
      if (r && (value > 0 || r.completed > 0)) ranking.push({ account: a, value, secondary: secondaryOf(def, r), d30: r.d30, lastAt: r.lastAt });
    }
    ranking.sort((x, y) => y.value - x.value || y.secondary - x.secondary || String(y.lastAt ?? "").localeCompare(String(x.lastAt ?? "")));
    const tried = completed.length + stuck.length;
    return {
      def,
      base: real.length,
      completed,
      stuck,
      notStarted,
      active30,
      total,
      totalSecondary,
      total30,
      ranking,
      adoption: real.length ? completed.length / real.length : 0,
      stuckRate: tried ? stuck.length / tried : 0,
      loaded: !!rows,
    };
  });
}

/** Most used first: by institutes using it, then by those who started (volumes have different units). */
export const byUsage = (a: FeatureStat, b: FeatureStat) => b.completed.length - a.completed.length || b.stuck.length - a.stuck.length;

/** Features ranked by how many people start and don't finish (only where at least `min` tried). */
export function stuckRanking(stats: FeatureStat[], min = 3): FeatureStat[] {
  return stats.filter((s) => s.stuck.length + s.completed.length >= min && s.stuck.length > 0).sort((a, b) => b.stuckRate - a.stuckRate || b.stuck.length - a.stuck.length);
}

/** Everything one institute has started, finished or not touched, grouped by product. */
export function accountFeatures(defs: FeatureDef[], instituteId: string, data: Record<string, Map<string, FeatureRowData> | undefined>) {
  return defs.map((def) => {
    const row = data[def.key]?.get(instituteId);
    return { def, state: featureState(row), row: row ?? null, loaded: !!data[def.key] };
  });
}
