/**
 * Portal access allowlist.
 *
 * auth-service's /login-root authenticates any root user from any institute
 * (the institute_id we send is ignored on lookup), so a valid admin token from
 * any Vacademy workspace is a valid token here. The UI checks this list too,
 * but the UI is only a suggestion — this proxy is the choke point every
 * super-admin API call has to pass through, so it enforces the same list.
 *
 * Override with the PORTAL_ALLOWED_USERS environment variable in the Cloudflare
 * Pages project (comma separated). Keep it in sync with
 * VITE_PORTAL_ALLOWED_USERS, which the frontend build reads.
 */
const DEFAULT_ALLOWED_USERS = "super_admin,support_vacademy";

const LOGIN_PATH = "/auth-service/v1/login-root";
const REFRESH_PATH = "/auth-service/v1/refresh-token";

function allowedUsers(env) {
  return new Set(
    String((env && env.PORTAL_ALLOWED_USERS) || DEFAULT_ALLOWED_USERS)
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Payload only — the signature is not verified here and does not need to be.
 * backend-stage rejects anything it did not sign, so a forged payload buys
 * nothing; this is a filter in front of that, not a replacement for it.
 */
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function denied(reason) {
  return new Response(
    JSON.stringify({
      status: "error",
      message: "Access denied. This account is not authorised for the Super Admin Portal.",
      reason,
    }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  const SERVICES = [
    "/auth-service",
    "/admin-core-service",
    "/media-service",
    "/assessment-service",
    "/notification-service",
    "/ai-service",
    "/community-service",
    "/analytics-api"
  ];

  // Check if the current path starts with any of the service prefixes
  const isServiceRequest = SERVICES.some(prefix => path.startsWith(prefix));

  if (isServiceRequest) {
    const allowed = allowedUsers(context.env);

    const method = context.request.method.toUpperCase();
    const inspectsBody =
      (path === LOGIN_PATH || path === REFRESH_PATH) &&
      method !== "GET" &&
      method !== "HEAD" &&
      method !== "OPTIONS";

    if (inspectsBody) {
      // Inspect a CLONE so the original body stream is left untouched and the
      // request forwarded below stays byte-identical to what the browser sent.
      const raw = await context.request.clone().text();
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      if (path === LOGIN_PATH) {
        // Refuse before auth-service ever sees it, so a token for a
        // non-portal account is never minted through this domain.
        const username = parsed && (parsed.user_name || parsed.username);
        if (!username || !allowed.has(String(username).trim().toLowerCase())) {
          return denied("username_not_allowed");
        }
      } else {
        // The refresh token is a JWT whose subject is the username.
        const claims = decodeJwtPayload(
          (parsed && (parsed.refresh_token || parsed.token)) || ""
        );
        const username = claims && (claims.username || claims.sub);
        if (!username || !allowed.has(String(username).trim().toLowerCase())) {
          return denied("username_not_allowed");
        }
      }
    } else {
      // Every authenticated call. Requests with no bearer token fall through
      // untouched — the public status / onboarding / pricing pages need them,
      // and the backend guards those endpoints itself.
      const auth = context.request.headers.get("Authorization") || "";
      if (auth.toLowerCase().startsWith("bearer ")) {
        const claims = decodeJwtPayload(auth.slice(7).trim());
        const username = claims && claims.username;
        if (!username || !allowed.has(String(username).trim().toLowerCase())) {
          return denied("token_not_allowed");
        }
      }
    }

    const targetUrl = `https://backend-stage.vacademy.io${path}${url.search}`;
    
    // Create new headers base on the original request
    const newHeaders = new Headers(context.request.headers);
    
    // 'changeOrigin': true behavior - spoof the Host and Origin
    newHeaders.set('Host', 'backend-stage.vacademy.io');
    newHeaders.set('Origin', 'https://backend-stage.vacademy.io');
    newHeaders.set('Referer', 'https://backend-stage.vacademy.io/');
    
    // Create a new request with the updated info
    const newRequest = new Request(targetUrl, {
        method: context.request.method,
        headers: newHeaders,
        body: context.request.body,
        redirect: 'follow'
    });

    try {
        const response = await fetch(newRequest);
        return response;
    } catch (e) {
        return new Response(`Proxy Error: ${e.message}`, { status: 500 });
    }
  }

  // Not a service request, usually a static asset or SPA route
  return context.next();
}
