import { useState, useCallback, useEffect, type ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "@/hooks/use-auth";
import {
  login as authLogin,
  logout as authLogout,
  getCurrentUser,
  setTokens,
  isAllowedPortalToken,
  discardDisallowedToken,
  getToken,
} from "@/lib/auth";
import { ACCESS_DENIED_MESSAGE } from "@/lib/portal-access";
import type { DecodedToken } from "@/types/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DecodedToken | null>(() => getCurrentUser());

  useEffect(() => {
    // A token for a non-portal account (or one left over from a previous
    // allowlist) is dropped here rather than during render.
    discardDisallowedToken();
    setUser(getCurrentUser());
  }, []);

  const login = useCallback(async (username: string, password: string, instituteId: string) => {
    const tokens = await authLogin(username, password, instituteId);

    // Credentials being valid platform-wide is not enough — the account has to
    // be one of the portal accounts (see @/lib/portal-access).
    if (!isAllowedPortalToken(tokens.accessToken)) {
      throw new Error(ACCESS_DENIED_MESSAGE);
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
