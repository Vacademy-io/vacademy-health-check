import type {
  DashboardWidgetDto,
  InfoCardPayload,
  InfoSeverity,
  Milestone,
  MilestoneStatus,
  OnboardingPayload,
  WidgetType,
} from "@/services/widgets-api";

export const MILESTONE_STATUSES: { value: MilestoneStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];

export const SEVERITIES: { value: InfoSeverity; label: string }[] = [
  { value: "INFO", label: "Info" },
  { value: "WARNING", label: "Warning" },
  { value: "CRITICAL", label: "Critical" },
];

/** Roles offerable for per-widget visibility. Onboarding trackers are forced to ADMIN. */
export const ROLE_OPTIONS = [
  "ADMIN",
  "TEACHER",
  "COURSE CREATOR",
  "ASSESSMENT CREATOR",
  "EVALUATOR",
];

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  ONBOARDING_TRACKER: "Onboarding tracker",
  INFO_CARD: "Info card",
};

export function onboardingPayloadOf(widget: DashboardWidgetDto): OnboardingPayload {
  const p = (widget.payload || {}) as Partial<OnboardingPayload>;
  return { milestones: Array.isArray(p.milestones) ? p.milestones : [], overallNote: p.overallNote ?? "" };
}

export function infoPayloadOf(widget: DashboardWidgetDto): InfoCardPayload {
  const p = (widget.payload || {}) as Partial<InfoCardPayload>;
  return {
    body: p.body ?? "",
    severity: p.severity ?? "INFO",
    imageUrl: p.imageUrl ?? "",
    ctaLabel: p.ctaLabel ?? "",
    ctaUrl: p.ctaUrl ?? "",
  };
}

export function milestoneProgress(milestones: Milestone[]): number {
  if (!milestones.length) return 0;
  const done = milestones.filter((m) => m.status === "DONE").length;
  return Math.round((done / milestones.length) * 100);
}

/** Stable-ish client id for a freshly added custom milestone (index-based, avoids Math.random). */
export function newMilestoneId(existing: Milestone[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((m) => m.id));
  while (ids.has(`custom-${n}`)) n += 1;
  return `custom-${n}`;
}

export function formatEpoch(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}
