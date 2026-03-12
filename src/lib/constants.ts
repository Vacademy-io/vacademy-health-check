export const API_PREFIXES = {
  ADMIN_CORE: "/admin-core-service/super-admin/v1",
  AUTH: "/auth-service/super-admin/v1",
  AI: "/ai-service/super-admin/v1",
} as const;

export const AUTH_ENDPOINTS = {
  LOGIN: "/auth-service/v1/login-root",
  REFRESH: "/auth-service/v1/refresh-token",
} as const;

export const TOKEN_KEYS = {
  ACCESS: "accessToken",
  REFRESH: "refreshToken",
} as const;
