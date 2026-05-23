export type WaitlistStatus = "pending" | "invited" | "converted" | "rejected";
export type InviteCodeKind = "open" | "locked";
export type InviteCodeStatus = "active" | "exhausted" | "revoked";

export interface VimotionPagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
}

export interface VimotionWaitlistEntry {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  status: WaitlistStatus;
  referrer_id: string | null;
  referral_code: string;
  referral_count: number;
  position: number;
  effective_position: number;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface VimotionInviteCode {
  id: string;
  code: string;
  kind: InviteCodeKind;
  status: InviteCodeStatus;
  locked_email: string | null;
  locked_phone_number: string | null;
  waitlist_id: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VimotionRedemption {
  id: string;
  invite_code_id: string;
  email: string;
  phone_number: string;
  user_id: string | null;
  institute_id: string | null;
  redeemed_at: string;
}

export interface VimotionStats {
  waitlist_total: number;
  waitlist_pending: number;
  waitlist_invited: number;
  waitlist_converted: number;
  waitlist_rejected: number;
  invites_active: number;
  invites_exhausted: number;
  invites_revoked: number;
  conversion_rate: number;
  top_referrers: Array<{
    id: string;
    full_name: string;
    referral_code: string;
    referral_count: number;
  }>;
}

export interface InviteWaitlistRequestPayload {
  send_email: boolean;
  note?: string;
}

export interface InviteWaitlistResponse {
  code: VimotionInviteCode;
  /**
   * null when the admin chose "Generate (no email)";
   * true when notification_service confirmed delivery;
   * false when send was attempted but failed.
   */
  email_sent: boolean | null;
}

export interface CreateInviteCodeRequestPayload {
  kind: InviteCodeKind;
  max_uses?: number | null;
  expires_at?: string | null;
  locked_email?: string;
  locked_phone_number?: string;
  note?: string;
}
