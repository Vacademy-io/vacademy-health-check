import { useContext, useMemo } from "react";
import { AuthContext } from "@/hooks/use-auth";
import { getCurrentUser } from "@/lib/auth";
import { formatActor, isSystemActor, type ActorLabel } from "@/lib/actor-name";
import { useUserName } from "@/services/user-names-api";

/** The signed-in portal user's id — the access token's `user` claim. */
export function useCurrentUserId(): string | null {
  const auth = useContext(AuthContext);
  return auth?.user?.user ?? getCurrentUser()?.user ?? null;
}

/** Readable label (+ tooltip) for an actor id; see formatActor for the rules. */
export function useActorName(id: string | null | undefined, empty?: string): ActorLabel {
  const currentUserId = useCurrentUserId();
  const actor = id?.trim() || null;
  const { data: name } = useUserName(actor, !!actor && !isSystemActor(actor));
  return useMemo(
    () => formatActor(actor, { names: actor && name ? { [actor]: name } : undefined, currentUserId, empty }),
    [actor, name, currentUserId, empty]
  );
}
