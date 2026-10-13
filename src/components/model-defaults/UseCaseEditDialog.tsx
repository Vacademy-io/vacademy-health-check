import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateUseCaseModel } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { COPY_CHECK_DEDUCTION, GEMINI_FALLBACK_ID, modelName } from "@/lib/model-defaults";
import type { UpdateUseCaseRequest, UseCaseEntry } from "@/types/model-defaults";
import type { ModelContext } from "./ModelLabel";
import { ModelPicker } from "./ModelPicker";

/** Edit one feature's default + fallback model. Every save needs a reason (it lands in the change log). */
export function UseCaseEditDialog({
  entry,
  ctx,
  open,
  onOpenChange,
  onDone,
}: {
  entry: UseCaseEntry | null;
  ctx: ModelContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && entry && (
        <EditForm
          key={entry.use_case}
          entry={entry}
          ctx={ctx}
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

function EditForm({
  entry,
  ctx,
  onCancel,
  onDone,
}: {
  entry: UseCaseEntry;
  ctx: ModelContext;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const update = useUpdateUseCaseModel();
  const missing = entry.row === null;
  const initialDefault = entry.row?.default_model_id ?? ctx.platformDefault;
  const initialFallback = entry.row ? entry.row.fallback_model_id : GEMINI_FALLBACK_ID;
  const [def, setDef] = useState<string | null>(initialDefault || null);
  const [fallback, setFallback] = useState<string | null>(initialFallback);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const defaultChanged = missing || def !== entry.row?.default_model_id;
  const fallbackChanged = missing ? fallback !== null : fallback !== entry.row?.fallback_model_id;
  const dirty = defaultChanged || fallbackChanged;
  const sameModel = def !== null && def === fallback;
  const marks = entry.use_case === COPY_CHECK_DEDUCTION;

  const save = () => {
    setError(null);
    if (!def) {
      setError("Pick a default model");
      return;
    }
    const body: UpdateUseCaseRequest = { reason: reason.trim() };
    // Only send what changed; a missing row must be created with its default.
    if (defaultChanged) body.default_model_id = def;
    if (fallbackChanged) body.fallback_model_id = fallback;
    update.mutate(
      { useCase: entry.use_case, ...body },
      {
        onSuccess: () =>
          onDone(
            `${entry.label || entry.use_case}: ${modelName(def, ctx.byId)}${fallback ? ` → fallback ${modelName(fallback, ctx.byId)}` : ""}. Live for new requests.`
          ),
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{entry.label || entry.use_case}</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{entry.use_case}</span> · {entry.service} · {entry.kind}
          {entry.description ? ` — ${entry.description}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {marks && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This model re-checks deductions on evaluated answer copies. Changing it changes the marks students get on
            new evaluations — record exactly why.
          </p>
        )}
        {missing && (
          <p className="rounded-md border border-amber-500/40 p-3 text-sm text-amber-800 dark:text-amber-300">
            No row exists for this use case yet, so the code falls back to the platform default. Saving creates the row.
          </p>
        )}
        {entry.held_reason && (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            Held out of bulk changes: {entry.held_reason}
          </p>
        )}
        {entry.kind === "vision" && (
          <p className="text-xs text-muted-foreground">This feature sends images — pick a model that accepts image input.</p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default model</Label>
            <ModelPicker value={def} onChange={setDef} ctx={ctx} label="Default model" />
          </div>
          <div className="space-y-1.5">
            <Label>Fallback (tried when the default errors)</Label>
            <ModelPicker value={fallback} onChange={setFallback} ctx={ctx} allowNone noneLabel="No fallback" label="Fallback model" />
          </div>
        </div>
        {sameModel && <p className="text-xs text-amber-700">The fallback is the same model as the default, so it adds nothing.</p>}
        {entry.row?.free_tier_model_id && (
          <p className="text-xs text-muted-foreground">
            Free-tier model (unchanged here): <span className="font-mono">{entry.row.free_tier_model_id}</span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="uc-reason">Reason (required — goes into the change log)</Label>
          <Input
            id="uc-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this model"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Institutes or users that explicitly pick a model keep it (billed at cost + 50%); this changes the default
          only.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!dirty || !def || !reason.trim() || update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : missing ? "Create row" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
