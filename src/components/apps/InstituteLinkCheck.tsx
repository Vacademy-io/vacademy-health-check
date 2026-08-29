import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstituteDetail } from "@/services/institutes-api";

/**
 * A verdict on the one field that decides whether a client ever sees any of this.
 *
 * `basics.instituteId` is what admin_core_service filters on when an institute admin opens
 * Settings &rarr; App Status. It is typed in by hand as a UUID, so the two ways it goes wrong are
 * silent: left blank, or a character out. Either way the app is registered, the checklist goes
 * green, the store listing goes live — and the client's own dashboard says "No app registered
 * yet" forever, with nobody on either side told why.
 *
 * So the id is resolved against admin-core and the answer is stated plainly. Blank is allowed
 * (internal and ops-only apps have no owning institute) and reads as a note, not an error; an id
 * that resolves to nothing reads as an error, because it is one.
 */
export function InstituteLinkCheck({ instituteId }: { instituteId: string | undefined }) {
  // Typed as string, but a record written before this field existed simply has no key — and those
  // legacy records are precisely the ones this change exists to rescue. TypeScript cannot see that,
  // and this page has no error boundary above it, so a bare .trim() here blanks the whole page.
  const id = (instituteId ?? "").trim();

  // The field is a controlled input, so without this the lookup fires once per keystroke and
  // every partial UUID comes back 404.
  const [settled, setSettled] = useState(id);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(id), 500);
    return () => clearTimeout(timer);
  }, [id]);

  const query = useInstituteDetail(settled);
  const pending = Boolean(settled) && (id !== settled || query.isPending || query.isFetching);

  if (!id) {
    return (
      <Note tone="warn" icon={Building2}>
        <strong className="font-medium text-foreground">Not linked to an institute.</strong> Nobody at the client will
        see this app under Settings &rarr; App Status — their dashboard reads the registry by institute id. Leave it
        blank only for internal or ops-only apps.
      </Note>
    );
  }

  if (pending) {
    return (
      <Note tone="muted" icon={Loader2} spin>
        Checking that institute id…
      </Note>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Note tone="bad" icon={TriangleAlert}>
        <strong className="font-medium text-foreground">No institute with this id.</strong> Nothing is broken here, but
        the client's own dashboard will show nothing at all — check the UUID for a typo.
      </Note>
    );
  }

  return (
    <Note tone="good" icon={CheckCircle2}>
      Linked to <strong className="font-medium text-foreground">{query.data.name}</strong>
      {query.data.subdomain ? ` (${query.data.subdomain})` : ""}. Their admins can see this app's status under
      Settings &rarr; App Status.
    </Note>
  );
}

const TONES = {
  muted: "border-border bg-muted/40 text-muted-foreground",
  warn: "border-amber-500/40 bg-amber-500/10 text-muted-foreground",
  bad: "border-destructive/40 bg-destructive/10 text-muted-foreground",
  good: "border-emerald-500/40 bg-emerald-500/10 text-muted-foreground",
} as const;

function Note({
  tone,
  icon: Icon,
  spin,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof Building2;
  spin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md border p-3 text-xs leading-relaxed", TONES[tone])}>
      <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", spin && "animate-spin")} />
      <span>{children}</span>
    </p>
  );
}
