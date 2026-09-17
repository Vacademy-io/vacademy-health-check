import { useMemo, useRef, useState } from "react";
import { Clapperboard, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUploadVideoToS3 } from "@/services/presign-upload";
import {
  useCreateTrainingVideo,
  useDeleteTrainingVideo,
  useTrainingVideos,
  useUpdateTrainingVideo,
  type TrainingVideoDto,
} from "@/services/training-videos-api";

export default function TrainingVideosAdminPage() {
  const videos = useTrainingVideos();
  const deleteVideo = useDeleteTrainingVideo();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingVideoDto | null>(null);

  const rows = videos.data ?? [];

  return (
    <div>
      <PageHeader
        title="Training Videos"
        description="Upload LMS training videos to S3 with a name, description and module path — institute admins watch them from the Training tab in their dashboard."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add video
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {videos.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No training videos yet"
              description="Add one so admins can learn the LMS module-by-module from their Training tab."
            />
          ) : (
            <div className="divide-y">
              {rows.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setEditing(v)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Clapperboard className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{v.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.modulePath.join(" → ")}
                        {v.description ? ` — ${v.description}` : ""}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add training video</DialogTitle>
            <DialogDescription>
              Upload the video to S3, then name it and place it in the module tree admins browse.
            </DialogDescription>
          </DialogHeader>
          <TrainingVideoForm onClose={() => setCreateOpen(false)} allVideos={rows} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit training video</DialogTitle>
            <DialogDescription>
              Replace the file, rename it, or move it somewhere else in the module tree.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <TrainingVideoForm video={editing} onClose={() => setEditing(null)} allVideos={rows} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Create/edit form. The video itself goes to S3 through media-service (PUBLIC visibility);
 * the module path is a 1–3 level breadcrumb (Module → Sub-module → Topic) whose suggestions
 * are harvested from the videos that already exist, so paths stay consistent and the admin
 * popup's tree doesn't fragment into near-duplicate branches.
 */
function TrainingVideoForm({
  video,
  onClose,
  allVideos,
}: {
  video?: TrainingVideoDto;
  onClose: () => void;
  allVideos: TrainingVideoDto[];
}) {
  const upload = useUploadVideoToS3();
  const create = useCreateTrainingVideo();
  const update = useUpdateTrainingVideo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileId, setFileId] = useState<string | null>(video?.fileId ?? null);
  const [fileUrl, setFileUrl] = useState(video?.fileUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [title, setTitle] = useState(video?.title ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [level1, setLevel1] = useState(video?.modulePath?.[0] ?? "");
  const [level2, setLevel2] = useState(video?.modulePath?.[1] ?? "");
  const [level3, setLevel3] = useState(video?.modulePath?.[2] ?? "");
  const [active, setActive] = useState(video?.active ?? true);

  const saving = upload.isPending || create.isPending || update.isPending;

  // Contiguous prefix of the three inputs — a gap ("LMS", "", "AI based course") would
  // otherwise produce a nonsense breadcrumb.
  const modulePath = useMemo(() => {
    const segments: string[] = [];
    for (const raw of [level1, level2, level3]) {
      const segment = raw.trim();
      if (!segment) break;
      segments.push(segment);
    }
    return segments;
  }, [level1, level2, level3]);

  // Datalist suggestions per level, narrowed by the levels chosen above it.
  const suggestions = useMemo(() => {
    const l1 = new Set<string>();
    const l2 = new Set<string>();
    const l3 = new Set<string>();
    const t1 = level1.trim();
    const t2 = level2.trim();
    for (const v of allVideos) {
      const path = v.modulePath ?? [];
      if (path[0]) l1.add(path[0]);
      if (path[1] && (!t1 || path[0] === t1)) l2.add(path[1]);
      if (path[2] && (!t1 || path[0] === t1) && (!t2 || path[1] === t2)) l3.add(path[2]);
    }
    return { l1: [...l1].sort(), l2: [...l2].sort(), l3: [...l3].sort() };
  }, [allVideos, level1, level2]);

  const onPickFile = async (file: File) => {
    setFileName(file.name);
    setProgress(0);
    try {
      const result = await upload.mutateAsync({
        file,
        onProgress: setProgress,
      });
      setFileId(result.id);
      setFileUrl(result.url);
    } catch {
      // upload.isError surfaces it below; dialog stays open for a retry.
    } finally {
      setProgress(null);
    }
  };

  const canSubmit = title.trim().length > 0 && fileUrl.length > 0 && modulePath.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      fileId,
      fileUrl,
      modulePath,
      active,
    };
    try {
      if (video) {
        await update.mutateAsync({ id: video.id, payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch {
      // surfaced via create/update.isError below; dialog stays open for a retry.
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Video file → S3 */}
        <div className="space-y-1.5">
          <Label>Video file</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <UploadCloud className="h-4 w-4 shrink-0" />
            {upload.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading to S3…
              </span>
            ) : fileName ? (
              <span className="truncate">{fileName}</span>
            ) : fileUrl ? (
              <span className="truncate">Current video — click to replace</span>
            ) : (
              <span>Click to upload a video file</span>
            )}
          </button>
          {progress !== null ? <Progress value={progress} className="h-1.5" /> : null}
          {upload.isError ? (
            <p className="text-xs text-destructive">Upload failed. Try again.</p>
          ) : null}
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Create an AI-based course in 5 minutes"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this video teaches — shown under the name in the admin popup."
            rows={3}
          />
        </div>

        {/* Module path */}
        <div className="space-y-1.5">
          <Label>Module path</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              list="training-path-l1"
              value={level1}
              onChange={(e) => setLevel1(e.target.value)}
              placeholder="Module — LMS"
            />
            <Input
              list="training-path-l2"
              value={level2}
              onChange={(e) => setLevel2(e.target.value)}
              placeholder="Sub-module — Course creation"
            />
            <Input
              list="training-path-l3"
              value={level3}
              onChange={(e) => setLevel3(e.target.value)}
              placeholder="Topic — AI based course"
            />
          </div>
          <datalist id="training-path-l1">
            {suggestions.l1.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="training-path-l2">
            {suggestions.l2.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="training-path-l3">
            {suggestions.l3.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">
            Where admins find this video:{" "}
            <span className="font-medium text-foreground">
              {modulePath.length ? modulePath.join(" → ") : "— pick at least a module"}
            </span>
            . Existing paths are suggested as you type so the tree stays tidy.
          </p>
        </div>

        {/* Active */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active — visible in the admin Training tab
        </label>
      </div>

      <DialogFooter>
        {create.isError || update.isError ? (
          <p className="mr-auto self-center text-xs text-destructive">Could not save. Try again.</p>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSubmit || saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {video ? "Save" : "Add video"}
        </Button>
      </DialogFooter>
    </>
  );
}
