import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
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
import { useBulkSetModel } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { COPY_CHECK_DEDUCTION, DRY_RUN_REASON, GEMINI_FALLBACK_ID, modelName } from "@/lib/model-defaults";
import type { BulkChange, UseCaseEntry } from "@/types/model-defaults";
import type { ModelContext } from "./ModelLabel";

/**
 * "Set every feature to <model>": a dry run first (diff + held rows), then the same call
 * with dry_run=false and a required reason.
 */
export function BulkSetDialog({
  modelId,
  ctx,
  useCases,
  open,
  onOpenChange,
  onDone,
}: {
  modelId: string;
  ctx: ModelContext;
  useCases: UseCaseEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <BulkForm
          modelId={modelId}
          ctx={ctx}
          useCases={useCases}
          onCancel={() => onOpenChange(false)}
          onDone={(text) => {
            onOpenChange(false);
            onDone(text);
          }}
        />
      )}
    </Dialog>
  );
}

function BulkForm({
  modelId,
  ctx,
  useCases,
  onCancel,
  onDone,
}: {
  modelId: string;
  ctx: ModelContext;
  useCases: UseCaseEntry[];
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const preview = useBulkSetModel();
  const apply = useBulkSetModel();
  const [withFallback, setWithFallback] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const labelOf = useMemo(() => new Map(useCases.map((u) => [u.use_case, u.label || u.use_case])), [useCases]);
  const fallbackId = withFallback ? GEMINI_FALLBACK_ID : undefined;

  const runPreview = preview.mutate;
  useEffect(() => {
    runPreview({ model_id: modelId, fallback_model_id: fallbackId, dry_run: true, reason: DRY_RUN_REASON });
  }, [runPreview, modelId, fallbackId]);

  const changes = useMemo(() => preview.data?.changes ?? [], [preview.data]);
  const held = preview.data?.held ?? [];
  const byUseCase = useMemo(() => {
    const map = new Map<string, BulkChange[]>();
    for (const c of changes) map.set(c.use_case, [...(map.get(c.use_case) ?? []), c]);
    return Array.from(map.entries());
  }, [changes]);

  const submit = () => {
    setError(null);
    apply.mutate(
      { model_id: modelId, fallback_model_id: fallbackId, dry_run: false, reason: reason.trim() },
      {
        onSuccess: (res) => {
          if (!res.applied) {
            setError("ai-service answered but did not apply the change. Nothing was saved.");
            return;
          }
          const n = res.changes.length;
          onDone(
            `${n} change${n === 1 ? "" : "s"} applied — features now default to ${modelName(modelId, ctx.byId)}` +
              (res.held.length ? `; ${res.held.length} held use case${res.held.length === 1 ? "" : "s"} left as they were.` : ".")
          );
        },
        onError: (err) => setError(errorDetail(err, "Bulk change failed")),
      }
    );
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Set every feature to {modelName(modelId, ctx.byId)}</DialogTitle>
        <DialogDescription>
          Preview of what changes. Held features are skipped. Explicit model picks by institutes and users are not
          touched.
        </DialogDescription>
      </DialogHeader>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withFallback} onChange={(e) => setWithFallback(e.target.checked)} />
        Also set the fallback to {modelName(GEMINI_FALLBACK_ID, ctx.byId)}{" "}
        <span className="font-mono text-xs text-muted-foreground">{GEMINI_FALLBACK_ID}</span>
      </label>

      {preview.isPending && <Skeleton className="h-32 w-full" />}
      {preview.isError && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {errorDetail(preview.error, "Could not preview the change")}
        </p>
      )}

      {preview.isSuccess && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              {changes.length === 0
                ? "Nothing to change — every feature that isn't held already matches."
                : `${changes.length} change${changes.length === 1 ? "" : "s"} across ${byUseCase.length} feature${byUseCase.length === 1 ? "" : "s"}`}
            </p>
            {byUseCase.length > 0 && (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
                {byUseCase.map(([uc, list]) => (
                  <li key={uc} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{labelOf.get(uc) ?? uc}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{uc}</span>
                      {uc === COPY_CHECK_DEDUCTION && (
                        <span className="text-[11px] font-semibold text-amber-700">affects student marks</span>
                      )}
                    </div>
                    {list.map((c) => (
                      <p key={c.field} className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-20 shrink-0">{c.field.replace(/_model_id$/, "")}</span>
                        <span className="font-mono">{c.old ?? "none"}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-foreground">{c.new ?? "none"}</span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {held.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Held — left unchanged ({held.length})</p>
              <ul className="divide-y rounded-md border text-sm">
                {held.map((h) => (
                  <li key={h.use_case} className="px-3 py-2">
                    <span className="font-medium">{labelOf.get(h.use_case) ?? h.use_case}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{h.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {changes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-reason">Reason (required — goes into the change log)</Label>
              <Input id="bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" />
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
