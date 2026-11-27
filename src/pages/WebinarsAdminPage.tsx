import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Trash2, Video } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WebinarForm } from "@/components/webinars/WebinarForm";
import { useDeleteWebinar, useWebinars, webinarPhase, type WebinarDto, type WebinarPhase } from "@/services/webinars-api";
import { errorMessage } from "@/lib/modules-catalog";

const GROUPS: { phase: WebinarPhase; label: string }[] = [
  { phase: "live", label: "Live now" },
  { phase: "upcoming", label: "Upcoming" },
  { phase: "past", label: "Past" },
];

/** Re-renders every 30 s so a webinar moves upcoming → live → past without a reload. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function when(w: WebinarDto): string {
  const start = new Date(w.startsAt);
  const end = new Date(w.endsAt);
  const day = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time(start)} – ${time(end)}`;
}

export default function WebinarsAdminPage() {
  const webinars = useWebinars();
  const remove = useDeleteWebinar();
  const now = useNow();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WebinarDto | null>(null);

  const rows = useMemo(() => webinars.data ?? [], [webinars.data]);
  const latest = rows[0]; // the API sorts newest start first
  const groups = GROUPS.map((g) => ({
    ...g,
    // Upcoming reads soonest first; live and past newest first.
    rows: rows.filter((w) => webinarPhase(w, now) === g.phase).sort((a, b) => (g.phase === "upcoming" ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt))),
  })).filter((g) => g.rows.length);

  return (
    <div>
      <PageHeader
        title="Webinars"
        description="Add each webinar here. Every institute admin sees it in the Webinars panel of their dashboard with a Join button, which turns into a red LIVE button while it runs. Add the recording afterwards for admins who missed it."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add webinar
          </Button>
        }
      />

      {remove.isError ? (
        <p className="mb-3 text-sm text-destructive">{errorMessage(remove.error, "Could not delete the webinar. Try again.")}</p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {webinars.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : webinars.isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">{errorMessage(webinars.error, "Could not load webinars.")}</p>
              <Button variant="outline" size="sm" onClick={() => webinars.refetch()}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No webinars yet" description="Add the next one so institute admins can join it from their dashboard." />
          ) : (
            groups.map((g) => (
              <div key={g.phase}>
                <p className="flex items-center gap-2 bg-muted/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.phase === "live" ? <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> : null}
                  {g.label}
                  <span className="font-normal">{g.rows.length}</span>
                </p>
                <div className="divide-y">
                  {g.rows.map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <button type="button" onClick={() => setEditing(w)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Video className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{w.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {when(w)}
                            {g.phase === "live" ? <Badge variant="destructive">LIVE</Badge> : null}
                            {!w.active ? <Badge variant="outline">Hidden</Badge> : null}
                            {g.phase !== "past" && !w.joinUrl ? (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[11px] text-amber-800">No join link yet</span>
                            ) : null}
                            {g.phase === "past" && !w.recordingUrl ? (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[11px] text-amber-800">No recording yet</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {w.joinUrl && g.phase !== "past" ? (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={w.joinUrl} target="_blank" rel="noopener noreferrer" title="Open join link">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setEditing(w)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => {
                            if (confirm(`Delete "${w.title}"? Admins will no longer see it.`)) remove.mutate(w.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add webinar</DialogTitle>
            <DialogDescription>Admins see it in their Webinars panel with a Join button.</DialogDescription>
          </DialogHeader>
          {createOpen ? <WebinarForm latest={latest} onClose={() => setCreateOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit webinar</DialogTitle>
            <DialogDescription>Change the time or join link, or add the recording once it is over.</DialogDescription>
          </DialogHeader>
          {editing ? <WebinarForm key={editing.id} webinar={editing} onClose={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
