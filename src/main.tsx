import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/components/AuthProvider";
import App from "./App";
import StatusPage from "@/pages/StatusPage";
import "./index.css";

/**
 * Public-only mode is enabled when:
 *   - hostname starts with "status." (production: status.vacademy.io), OR
 *   - VITE_PUBLIC_ONLY=true was set at build time, OR
 *   - the URL carries ?public=1 (local-dev preview escape hatch).
 *
 * In that mode the app mounts only <StatusPage /> — no router, no auth
 * provider, no admin pages reachable. Admin code is still present in the
 * bundle (static imports) but never executed because none of those
 * components mount.
 */
function isPublicOnly(): boolean {
  if (import.meta.env.VITE_PUBLIC_ONLY === "true") return true;
  if (typeof window === "undefined") return false;
  if (window.location.hostname.toLowerCase().startsWith("status.")) return true;
  if (new URLSearchParams(window.location.search).get("public") === "1") return true;
  return false;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPublicOnly() ? (
      <QueryClientProvider client={queryClient}>
        <StatusPage />
      </QueryClientProvider>
    ) : (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    )}
  </StrictMode>
);
