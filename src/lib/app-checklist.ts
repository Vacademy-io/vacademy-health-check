/**
 * Evaluates the declarative checklist rules from the requirements catalogue against a real app.
 *
 * This is deliberately the *only* module that knows how to turn a `CheckRule` into a tick or a
 * cross. The catalogue stays pure data; the UI stays dumb; changing "what counts as done" happens
 * in one place.
 */

import {
  ASSET_SPECS,
  CHECKLIST_SECTIONS,
  PLATFORM_CHECKLISTS,
  PLATFORM_QUESTIONS,
  type CheckRule,
  type ChecklistItem,
  type ChecklistSection,
  type QuestionSpec,
} from "@/lib/platform-requirements";
import {
  PLATFORMS,
  STATUS_META,
  type AppRecord,
  type ChecklistOverride,
  type Platform,
  type StoreStatus,
} from "@/types/app-registry";

export type CheckState = "COMPLETED" | "PENDING" | "NOT_APPLICABLE";

export interface ResolvedChecklistItem extends ChecklistItem {
  state: CheckState;
  /** True when only a human can confirm it (the rule is `manual`, or an override is in force). */
  manual: boolean;
  overridden: boolean;
}

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

/** How many assets of a given spec the app already has. */
export function assetCount(app: AppRecord, platform: Platform, specId: string): number {
  return app.assets.filter((a) => a.platform === platform && a.specId === specId).length;
}

function evaluate(rule: CheckRule, app: AppRecord, platform: Platform): CheckState {
  const cfg = app.platforms[platform];
  switch (rule.kind) {
    case "basic":
      return filled(app.basics[rule.key]) ? "COMPLETED" : "PENDING";
    case "field":
      return filled(cfg.fields[rule.fieldId]) ? "COMPLETED" : "PENDING";
    case "answer":
      return filled(cfg.answers[rule.questionId]) ? "COMPLETED" : "PENDING";
    case "asset": {
      const spec = ASSET_SPECS.find((s) => s.id === rule.specId);
      const need = Math.max(1, spec?.minCount ?? 1);
      return assetCount(app, platform, rule.specId) >= need ? "COMPLETED" : "PENDING";
    }
    case "privacy":
      return filled(app.privacy[rule.key]) ? "COMPLETED" : "PENDING";
    case "review":
      return filled(app.review[rule.key]) ? "COMPLETED" : "PENDING";
    case "content":
      return filled(app.content[platform]?.[rule.key]) ? "COMPLETED" : "PENDING";
    case "version":
      return app.versions.some((v) => v.platform === platform) ? "COMPLETED" : "PENDING";
    case "submitted":
      return app.submissions.some((s) => s.platform === platform) ? "COMPLETED" : "PENDING";
    case "all":
      return rule.rules.every((r) => evaluate(r, app, platform) === "COMPLETED") ? "COMPLETED" : "PENDING";
    case "manual":
      return "PENDING";
  }
}

/** The full, resolved checklist for one platform — overrides applied. */
export function resolveChecklist(app: AppRecord, platform: Platform): ResolvedChecklistItem[] {
  const overrides = app.platforms[platform].checklistOverrides;
  return PLATFORM_CHECKLISTS[platform].map((item) => {
    const override = overrides[item.id] as ChecklistOverride | undefined;
    const derived = evaluate(item.rule, app, platform);
    return {
      ...item,
      // A human tick beats the rule — some things (a Play Console form, a notarised archive) can
      // only be confirmed by the person who did them.
      state: override ?? derived,
      manual: item.rule.kind === "manual",
      overridden: override != null && override !== derived,
    };
  });
}

export interface SectionProgress {
  section: ChecklistSection;
  total: number;
  done: number;
  state: CheckState;
}

export interface PlatformProgress {
  platform: Platform;
  percent: number;
  done: number;
  total: number;
  sections: SectionProgress[];
  blocking: ResolvedChecklistItem[];
}

/** Progress for one platform, counting only required rows that aren't marked N/A. */
export function platformProgress(app: AppRecord, platform: Platform): PlatformProgress {
  const items = resolveChecklist(app, platform);
  const counted = items.filter((i) => i.required && i.state !== "NOT_APPLICABLE");
  const done = counted.filter((i) => i.state === "COMPLETED").length;

  const sections = CHECKLIST_SECTIONS.map<SectionProgress>((section) => {
    const rows = counted.filter((i) => i.section === section);
    const sDone = rows.filter((i) => i.state === "COMPLETED").length;
    return {
      section,
      total: rows.length,
      done: sDone,
      state: rows.length === 0 ? "NOT_APPLICABLE" : sDone === rows.length ? "COMPLETED" : "PENDING",
    };
  }).filter((s) => s.total > 0);

  return {
    platform,
    percent: counted.length === 0 ? 0 : Math.round((done / counted.length) * 100),
    done,
    total: counted.length,
    sections,
    blocking: counted.filter((i) => i.state !== "COMPLETED"),
  };
}

/** Whole-app progress across every enabled platform (the number on the app header). */
export function appProgress(app: AppRecord): { percent: number; done: number; total: number } {
  const enabled = PLATFORMS.filter((p) => app.platforms[p].enabled);
  if (enabled.length === 0) return { percent: 0, done: 0, total: 0 };
  const totals = enabled.map((p) => platformProgress(app, p));
  const done = totals.reduce((n, t) => n + t.done, 0);
  const total = totals.reduce((n, t) => n + t.total, 0);
  return { percent: total === 0 ? 0 : Math.round((done / total) * 100), done, total };
}

/* ------------------------------------------------------------ status rollup */

/**
 * Worst-first ordering. The app-level badge should shout about the rejection, not the three
 * platforms that are fine.
 */
const STATUS_SEVERITY: StoreStatus[] = [
  "REJECTED",
  "SUSPENDED",
  "FAILED",
  "REMOVED",
  "BUILD_PROCESSING",
  "IN_REVIEW",
  "SUBMITTED",
  "UPDATE_AVAILABLE",
  "READY_FOR_SUBMISSION",
  "DRAFT",
  "APPROVED",
  "LIVE",
  "NOT_REGISTERED",
];

export function overallStatus(app: AppRecord): StoreStatus {
  const enabled = PLATFORMS.filter((p) => app.platforms[p].enabled);
  if (enabled.length === 0) return "NOT_REGISTERED";
  const statuses = enabled.map((p) => app.platforms[p].status);
  // Everything live is the one case worth reporting as a clean "Live".
  if (statuses.every((s) => s === "LIVE")) return "LIVE";
  for (const s of STATUS_SEVERITY) if (statuses.includes(s)) return s;
  return "NOT_REGISTERED";
}

export function statusTone(status: StoreStatus): "neutral" | "info" | "warn" | "good" | "bad" {
  return STATUS_META[status].tone;
}

/* -------------------------------------------------------- questionnaire walk */

export interface VisibleQuestion {
  spec: QuestionSpec;
  depth: number;
}

/**
 * Flattens the question tree to just what should be on screen, given the answers so far.
 * Follow-ups appear the moment their trigger answer is given, and vanish if it changes.
 */
export function visibleQuestions(app: AppRecord, platform: Platform): VisibleQuestion[] {
  const answers = app.platforms[platform].answers;
  const out: VisibleQuestion[] = [];

  const walk = (specs: QuestionSpec[], depth: number) => {
    for (const spec of specs) {
      out.push({ spec, depth });
      const answer = answers[spec.id];
      if (typeof answer !== "string") continue;
      for (const branch of spec.followUps ?? []) {
        if (branch.whenAnswer === answer) walk(branch.questions, depth + 1);
      }
    }
  };

  walk(PLATFORM_QUESTIONS[platform], 0);
  return out;
}

/** Answered / total across everything currently visible — drives the questionnaire progress pill. */
export function questionnaireProgress(app: AppRecord, platform: Platform): { done: number; total: number } {
  const visible = visibleQuestions(app, platform);
  const answers = app.platforms[platform].answers;
  return {
    done: visible.filter((v) => filled(answers[v.spec.id])).length,
    total: visible.length,
  };
}
