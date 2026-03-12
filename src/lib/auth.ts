import Cookies from "js-cookie";
import { jwtDecode } from "jwt-decode";
import { TOKEN_KEYS, AUTH_ENDPOINTS } from "./constants";
import type { DecodedToken } from "@/types/api";

const COOKIE_OPTIONS: Cookies.CookieAttributes = {
  expires: 7,
  sameSite: "lax",
};

export function getToken(key: "accessToken" | "refreshToken"): string | null {
  return Cookies.get(key) || null;
}

export function setTokens(accessToken: string, refreshToken: string) {
  Cookies.set(TOKEN_KEYS.ACCESS, accessToken, COOKIE_OPTIONS);
  Cookies.set(TOKEN_KEYS.REFRESH, refreshToken, COOKIE_OPTIONS);
}

export function clearTokens() {
  Cookies.remove(TOKEN_KEYS.ACCESS);
  Cookies.remove(TOKEN_KEYS.REFRESH);
}

export function decodeToken(token: string): DecodedToken | null {
  try {
    return jwtDecode<DecodedToken>(token);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  return decoded.exp * 1000 < Date.now();
}

export function isSuperAdmin(token: string): boolean {
  const decoded = decodeToken(token);
  return decoded?.is_root_user === true;
}

export function getCurrentUser(): DecodedToken | null {
  const token = getToken("accessToken");
  if (!token || isTokenExpired(token)) return null;
  return decodeToken(token);
}

export async function login(
  username: string,
  password: string,
  instituteId: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(AUTH_ENDPOINTS.LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_name: username,
      password,
      client_name: "SUPER_ADMIN_PORTAL",
      institute_id: instituteId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Login failed");
  }

  const data = await res.json();
  return {
    accessToken: data.accessToken || data.access_token,
    refreshToken: data.refreshToken || data.refresh_token,
  };
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getToken("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await fetch(AUTH_ENDPOINTS.REFRESH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    const newAccess = data.accessToken || data.access_token;
    const newRefresh = data.refreshToken || data.refresh_token;
    setTokens(newAccess, newRefresh || refreshToken);
    return newAccess;
  } catch {
    clearTokens();
    return null;
  }
}

export function logout() {
  clearTokens();
  window.location.href = "/login";
}
