import { useMemo, useRef, useState } from "react";
import { Info, Loader2, Search, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DialogFooter } from "@/components/ui/dialog";
import { useUploadVideoToS3 } from "@/services/presign-upload";
import {
  useCreateTrainingVideo,
  useUpdateTrainingVideo,
  type TrainingVideoDto,
} from "@/services/training-videos-api";
import { buildLibrary, createSearchIndex, parseTitle, parseTopics } from "@/lib/training-search";
import { KeywordInput } from "./KeywordInput";
import { DEFAULT_MODULES, understoodAutomatically } from "./training-quality";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const DRAFT_ID = "__draft__";

/**
 * Create/edit form. The video goes to S3 through media-service (PUBLIC visibility); everything
 * else shapes how admins find it in their Training popup — see TrainingPublishingGuide.
 *
 * Opening an older video tidies it up front: a "3. " prefix in the name moves to Step, and a
 * 3rd path level that only repeats the name is cleared. Nothing changes until Save.
 */
export function TrainingVideoForm({
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

  // One-time tidy of legacy data, computed from the video being edited.
  const [initial] = useState(() => {
    const parsed = parseTitle(video?.title ?? "");
    const moveStep = !!video && !video.sortOrder && parsed.step != null;
    const l3 = video?.modulePath?.[2] ?? "";
    const clearL3 =
      !!l3 &&
      !!parsed.title &&
      (squash(parseTitle(l3).title).includes(squash(parsed.title)) || squash(parsed.title).includes(squash(parseTitle(l3).title)));
    return {
      title: moveStep ? parsed.title : (video?.title ?? ""),
      step: video?.sortOrder ? String(video.sortOrder) : moveStep ? String(parsed.step) : "",
      level3: clearL3 ? "" : l3,
      notes: [
        moveStep ? `Moved “${parsed.step}.” from the name into Step.` : null,
        clearL3 ? "Cleared the 3rd path level — it only repeated the name." : null,
      ].filter((n): n is string => !!n),
    };
  });

  const [fileId, setFileId] = useState<string | null>(video?.fileId ?? null);
  const [fileUrl, setFileUrl] = useState(video?.fileUrl ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(video?.description ?? "");
  const [level1, setLevel1] = useState(video?.modulePath?.[0] ?? "");
  const [level2, setLevel2] = useState(video?.modulePath?.[1] ?? "");
  const [level3, setLevel3] = useState(initial.level3);
  const [step, setStep] = useState(initial.step);
  const [keywords, setKeywords] = useState<string[]>(video?.keywords ?? []);
  const [active, setActive] = useState(video?.active ?? true);
  const [testQuery, setTestQuery] = useState("");

  const saving = upload.isPending || create.isPending || update.isPending;

  // Contiguous prefix of the three inputs — a gap ("LMS", "", "Webinars") would be a nonsense path.
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
    const l1 = new Set<string>(DEFAULT_MODULES);
    const l2 = new Set<string>();
    const l3 = new Set<string>();
    const t1 = level1.trim();
    const t2 = level2.trim();
    for (const v of allVideos) {
      const path = v.modulePath ?? [];
      if (path[0]) l1.add(path[0]);
      if (path[1] && (!t1 || path[0] === t1)) l2.add(path[1]);
      if (path[2] && path[0] === t1 && path[1] === t2 && squash(path[2]) !== squash(parseTitle(v.title).title)) l3.add(path[2]);
    }
    return { l1: [...l1].sort(), l2: [...l2].sort(), l3: [...l3].sort() };
  }, [allVideos, level1, level2]);

  const topics = parseTopics(description);
  const stepNumber = Number.parseInt(step, 10);
  const titlePrefixStep = parseTitle(title).step;
  const understood = understoodAutomatically(`${title} ${description}`, keywords).slice(0, 16);

  // "If an admin types X, where does this video land?" — same engine as the admin popup.
  const draftRank = useMemo(() => {
    if (!testQuery.trim() || !title.trim() || !modulePath.length) return null;
    const others = allVideos.filter((v) => v.active && v.id !== video?.id);
    const draft = {
      id: DRAFT_ID,
      title: title.trim(),
      description: description.trim() || null,
      fileUrl,
      modulePath,
      keywords,
      sortOrder: Number.isFinite(stepNumber) && stepNumber > 0 ? stepNumber : null,
      createdAt: video?.createdAt ?? new Date().toISOString(),
    };
    const outcome = createSearchIndex(buildLibrary([...others, draft])).search(testQuery, { typing: false });
    const rank = outcome.results.findIndex((r) => r.video.id === DRAFT_ID);
    return { rank, total: outcome.results.length, top: outcome.results[0]?.video.title };
  }, [testQuery, title, description, fileUrl, modulePath, keywords, stepNumber, allVideos, video]);

  const onPickFile = async (file: File) => {
    setFileName(file.name);
    setProgress(0);
    try {
      const result = await upload.mutateAsync({ file, onProgress: setProgress });
      setFileId(result.id);
      setFileUrl(result.url);
    } catch {
      // upload.isError surfaces it below; dialog stays open for a retry.
    } finally {
      setProgress(null);
    }
  };

  const canSubmit = title.trim().length > 0 && fileUrl.length > 0 && modulePath.length >= 2;

  const submit = async () => {
    if (!canSubmit) return;
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      fileId,
      fileUrl,
      modulePath,
      active,
      keywords,
      // 0 tells the API "no step" (it stores null).
      sortOrder: Number.isFinite(stepNumber) && stepNumber > 0 ? stepNumber : 0,
    };
    try {
      if (video) await update.mutateAsync({ id: video.id, payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch {
      // surfaced via create/update.isError below; dialog stays open for a retry.
    }
  };

  return (
    <>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {initial.notes.length ? (
          <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Tidied this video for the new Training popup — Save to apply:</p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {initial.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

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
              <span>Click to upload a video file (MP4 preferred — .mov files are much larger)</span>
            )}
          </button>
          {progress !== null ? <Progress value={progress} className="h-1.5" /> : null}
          {upload.isError ? <p className="text-xs text-destructive">Upload failed. Try again.</p> : null}
        </div>

        {/* Where it lives */}
        <div className="space-y-1.5">
          <Label>Where admins find it</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input list="training-path-l1" value={level1} onChange={(e) => setLevel1(e.target.value)} placeholder="Module — LMS / CRM" />
            <Input list="training-path-l2" value={level2} onChange={(e) => setLevel2(e.target.value)} placeholder="Section — Live Sessions" />
            <Input list="training-path-l3" value={level3} onChange={(e) => setLevel3(e.target.value)} placeholder="Sub-group (optional)" />
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
            <span className="font-medium text-foreground">{modulePath.length ? modulePath.join(" → ") : "Pick a module and a section"}</span>
            {" · "}Reuse existing names from the suggestions. Leave sub-group empty unless a big section needs grouping — never repeat
            the video name there.
          </p>
          {modulePath.length === 1 ? <p className="text-xs text-destructive">Add a section too — admins browse by section.</p> : null}
        </div>

        {/* Step + name */}
        <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
          <div className="space-y-1.5">
            <Label>Step</Label>
            <Input type="number" min={1} value={step} onChange={(e) => setStep(e.target.value)} placeholder="e.g. 3" />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Schedule a live class for your batch" />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Step = watch order inside the section (leave empty if order doesn't matter). Name = the task in plain words.
          {titlePrefixStep != null ? (
            <span className="text-destructive"> Remove “{titlePrefixStep}.” from the name — put it in Step instead.</span>
          ) : null}
        </p>

        {/* Topics */}
        <div className="space-y-1.5">
          <Label>Topics (description)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Select batch, date, time; recurring weekly classes; reminder emails; edit or delete a class"
            rows={3}
          />
          {topics.length ? (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Separate topics with “;” — each shows as a chip and is searchable. Use “→” for a flow.</p>
          )}
        </div>

        {/* Keywords */}
        <div className="space-y-1.5">
          <Label>Search keywords</Label>
          <KeywordInput value={keywords} onChange={setKeywords} placeholder="fees kaise le, shulk, sell course … (Enter or comma to add)" />
          <p className="text-xs text-muted-foreground">
            Words admins might type that are <b>not</b> in the name or topics — their own wording, Hindi/Hinglish, old feature
            names, common misspellings. 5–15 is plenty.
          </p>
          {understood.length ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Already understood automatically, no need to add:</span> {understood.join(", ")}
            </p>
          ) : null}
        </div>

        {/* Test a search */}
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
          <Label className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" /> Test: does this video come up?
          </Label>
          <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Type what an admin would search, e.g. online class kaise le" className="bg-background" />
          {draftRank ? (
            <p className="text-xs">
              {draftRank.rank === 0 ? (
                <span className="font-medium text-green-700">#1 of {draftRank.total} — admins see it as the best match.</span>
              ) : draftRank.rank > 0 ? (
                <span className="font-medium text-amber-700">
                  #{draftRank.rank + 1} of {draftRank.total} — “{draftRank.top}” ranks above. Add the missing words as keywords.
                </span>
              ) : (
                <span className="font-medium text-destructive">Not found — add these words as keywords or topics.</span>
              )}
            </p>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active — visible in the admin Training popup
        </label>
      </div>

      <DialogFooter>
        {create.isError || update.isError ? <p className="mr-auto self-center text-xs text-destructive">Could not save. Try again.</p> : null}
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
