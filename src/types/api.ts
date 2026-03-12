// Pagination wrappers
export interface SuperAdminPageResponse<T> {
  content: T[];
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
}

export interface AIPaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// Platform Dashboard
export interface PlatformDashboardDTO {
  total_institutes: number;
  total_students: number;
  total_courses: number;
  total_batches: number;
  institutes_created_this_month: number;
  students_enrolled_this_month: number;
}

// Institutes
export type LeadTag = "PROD" | "LEAD" | "TEST" | "FREE_TRIAL";

export const LEAD_TAG_OPTIONS: LeadTag[] = ["PROD", "LEAD", "TEST", "FREE_TRIAL"];

export interface InstituteListItemDTO {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  type: string;
  logo_file_id: string | null;
  subdomain: string;
  created_at: string;
  student_count: number;
  course_count: number;
  batch_count: number;
  lead_tag: LeadTag | null;
}

export interface InstituteDetailSummaryDTO {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  type: string;
  logo_file_id: string | null;
  subdomain: string;
  created_at: string;
  student_count: number;
  course_count: number;
  batch_count: number;
  subject_count: number;
  level_count: number;
  profile_completion_percentage: number;
  credit_balance: Record<string, unknown>;
  lead_tag: LeadTag | null;
}

// Courses
export interface InstituteCourseDTO {
  id: string;
  package_name: string;
  status: string;
  thumbnail_file_id: string | null;
  created_at: string;
  chapter_count: number;
  student_count: number;
  batch_count: number;
}

// Users
export interface InstituteUserDTO {
  user_id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  roles: string;
  status: string;
  last_login_time: string | null;
  created_at: string;
}

// Sessions
export interface InstituteSessionDTO {
  session_id: string;
  user_id: string;
  device_type: string;
  ip_address: string;
  is_active: boolean;
  login_time: string;
  last_activity_time: string;
  logout_time: string | null;
  session_duration_minutes: number;
}

// Active Users
export interface InstituteActiveCount {
  institute_id: string;
  active_count: number;
}

export interface CrossInstituteActiveUsersDTO {
  total_currently_active: number;
  per_institute: InstituteActiveCount[];
}

// Activity Trends
export interface DailyTrend {
  date: string;
  unique_users: number;
  total_sessions: number;
  total_api_calls: number;
}

export interface PlatformActivityTrendDTO {
  total_unique_users: number;
  total_sessions: number;
  total_api_calls: number;
  daily_trends: DailyTrend[];
}

// Credits
export interface InstituteCreditItem {
  institute_id: string;
  total_credits: number;
  used_credits: number;
  current_balance: number;
  is_low_balance: boolean;
  created_at: string;
  updated_at: string;
}

export interface GrantCreditsRequest {
  amount: number;
  description: string;
}

// AI Usage
export interface UsageByTypeItem {
  request_type: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface UsageByDayItem {
  date: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface TopInstituteUsage {
  institute_id: string;
  total_tokens: number;
  total_cost: number;
  request_count: number;
}

export interface PlatformUsageSummary {
  total_tokens: number;
  total_cost: number;
  total_requests: number;
  usage_by_type: UsageByTypeItem[];
  usage_by_day: UsageByDayItem[];
  top_institutes: TopInstituteUsage[];
}

// JWT Token
export interface DecodedToken {
  fullname: string;
  user: string;
  email: string;
  is_root_user: boolean;
  username: string;
  sub: string;
  iat: number;
  exp: number;
  authorities?: Record<string, { permissions: string[]; roles: string[] }>;
}
