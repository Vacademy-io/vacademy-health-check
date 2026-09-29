import { useMemo, useState } from "react";
import { AlertTriangle, Clapperboard, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteTrainingVideo, useTrainingVideos, type TrainingVideoDto } from "@/services/training-videos-api";
import { parseTitle } from "@/lib/training-search";
import { TrainingPublishingGuide } from "@/components/training/TrainingPublishingGuide";
import { TrainingSearchPreview } from "@/components/training/TrainingSearchPreview";
import { TrainingVideoForm } from "@/components/training/TrainingVideoForm";
import { DEFAULT_MODULES, qualityIssues, stepOf } from "@/components/training/training-quality";

interface SectionGroup {
  module: string;
  section: string;
  rows: TrainingVideoDto[];
}

/** Module → section → step order: the same shape institute admins browse. */
function groupRows(rows: TrainingVideoDto[]): SectionGroup[] {
  const map = new Map<string, SectionGroup>();
  for (const v of rows) {
    const module = v.modulePath[0] || "Other";
    const section = v.modulePath[1] || "(no section)";
    const key = `${module}|${section}`;
    if (!map.has(key)) map.set(key, { module, section, rows: [] });
    map.get(key)!.rows.push(v);
  }
  const rank = (m: string) => {
    const i = DEFAULT_MODULES.indexOf(m.toUpperCase());
    return i === -1 ? DEFAULT_MODULES.length : i;
  };
  const groups = [...map.values()];
  for (const g of groups)
    g.rows.sort((a, b) => (stepOf(a) ?? 1e9) - (stepOf(b) ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
  return groups.sort((a, b) => rank(a.module) - rank(b.module) || a.module.localeCompare(b.module) || b.rows.length - a.rows.length);
}

export default function TrainingVideosAdminPage() {
  const videos = useTrainingVideos();
  const deleteVideo = useDeleteTrainingVideo();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingVideoDto | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const rows = useMemo(() => videos.data ?? [], [videos.data]);
  const issuesById = useMemo(() => new Map(rows.map((v) => [v.id, qualityIssues(v, rows)])), [rows]);
  const needAttention = rows.filter((v) => issuesById.get(v.id)?.length).length;
  const groups = useMemo(
    () => groupRows(onlyIssues ? rows.filter((v) => issuesById.get(v.id)?.length) : rows),
    [rows, issuesById, onlyIssues]
  );

  return (
    <div>
      <PageHeader
        title="Training Videos"
        description="Publish training videos for institute admins — LMS, CRM and more. They browse them by module → section → step, or search in their own words, from the Training popup in their dashboard."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add video
          </Button>
        }
      />

      <TrainingPublishingGuide />
      {rows.length ? <TrainingSearchPreview rows={rows} /> : null}

      <Card>
        <CardContent className="p-0">
          {videos.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No training videos yet"
              description="Add one so admins can learn the platform module-by-module from their Training popup."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {rows.length} videos in {new Set(rows.map((r) => `${r.modulePath[0]}|${r.modulePath[1]}`)).size} sections
                </p>
                {needAttention ? (
                  <Button variant={onlyIssues ? "default" : "outline"} size="sm" onClick={() => setOnlyIssues((v) => !v)}>
                    <AlertTriangle className="mr-1 h-4 w-4" />
                    {onlyIssues ? "Show all" : `${needAttention} need attention`}
                  </Button>
                ) : null}
              </div>
              {groups.map((g, gi) => (
                <div key={`${g.module}|${g.section}`}>
                  {gi === 0 || groups[gi - 1]!.module !== g.module ? (
                    <p className="bg-muted/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.module}</p>
                  ) : null}
                  <p className="flex items-center gap-2 px-4 pb-1 pt-3 text-sm font-semibold">
                    {g.section}
                    <span className="text-xs font-normal text-muted-foreground">{g.rows.length}</span>
                  </p>
                  <div className="divide-y">
                    {g.rows.map((v) => {
                      const issues = issuesById.get(v.id) ?? [];
                      const step = stepOf(v);
                      return (
                        <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <button type="button" onClick={() => setEditing(v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                              {step ?? <Clapperboard className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{parseTitle(v.title).title}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                {(v.keywords ?? []).slice(0, 5).map((k) => (
                                  <span key={k} className="rounded-full bg-muted px-2 py-px text-[11px] text-muted-foreground">
                                    {k}
                                  </span>
                                ))}
                                {(v.keywords?.length ?? 0) > 5 ? (
                                  <span className="text-[11px] text-muted-foreground">+{(v.keywords?.length ?? 0) - 5}</span>
                                ) : null}
                                {issues.map((i) => (
                                  <span
                                    key={i.label}
                                    title={i.hint}
                                    className="rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[11px] text-amber-800"
                                  >
                                    {i.label}
                                  </span>
                                ))}
                              </span>
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            {!v.active ? <Badge variant="outline">Inactive</Badge> : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete "${v.title}"?`)) deleteVideo.mutate(v.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add training video</DialogTitle>
            <DialogDescription>Upload the video, then tell admins where it lives and how they'd ask for it.</DialogDescription>
          </DialogHeader>
          <TrainingVideoForm onClose={() => setCreateOpen(false)} allVideos={rows} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit training video</DialogTitle>
            <DialogDescription>Replace the file, rename it, move it, or tune its keywords.</DialogDescription>
          </DialogHeader>
          {editing ? <TrainingVideoForm key={editing.id} video={editing} onClose={() => setEditing(null)} allVideos={rows} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
