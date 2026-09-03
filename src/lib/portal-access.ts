/**
 * The portal is a thin client over the platform's own super-admin APIs, and
 * `login-root` happily authenticates *any* root user from *any* institute
 * (auth-service ignores the institute_id we send — see UserDetailsServiceImpl).
 * That let ~1300 institute admins in. Access is therefore an explicit
 * allowlist of portal accounts, not a role check.
 *
 * Override per environment with VITE_PORTAL_ALLOWED_USERS (comma separated).
 * Keep it in sync with PORTAL_ALLOWED_USERS in functions/[[route]].ts, which
 * enforces the same list on every proxied API call.
 */
const DEFAULT_ALLOWED_USERNAMES = "super_admin,support_vacademy";

export const ALLOWED_PORTAL_USERNAMES: readonly string[] = (
  import.meta.env.VITE_PORTAL_ALLOWED_USERS || DEFAULT_ALLOWED_USERNAMES
)
  .split(",")
  .map((name: string) => name.trim().toLowerCase())
  .filter(Boolean);

export const ACCESS_DENIED_MESSAGE =
  "Access denied. This account is not authorised for the Super Admin Portal.";

export function isAllowedPortalUsername(username: string | undefined | null): boolean {
  if (!username) return false;
  return ALLOWED_PORTAL_USERNAMES.includes(username.trim().toLowerCase());
}
