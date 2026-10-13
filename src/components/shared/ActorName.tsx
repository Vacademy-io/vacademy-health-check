import { useActorName } from "@/hooks/use-actor-name";

/**
 * Who made a change: the person's name, "You", "system", or a short "user a1f0c3d6…" when the id
 * cannot be resolved. The full id is always in the hover tooltip.
 */
export function ActorName({
  id,
  empty,
  className,
}: {
  id: string | null | undefined;
  /** Shown when there is no actor id (default "unknown"). */
  empty?: string;
  className?: string;
}) {
  const actor = useActorName(id, empty);
  return (
    <span className={className} title={actor.title}>
      {actor.label}
    </span>
  );
}
