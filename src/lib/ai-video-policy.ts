// Pure helpers for the institute "AI Video" tab. No React and no "@/" imports, so
// `node --test tests/` can run them directly (see tests/ai-video-policy.test.ts).
import type {
  AiVideoPolicy,
  AiVideoPolicyResponse,
  AiVideoQuality,
  AiVideoUsage,
  UpdateAiVideoPolicyRequest,
} from "../types/ai-video-policy";

/** Display order and labels; "Best" is the ultra tier. */
export const AI_VIDEO_QUALITIES: ReadonlyArray<{ value: AiVideoQuality; label: string; hint: string }> = [
  { value: "standard", label: "Standard", hint: "cheapest, fast" },
  { value: "premium", label: "Premium", hint: "richer visuals" },
  { value: "ultra", label: "Best", hint: "ultra tier, most credits" },
];

/** The same ranges the backend validates on PUT. */
export const AI_VIDEO_LIMITS = {
  maxMinutes: { min: 1, max: 30 },
  maxConcurrent: { min: 1, max: 20 },
} as const;

/** Platform defaults (ai_service/app/constants/ai_video_policy.py) — used only when the response omits a field. */
export const PLATFORM_DEFAULT_POLICY: AiVideoPolicy = {
  enabled: true,
  allowed_qualities: ["standard", "premium", "ultra"],
  teacher_allowed: true,
  max_minutes_per_video: 8,
  monthly_credit_cap: null,
  max_concurrent: 3,
};

const QUALITY_VALUES = new Set<string>(AI_VIDEO_QUALITIES.map((q) => q.value));

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Numbers may arrive as strings (DECIMAL credits); non-numeric → null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Known qualities in display order, de-duplicated; unknown values are dropped. */
export function normalizeQualities(raw: unknown): AiVideoQuality[] {
  const list = Array.isArray(raw) ? raw.map((q) => String(q).toLowerCase()) : [];
  return AI_VIDEO_QUALITIES.map((q) => q.value).filter((v) => list.includes(v) && QUALITY_VALUES.has(v));
}

/** GET/PUT response → a shape the tab can render without null checks. */
export function normalizeAiVideoPolicyResponse(raw: unknown): AiVideoPolicyResponse {
  const r = obj(raw) ?? {};
  const p = obj(r.policy) ?? {};
  const u = obj(r.usage) ?? {};
  const d = PLATFORM_DEFAULT_POLICY;
  const policy: AiVideoPolicy = {
    enabled: typeof p.enabled === "boolean" ? p.enabled : d.enabled,
    allowed_qualities: Array.isArray(p.allowed_qualities) ? normalizeQualities(p.allowed_qualities) : [...d.allowed_qualities],
    teacher_allowed: typeof p.teacher_allowed === "boolean" ? p.teacher_allowed : d.teacher_allowed,
    max_minutes_per_video: num(p.max_minutes_per_video) ?? d.max_minutes_per_video,
    monthly_credit_cap: num(p.monthly_credit_cap),
    max_concurrent: num(p.max_concurrent) ?? d.max_concurrent,
    updated_by: str(p.updated_by),
    updated_at: str(p.updated_at),
    reason: str(p.reason),
  };
  const usage: AiVideoUsage = {
    month_credits_used: num(u.month_credits_used) ?? 0,
    running_now: num(u.running_now) ?? 0,
    videos_this_month: num(u.videos_this_month) ?? 0,
  };
  return { policy, is_default: r.is_default === true, usage };
}

/** Editable form state; numbers stay strings so a half-typed value doesn't jump. */
export interface AiVideoPolicyForm {
  enabled: boolean;
  allowed_qualities: AiVideoQuality[];
  teacher_allowed: boolean;
  max_minutes_per_video: string;
  /** "" = no cap. */
  monthly_credit_cap: string;
  max_concurrent: string;
}

export function formFromPolicy(p: AiVideoPolicy): AiVideoPolicyForm {
  return {
    enabled: p.enabled,
    allowed_qualities: [...p.allowed_qualities],
    teacher_allowed: p.teacher_allowed,
    max_minutes_per_video: String(p.max_minutes_per_video),
    monthly_credit_cap: p.monthly_credit_cap === null ? "" : String(p.monthly_credit_cap),
    max_concurrent: String(p.max_concurrent),
  };
}

function intInRange(raw: string, min: number, max: number): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export type PolicyValidation =
  | { ok: true; body: Omit<UpdateAiVideoPolicyRequest, "reason"> }
  | { ok: false; error: string };

/**
 * Validate the form to the backend's ranges and build the PUT body (minus reason).
 * Every field is sent, with monthly_credit_cap as an explicit null for "no cap".
 */
export function validatePolicyForm(form: AiVideoPolicyForm): PolicyValidation {
  const { maxMinutes, maxConcurrent } = AI_VIDEO_LIMITS;
  const minutes = intInRange(form.max_minutes_per_video, maxMinutes.min, maxMinutes.max);
  if (minutes === null) {
    return { ok: false, error: `Max minutes per video must be a whole number from ${maxMinutes.min} to ${maxMinutes.max}` };
  }
  const concurrent = intInRange(form.max_concurrent, maxConcurrent.min, maxConcurrent.max);
  if (concurrent === null) {
    return {
      ok: false,
      error: `Max videos generating at once must be a whole number from ${maxConcurrent.min} to ${maxConcurrent.max}`,
    };
  }
  let cap: number | null = null;
  const capRaw = form.monthly_credit_cap.trim();
  if (capRaw !== "") {
    const n = Number(capRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Monthly credit cap must be 0 or more (leave blank for no cap)" };
    }
    cap = n;
  }
  const qualities = normalizeQualities(form.allowed_qualities);
  if (form.enabled && qualities.length === 0) {
    return { ok: false, error: "Allow at least one quality, or switch AI Video off" };
  }
  return {
    ok: true,
    body: {
      enabled: form.enabled,
      allowed_qualities: qualities,
      teacher_allowed: form.teacher_allowed,
      max_minutes_per_video: minutes,
      monthly_credit_cap: cap,
      max_concurrent: concurrent,
    },
  };
}

/** True when the validated body differs from the saved policy. */
export function policyChanged(body: Omit<UpdateAiVideoPolicyRequest, "reason">, p: AiVideoPolicy): boolean {
  return (
    body.enabled !== p.enabled ||
    body.teacher_allowed !== p.teacher_allowed ||
    body.max_minutes_per_video !== p.max_minutes_per_video ||
    body.monthly_credit_cap !== p.monthly_credit_cap ||
    body.max_concurrent !== p.max_concurrent ||
    (body.allowed_qualities ?? []).join(",") !== normalizeQualities(p.allowed_qualities).join(",")
  );
}

/** This month's usage against the cap: bar percent (0–100) and whether the cap is reached. Null when uncapped. */
export function capProgress(used: number, cap: number | null): { percent: number; reached: boolean } | null {
  if (cap === null) return null;
  if (cap <= 0) return { percent: 100, reached: true };
  const percent = Math.min(100, Math.max(0, (used / cap) * 100));
  return { percent, reached: used >= cap };
}

/** "1,234.5" — credits with up to 2 decimals. */
export function formatCredits(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
