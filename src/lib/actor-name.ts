/**
 * Who did it — turns the raw actor ids the backend stores (mode_updated_by, actor_user_id,
 * updated_by) into something a person can read. Pure and dependency-free so `npm test` can
 * import it directly.
 *
 *   null / blank            → `empty` (default "unknown")
 *   "system"                → "system"
 *   the signed-in user's id → "You"
 *   an id with a known name → that name
 *   anything else           → "user a1f0c3d6…"
 *
 * `title` always carries the full id (plus the name, when known) for the hover tooltip.
 */

export type ActorKind = "none" | "system" | "self" | "named" | "unresolved";

export interface ActorLabel {
  kind: ActorKind;
  label: string;
  /** Full id (and name when known) for a tooltip; absent when there is no id. */
  title?: string;
}

export interface FormatActorOptions {
  /** user id → display name, from whatever resolver is available. */
  names?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /** The signed-in portal user's id (the access token's `user` claim). */
  currentUserId?: string | null;
  /** Label when there is no actor id at all. */
  empty?: string;
}

const SHORT_ID_LENGTH = 8;

export function shortActorId(id: string): string {
  return id.length > SHORT_ID_LENGTH + 1 ? `${id.slice(0, SHORT_ID_LENGTH)}…` : id;
}

export function isSystemActor(id: string | null | undefined): boolean {
  return typeof id === "string" && id.trim().toLowerCase() === "system";
}

function nameOf(names: FormatActorOptions["names"], id: string): string | null {
  if (!names) return null;
  const raw = names instanceof Map ? names.get(id) : (names as Readonly<Record<string, string>>)[id];
  const name = typeof raw === "string" ? raw.trim() : "";
  return name || null;
}

export function formatActor(id: string | null | undefined, opts: FormatActorOptions = {}): ActorLabel {
  const actor = typeof id === "string" ? id.trim() : "";
  if (!actor) return { kind: "none", label: opts.empty ?? "unknown" };
  if (isSystemActor(actor)) return { kind: "system", label: "system", title: "Changed by the platform itself" };

  const name = nameOf(opts.names, actor);
  if (opts.currentUserId && actor === opts.currentUserId.trim()) {
    return { kind: "self", label: "You", title: name ? `${name} · ${actor}` : actor };
  }
  if (name) return { kind: "named", label: name, title: actor };
  return { kind: "unresolved", label: `user ${shortActorId(actor)}`, title: actor };
}
