import { useState, useCallback, useEffect, type ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "@/hooks/use-auth";
import {
  login as authLogin,
  logout as authLogout,
  getCurrentUser,
  setTokens,
  isSuperAdmin,
  getToken,
} from "@/lib/auth";
import type { DecodedToken } from "@/types/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DecodedToken | null>(() => getCurrentUser());

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const login = useCallback(async (username: string, password: string, instituteId: string) => {
    const tokens = await authLogin(username, password, instituteId);

    if (!isSuperAdmin(tokens.accessToken)) {
      throw new Error("Access denied. Super admin privileges required.");
    }

    setTokens(tokens.accessToken, tokens.refreshToken);

    // Small delay for cookie propagation
    await new Promise((r) => setTimeout(r, 50));

    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    authLogout();
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user && !!getToken("accessToken"),
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
