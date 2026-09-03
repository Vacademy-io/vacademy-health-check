/**
 * Who may use this portal is decided ENTIRELY by the Cloudflare Worker in
 * functions/[[route]].ts, from the PORTAL_ALLOWED_USERS secret. Deliberately no
 * copy of that list lives here: this file ships to the browser, so anything in
 * it is public, and a second copy would drift out of sync with the one that
 * actually enforces.
 *
 * The UI therefore never decides access — it only recognises the proxy saying no.
 */

/** `reason` values the proxy sends with its 403. */
export const PORTAL_DENIAL_REASONS = [
  "username_not_allowed",
  "token_not_allowed",
  "allowlist_not_configured",
] as const;

export const ACCESS_DENIED_MESSAGE =
  "Access denied. This account is not authorised for the Super Admin Portal.";

/**
 * True only for *our* 403, never for a backend permission error — otherwise a
 * routine 403 from any API would sign the user out.
 */
export function isPortalDenial(body: unknown): boolean {
  if (!body) return false;
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return false;
    }
  }
  const reason = (parsed as { reason?: string } | null)?.reason;
  return (
    typeof reason === "string" &&
    (PORTAL_DENIAL_REASONS as readonly string[]).includes(reason)
  );
}

/** Pulls the human-readable message out of the proxy's JSON error body. */
export function portalDenialMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    /* not our JSON — fall through */
  }
  return body || "Login failed";
}
