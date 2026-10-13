import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, History, Loader2, Pencil, UserCog } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBulkStages, useUpdateStage, useVideoStages } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { DRY_RUN_REASON, formatWhen, gatewayFor, isChatModel, isNotFound, modelName } from "@/lib/model-defaults";
import { cn } from "@/lib/utils";
import type { VideoStage } from "@/types/model-defaults";
import type { ModelContext } from "./ModelLabel";
import { ModelPicker } from "./ModelPicker";
import { ModelChangeHistoryDrawer } from "./ModelChangeHistoryDrawer";

const USE_CASE = "video";
const ALL = "*";

interface StageRow {
  stage_id: string;
  label: string;
  /** Per tier; the '*' entry (if any) covers tiers without their own row. */
  byTier: Map<string, VideoStage>;
}

function cellFor(row: StageRow, tier: string): VideoStage | undefined {
  return row.byTier.get(tier) ?? row.byTier.get(ALL);
}

/** Stages × quality tiers of the video pipeline, each cell the model that stage uses. */
export function VideoStagesSection({ ctx, onNotify }: { ctx: ModelContext; onNotify: (text: string) => void }) {
  const { data, isLoading, isError, error } = useVideoStages(USE_CASE);
  const [editing, setEditing] = useState<StageRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { rows, tiers } = useMemo(() => {
    const tiers = [...(data?.tiers ?? [])];
    const map = new Map<string, StageRow>();
    for (const s of data?.stages ?? []) {
      if (s.quality_tier !== ALL && !tiers.includes(s.quality_tier)) tiers.push(s.quality_tier);
      const row = map.get(s.stage_id) ?? { stage_id: s.stage_id, label: s.label || s.stage_id, byTier: new Map() };
      row.byTier.set(s.quality_tier, s);
      map.set(s.stage_id, row);
    }
    return { rows: Array.from(map.values()), tiers };
  }, [data]);

  const platformName = modelName(ctx.platformDefault, ctx.byId);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Video pipeline stages</CardTitle>
          <CardDescription>
            The model each stage of AI video generation uses, per quality tier. Click a stage to change it for every
            tier or only some. <UserCog className="inline h-3.5 w-3.5" /> = the user may pick their own model for that
            stage.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="mr-1 h-4 w-4" /> History
          </Button>
          <Button size="sm" onClick={() => setBulkOpen(true)} disabled={!data || rows.length === 0 || !ctx.platformDefault}>
            All video stages to {platformName}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {isNotFound(error) ? "The video-stage endpoints aren't deployed on ai-service yet." : errorDetail(error, "Could not load video stages")}
          </p>
        )}
        {data && rows.length === 0 && <p className="text-sm text-muted-foreground">No video stages configured.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Stage</th>
                  {tiers.map((t) => (
                    <th key={t} className="px-2 py-2 font-medium capitalize">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.stage_id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 align-top">
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="group flex items-start gap-1.5 text-left"
                        title="Change this stage's model"
                      >
                        <span>
                          <span className="font-medium group-hover:underline">{row.label}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">{row.stage_id}</span>
                        </span>
                        <Pencil className="mt-0.5 h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </button>
                    </td>
                    {tiers.map((t) => {
                      const s = cellFor(row, t);
                      return (
                        <td key={t} className="px-2 py-2 align-top">
                          {s ? <StageChip stage={s} ctx={ctx} onClick={() => setEditing(row)} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <StageEditDialog
        row={editing}
        tiers={tiers}
        ctx={ctx}
        onOpenChange={(open) => !open && setEditing(null)}
        onDone={(text) => {
          setEditing(null);
          onNotify(text);
        }}
      />
      <VideoBulkDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ctx={ctx}
        stageLabels={new Map(rows.map((r) => [r.stage_id, r.label]))}
        onDone={(text) => {
          setBulkOpen(false);
          onNotify(text);
        }}
      />
      <ModelChangeHistoryDrawer useCase={USE_CASE} title="Video pipeline stages" open={historyOpen} onOpenChange={setHistoryOpen} />
    </Card>
  );
}

function StageChip({ stage, ctx, onClick }: { stage: VideoStage; ctx: ModelContext; onClick: () => void }) {
  const gw = gatewayFor(stage.model_id, ctx.routes);
  const title = [
    stage.model_id,
    stage.fallback_model_id ? `fallback ${stage.fallback_model_id}` : "no fallback",
    gw ? `via ${gw.label}` : "",
    stage.user_overridable ? "user may override" : "",
    stage.is_active ? "" : "inactive",
    stage.updated_at ? `updated ${formatWhen(stage.updated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent",
        !stage.is_active && "opacity-50 line-through",
        stage.model_id === ctx.platformDefault && "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          gw?.key === "isoquant" ? "bg-emerald-500" : gw?.key === "openrouter" ? "bg-sky-500" : "bg-muted-foreground"
        )}
      />
      <span className="truncate">{modelName(stage.model_id, ctx.byId)}</span>
      {stage.user_overridable && <UserCog className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </button>
  );
}

function StageEditDialog({
  row,
  tiers,
  ctx,
  onOpenChange,
  onDone,
}: {
  row: StageRow | null;
  tiers: string[];
  ctx: ModelContext;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      {row && <StageForm key={row.stage_id} row={row} tiers={tiers} ctx={ctx} onCancel={() => onOpenChange(false)} onDone={onDone} />}
    </Dialog>
  );
}

function StageForm({
  row,
  tiers,
  ctx,
  onCancel,
  onDone,
}: {
  row: StageRow;
  tiers: string[];
  ctx: ModelContext;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const update = useUpdateStage();
  const current = tiers.map((t) => cellFor(row, t)?.model_id).find(Boolean) ?? null;
  const currentModel = current ? ctx.byId.get(current) : undefined;
  const currentIsChat = !currentModel || isChatModel(currentModel);
  const [model, setModel] = useState<string | null>(current);
  const [allTiers, setAllTiers] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState(!currentIsChat);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const targetTiers = allTiers ? [ALL] : picked;

  const save = () => {
    if (!model) return;
    setError(null);
    update.mutate(
      { use_case: USE_CASE, stage_id: row.stage_id, quality_tiers: targetTiers, model_id: model, reason: reason.trim() },
      {
        onSuccess: (res) =>
          onDone(
            `${row.label}: ${modelName(model, ctx.byId)} on ${allTiers ? "every tier" : picked.join(", ")} (${res?.updated ?? 0} row${res?.updated === 1 ? "" : "s"} updated)`
          ),
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{row.label}</DialogTitle>
        <DialogDescription>
          Video stage <span className="font-mono">{row.stage_id}</span>. Currently:{" "}
          {tiers.map((t) => `${t} ${modelName(cellFor(row, t)?.model_id, ctx.byId)}`).join(" · ") || "—"}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Model</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={allCategories} onChange={(e) => setAllCategories(e.target.checked)} />
              show image / video / TTS models
            </label>
          </div>
          <ModelPicker value={model} onChange={setModel} ctx={ctx} allCategories={allCategories} label="Stage model" />
        </div>
        <div className="space-y-1.5">
          <Label>Quality tiers</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={allTiers} onChange={(e) => setAllTiers(e.target.checked)} />
              All tiers
            </label>
            {!allTiers &&
              tiers.map((t) => (
                <label key={t} className="flex items-center gap-1.5 capitalize">
                  <input
                    type="checkbox"
                    checked={picked.includes(t)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t] : p.filter((x) => x !== t)))}
                  />
                  {t}
                </label>
              ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stage-reason">Reason (required — goes into the change log)</Label>
          <Input id="stage-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this model" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!model || targetTiers.length === 0 || !reason.trim() || update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function VideoBulkDialog({
  open,
  onOpenChange,
  ctx,
  stageLabels,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: ModelContext;
  stageLabels: Map<string, string>;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <VideoBulkForm ctx={ctx} stageLabels={stageLabels} onCancel={() => onOpenChange(false)} onDone={onDone} />}
    </Dialog>
  );
}

function VideoBulkForm({
  ctx,
  stageLabels,
  onCancel,
  onDone,
}: {
  ctx: ModelContext;
  stageLabels: Map<string, string>;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const preview = useBulkStages();
  const apply = useBulkStages();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modelId = ctx.platformDefault;

  const runPreview = preview.mutate;
  useEffect(() => {
    runPreview({ use_case: USE_CASE, model_id: modelId, dry_run: true, reason: DRY_RUN_REASON });
  }, [runPreview, modelId]);

  const changes = preview.data?.changes ?? [];

  const submit = () => {
    setError(null);
    apply.mutate(
      { use_case: USE_CASE, model_id: modelId, dry_run: false, reason: reason.trim() },
      {
        onSuccess: (res) => {
          if (!res.applied) {
            setError("ai-service answered but did not apply the change. Nothing was saved.");
            return;
          }
          onDone(`${res.changes.length} video stage row${res.changes.length === 1 ? "" : "s"} moved to ${modelName(modelId, ctx.byId)}`);
        },
        onError: (err) => setError(errorDetail(err, "Bulk change failed")),
      }
    );
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>All video stages to {modelName(modelId, ctx.byId)}</DialogTitle>
        <DialogDescription>Preview of every stage and tier that changes.</DialogDescription>
      </DialogHeader>
      {preview.isPending && <Skeleton className="h-32 w-full" />}
      {preview.isError && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {errorDetail(preview.error, "Could not preview the change")}
        </p>
      )}
      {preview.isSuccess && (
        <div className="space-y-4">
          <p className="text-sm font-medium">
            {changes.length === 0 ? "Nothing to change — every stage already uses it." : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </p>
          {changes.length > 0 && (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
              {changes.map((c) => (
                <li key={`${c.stage_id}-${c.quality_tier}`} className="px-3 py-2">
                  <span className="font-medium">{stageLabels.get(c.stage_id) ?? c.stage_id}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">{c.quality_tier === ALL ? "all tiers" : c.quality_tier}</span>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{c.old ?? "none"}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-mono text-foreground">{c.new ?? "none"}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {changes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="video-bulk-reason">Reason (required — goes into the change log)</Label>
              <Input id="video-bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" />
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={apply.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!preview.isSuccess || changes.length === 0 || !reason.trim() || apply.isPending}>
          {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Apply ${changes.length} change${changes.length === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
