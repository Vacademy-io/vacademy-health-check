// LMS AI Video policy per institute (ai-service
// /super-admin/v1/institutes/{id}/ai-video-policy). Stored in the institute's
// setting_json under AI_VIDEO_POLICY; a missing key means the platform defaults.

/** UI labels: Standard / Premium / Best (= ultra). */
export type AiVideoQuality = "standard" | "premium" | "ultra";

export interface AiVideoPolicy {
  enabled: boolean;
  allowed_qualities: AiVideoQuality[];
  /** May a teacher pick a talking-teacher avatar. */
  teacher_allowed: boolean;
  /** 1–30. */
  max_minutes_per_video: number;
  /** Credits per calendar month (UTC); null = no cap. */
  monthly_credit_cap: number | null;
  /** Videos generating at once, 1–20. */
  max_concurrent: number;
  /** Audit fields the backend stores inside the setting data (absent on defaults). */
  updated_by?: string | null;
  updated_at?: string | null;
  reason?: string | null;
}

export interface AiVideoUsage {
  /** Video credits deducted this calendar month (UTC). */
  month_credits_used: number;
  /** Videos in a non-terminal status right now. */
  running_now: number;
  videos_this_month: number;
}

export interface AiVideoPolicyResponse {
  policy: AiVideoPolicy;
  /** True when the institute has no AI_VIDEO_POLICY of its own. */
  is_default: boolean;
  usage: AiVideoUsage;
}

/** PUT body: every policy field is optional (absent = keep); reason is required. */
export interface UpdateAiVideoPolicyRequest {
  enabled?: boolean;
  allowed_qualities?: AiVideoQuality[];
  teacher_allowed?: boolean;
  max_minutes_per_video?: number;
  /** Explicit null = no cap. */
  monthly_credit_cap?: number | null;
  max_concurrent?: number;
  reason: string;
}
