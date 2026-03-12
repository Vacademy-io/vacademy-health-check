import { createContext, useContext } from "react";
import type { DecodedToken } from "@/types/api";

export interface AuthContextValue {
  user: DecodedToken | null;
  isAuthenticated: boolean;
  login: (username: string, password: string, instituteId: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
