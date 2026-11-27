import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DialogFooter } from "@/components/ui/dialog";
import { useUploadVideoToS3 } from "@/services/presign-upload";
import { useCreateWebinar, useUpdateWebinar, type WebinarDto } from "@/services/webinars-api";
import { errorMessage } from "@/lib/modules-catalog";

const MINUTE = 60 * 1000;
const FRIDAY = 5;

/** "2026-12-04T17:00" in the browser's own time zone — what <input type="datetime-local"> takes. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The coming Friday (today if it is Friday and that time is still ahead) at the latest webinar's time of day. */
function nextFridayLike(latest: WebinarDto | undefined): string {
  if (!latest) return "";
  const template = new Date(latest.startsAt);
  const d = new Date();
  d.setHours(template.getHours(), template.getMinutes(), 0, 0);
  while (d.getDay() !== FRIDAY || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return toLocalInput(d);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

/** The browser's encoded form ("a b" → "a%20b"), which is what the API accepts. "" stays "". */
function encodedLink(value: string): string {
  const trimmed = value.trim();
  return trimmed ? new URL(trimmed).href : "";
}

/**
 * Create/edit a webinar. Times are entered in this browser's time zone and stored as UTC, so every
 * institute admin sees them in their own zone. Join link and recording are both optional — add the
 * link once it exists and the recording after the webinar.
 */
export function WebinarForm({
  webinar,
  latest,
  onClose,
}: {
  webinar?: WebinarDto;
  /** Most recent webinar — a new one starts from its time of day and length. */
  latest?: WebinarDto;
  onClose: () => void;
}) {
  const create = useCreateWebinar();
  const update = useUpdateWebinar();
  const upload = useUploadVideoToS3();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lengthOf = (w?: WebinarDto) => (w ? Math.round((Date.parse(w.endsAt) - Date.parse(w.startsAt)) / MINUTE) : 60);

  const [title, setTitle] = useState(webinar?.title ?? "");
  const [description, setDescription] = useState(webinar?.description ?? "");
  const [startsAt, setStartsAt] = useState(webinar ? toLocalInput(new Date(webinar.startsAt)) : nextFridayLike(latest));
  const [minutes, setMinutes] = useState(String(lengthOf(webinar ?? latest)));
  const [joinUrl, setJoinUrl] = useState(webinar?.joinUrl ?? "");
  const [recordingUrl, setRecordingUrl] = useState(webinar?.recordingUrl ?? "");
  const [recordingFileId, setRecordingFileId] = useState<string | null>(webinar?.recordingFileId ?? null);
  const [recordingName, setRecordingName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState(webinar?.active ?? true);
  const [liveScheduleId, setLiveScheduleId] = useState(webinar?.liveScheduleId ?? "");

  const duration = Number(minutes);
  const start = startsAt ? new Date(startsAt) : null;
  const joinOk = !joinUrl.trim() || isHttpUrl(joinUrl.trim());
  const recordingOk = !recordingUrl.trim() || isHttpUrl(recordingUrl.trim());
  const durationOk = Number.isFinite(duration) && duration >= 5 && duration <= 720;
  const scheduleOk = !/\s/.test(liveScheduleId.trim());
  const canSubmit =
    !!title.trim() && !!start && !Number.isNaN(start.getTime()) && durationOk && joinOk && recordingOk && scheduleOk;
  const saving = create.isPending || update.isPending || upload.isPending;
  const saveError = create.error ?? update.error;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const onPickFile = async (file: File) => {
    setRecordingName(file.name);
    setProgress(0);
    try {
      const result = await upload.mutateAsync({ file, onProgress: setProgress });
      setRecordingFileId(result.id);
      setRecordingUrl(result.url);
    } catch {
      // upload.isError surfaces it below; the dialog stays open for a retry.
    } finally {
      setProgress(null);
    }
  };

  const submit = async () => {
    if (!canSubmit || !start) return;
    const payload = {
      title: title.trim(),
      description: description.trim(),
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * MINUTE).toISOString(),
      // canSubmit already checked both parse as http(s) links.
      joinUrl: encodedLink(joinUrl),
      recordingUrl: encodedLink(recordingUrl),
      // Set by an upload; typing a link clears it (a pasted link has no media-service file).
      recordingFileId,
      liveScheduleId: liveScheduleId.trim(),
      active,
    };
    try {
      if (webinar) await update.mutateAsync({ id: webinar.id, payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch {
      // shown below; the dialog stays open for a retry.
    }
  };

  return (
    <>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="webinar-title">Title</Label>
          <Input id="webinar-title" maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Run your admissions on autopilot" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webinar-description">What it covers (optional)</Label>
          <Textarea
            id="webinar-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One or two lines admins read before deciding to join."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1.5">
            <Label htmlFor="webinar-start">Starts at</Label>
            <Input id="webinar-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Your time ({zone}). Admins see it in their own time zone.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="webinar-minutes">Length (minutes)</Label>
            <Input id="webinar-minutes" type="number" min={5} max={720} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            {!durationOk ? <p className="text-xs text-destructive">5 to 720 minutes.</p> : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webinar-join">Join link</Label>
          <Input id="webinar-join" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} placeholder="https://…" />
          {joinOk ? (
            <p className="text-xs text-muted-foreground">
              Every institute admin gets a Join button for this link. It turns into a red LIVE button while the webinar runs. Leave empty until you have it.
            </p>
          ) : (
            <p className="text-xs text-destructive">Paste the full link, starting with https://</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webinar-schedule">Live class schedule ID (one-click join)</Label>
          <Input
            id="webinar-schedule"
            value={liveScheduleId}
            onChange={(e) => setLiveScheduleId(e.target.value)}
            placeholder="Schedule id (UUID)"
          />
          {scheduleOk ? (
            <p className="text-xs text-muted-foreground">
              The schedule of this webinar's live class in the institute that runs the webinars. Admins of PROD institutes then
              join it in one click from their dashboard, in their own name, and their attendance is recorded. Everyone else
              uses the join link above.
            </p>
          ) : (
            <p className="text-xs text-destructive">Paste just the id, without spaces.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webinar-recording">Recording (after the webinar)</Label>
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
            ) : recordingName ? (
              <span className="truncate">{recordingName}</span>
            ) : (
              <span>Upload the recording (MP4 preferred), or paste a link below</span>
            )}
          </button>
          {progress !== null ? <Progress value={progress} className="h-1.5" /> : null}
          {upload.isError ? <p className="text-xs text-destructive">Upload failed. Try again.</p> : null}
          <Input
            id="webinar-recording"
            value={recordingUrl}
            onChange={(e) => {
              setRecordingUrl(e.target.value);
              setRecordingFileId(null);
              setRecordingName("");
            }}
            placeholder="https://… (YouTube, Drive, S3 link)"
          />
          {!recordingOk ? <p className="text-xs text-destructive">Paste the full link, starting with https://</p> : null}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Show to institute admins in their Webinars panel
        </label>
      </div>

      <DialogFooter>
        {saveError ? <p className="mr-auto self-center text-xs text-destructive">{errorMessage(saveError, "Could not save. Try again.")}</p> : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSubmit || saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {webinar ? "Save" : "Add webinar"}
        </Button>
      </DialogFooter>
    </>
  );
}
