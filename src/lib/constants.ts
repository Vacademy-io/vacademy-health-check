export const API_PREFIXES = {
  ADMIN_CORE: "/admin-core-service/super-admin/v1",
  AUTH: "/auth-service/super-admin/v1",
  AI: "/ai-service/super-admin/v1",
  MEDIA: "/media-service/super-admin/v1",
  STATUS_ADMIN: "/community-service/admin/v1/status",
  STATUS_PUBLIC: "/community-service/public/v1/status",
  SUPPORT: "/community-service/super-admin/v1/support",
  ONBOARDING_PUBLIC: "/community-service/public/v1/onboarding",
  PRICING_PUBLIC: "/community-service/public/v1/pricing",
  PRICING_ADMIN: "/community-service/super-admin/v1/pricing",
  ONBOARDING_ADMIN: "/community-service/super-admin/v1/onboarding",
  WIDGETS: "/community-service/super-admin/v1/dashboard-widgets",
  GUIDES: "/community-service/super-admin/v1/guides",
  ROADMAP: "/community-service/super-admin/v1/roadmap",
  /** App Registration & Store Management. Only used when VITE_APP_REGISTRY_REMOTE is on — see app-registry-store.ts. */
  APP_REGISTRY: "/community-service/super-admin/v1/app-registry",
} as const;

/** Lead tags an institute can carry (mirrors admin-core). Used for widget broadcast targeting. */
export const LEAD_TAGS = ["PROD", "LEAD", "TEST", "FREE_TRIAL"] as const;
export type LeadTag = (typeof LEAD_TAGS)[number];

export const AUTH_ENDPOINTS = {
  LOGIN: "/auth-service/v1/login-root",
  REFRESH: "/auth-service/v1/refresh-token",
} as const;

export const TOKEN_KEYS = {
  ACCESS: "accessToken",
  REFRESH: "refreshToken",
} as const;
