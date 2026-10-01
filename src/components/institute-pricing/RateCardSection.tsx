import { useMemo, useState } from "react";
import { AlertCircle, History, Loader2, Pencil, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/shared/Toggle";
import {
  useInstituteToolPricing,
  useRevertInstituteToolPricing,
  useSetInstituteToolPricing,
} from "@/services/institute-pricing-api";
import {
  API_EVAL_TOOL_KEY,
  DASHBOARD_EVAL_TOOL_KEY,
  buildOverrideRequest,
  draftFromRow,
  draftRate,
  errorDetail,
  formatRate,
  isFixedPrice,
  previewLine,
  previewSamples,
  sourceBadge,
  toolLabel,
  typedPerAnswer,
  typedPreviewLine,
  unitNoun,
  type OverrideDraft,
} from "@/lib/eval-api-pricing";
import type { InstituteToolPricingRow } from "@/types/eval-api";
import { PricingHistoryDrawer } from "./PricingHistoryDrawer";
import { cn } from "@/lib/utils";

/** Evaluation tools first: they are what a partner contract usually prices. */
const PINNED = [API_EVAL_TOOL_KEY, DASHBOARD_EVAL_TOOL_KEY];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function RateCardSection({ instituteId, onNotify }: { instituteId: string; onNotify: (text: string) => void }) {
  const { data, isLoading, isError, error } = useInstituteToolPricing(instituteId);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<InstituteToolPricingRow | null>(null);
  const [reverting, setReverting] = useState<InstituteToolPricingRow | null>(null);
  const [historyTool, setHistoryTool] = useState<string | null>(null);

  const { pinned, rest } = useMemo(() => {
    const rows = data ?? [];
    const pinnedRows = PINNED.map((k) => rows.find((r) => r.tool_key === k)).filter(
      (r): r is InstituteToolPricingRow => !!r
    );
    // Any other tool with a contract price stays visible too.
    const others = rows
      .filter((r) => !PINNED.includes(r.tool_key))
      .sort((a, b) => Number(!!b.override) - Number(!!a.override) || a.tool_key.localeCompare(b.tool_key));
    return { pinned: pinnedRows, rest: others };
  }, [data]);
  const restOverridden = rest.filter((r) => r.override);
  const visible = showAll ? [...pinned, ...rest] : [...pinned, ...restOverridden];
  const hiddenCount = rest.length - restOverridden.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rate card</CardTitle>
        <CardDescription>
          What this institute pays per tool. A contract price overrides the global rate for this institute only;
          every edit closes the old row and keeps it in history. The API price is per page and fixed (the quote,
          no token overage). Dashboard previews refresh within 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && <Skeleton className="h-32 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Could not load this institute's rates: {errorDetail(error)}
          </p>
        )}
        {data && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead>Global</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No priced tools returned.
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((row) => {
                  const badge = sourceBadge(row.source);
                  const typed = typedPerAnswer(row.effective);
                  return (
                    <TableRow key={row.tool_key}>
                      <TableCell className="max-w-[260px]">
                        <div className="text-sm font-medium">{toolLabel(row.tool_key, row.label)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground/70">{row.tool_key}</div>
                      </TableCell>
                      <TableCell className="text-sm">{formatRate(row.global)}</TableCell>
                      <TableCell className="text-sm">
                        {row.override ? (
                          <span title={row.override.reason ?? undefined}>{formatRate({ ...row.global, ...pickSet(row.override) })}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{formatRate(row.effective)}</div>
                        {typed !== null && (
                          <div className="text-xs text-muted-foreground">typed: {typed} per answer</div>
                        )}
                        {isFixedPrice(row.effective, row.tool_key) && (
                          <div className="text-xs text-muted-foreground">fixed price</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.label === "Contract" ? "default" : "outline"} title={badge.detail}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" title={row.override?.created_by ?? undefined}>
                        {row.override ? formatDate(row.override.effective_from) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(row)} title="Set contract price">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setHistoryTool(row.tool_key)} title="History">
                            <History className="h-4 w-4" />
                          </Button>
                          {row.override && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReverting(row)}
                              title="Revert to the standard rate"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {data && hiddenCount > 0 && (
          <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show evaluation tools only" : `Show ${hiddenCount} more tool${hiddenCount === 1 ? "" : "s"}`}
          </Button>
        )}
      </CardContent>

      {editing && (
        <OverrideDialog
          key={editing.tool_key}
          instituteId={instituteId}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            onNotify(text);
          }}
        />
      )}
      {reverting && (
        <RevertDialog
          instituteId={instituteId}
          row={reverting}
          onClose={() => setReverting(null)}
          onDone={(text) => {
            setReverting(null);
            onNotify(text);
          }}
        />
      )}
      <PricingHistoryDrawer
        toolKey={historyTool}
        instituteId={instituteId}
        unitField={data?.find((r) => r.tool_key === historyTool)?.global.unit_field}
        open={historyTool !== null}
        onOpenChange={(open) => !open && setHistoryTool(null)}
      />
    </Card>
  );
}

/** The override's set fields only (null = inherits the global value). */
function pickSet(o: NonNullable<InstituteToolPricingRow["override"]>) {
  const out: { flat?: number; per_unit?: number; params?: Record<string, unknown> } = {};
  if (o.flat !== null) out.flat = o.flat;
  if (o.per_unit !== null) out.per_unit = o.per_unit;
  if (o.params) out.params = o.params;
  return out;
}

function OverrideDialog({
  instituteId,
  row,
  onClose,
  onSaved,
}: {
  instituteId: string;
  row: InstituteToolPricingRow;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const save = useSetInstituteToolPricing(instituteId);
  const [draft, setDraft] = useState<OverrideDraft>(() => draftFromRow(row));
  const [error, setError] = useState<string | null>(null);
  const unit = row.global.unit_field ?? row.effective.unit_field;
  const noun = unitNoun(unit, 1);
  const isApi = row.tool_key === API_EVAL_TOOL_KEY;
  const hasTyped = typedPerAnswer(row.global) !== null || isApi;
  const hasSlabs = Array.isArray(row.global.params?.slabs) && (row.global.params?.slabs as unknown[]).length > 0;
  const preview = draftRate(row, draft);
  const set = (patch: Partial<OverrideDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = () => {
    setError(null);
    const built = buildOverrideRequest(row, draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    save.mutate(
      { toolKey: row.tool_key, body: built.body },
      {
        onSuccess: () => onSaved(`Contract price saved for ${toolLabel(row.tool_key, row.label)}`),
        onError: (err) => setError(errorDetail(err, "Failed to save")),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Contract price</DialogTitle>
          <DialogDescription>
            {toolLabel(row.tool_key, row.label)} — for this institute only. Leave a field blank to inherit the
            global value ({formatRate(row.global)}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ovr-flat">{unit === "flat" ? "Credits per call" : "Base credits (per copy)"}</Label>
              <Input
                id="ovr-flat"
                type="number"
                min={0}
                step="any"
                value={draft.flat}
                placeholder={String(row.global.flat ?? 0)}
                onChange={(e) => set({ flat: e.target.value })}
              />
            </div>
            {unit !== "flat" && (
              <div className="space-y-2">
                <Label htmlFor="ovr-per">Credits per {noun}</Label>
                <Input
                  id="ovr-per"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.perUnit}
                  placeholder={String(row.global.per_unit ?? 0)}
                  onChange={(e) => set({ perUnit: e.target.value })}
                  disabled={hasSlabs}
                />
                {hasSlabs && (
                  <p className="text-xs text-muted-foreground">This tool uses slab prices; the per-{noun} rate is ignored.</p>
                )}
              </div>
            )}
            {hasTyped && (
              <div className="space-y-2">
                <Label htmlFor="ovr-typed">Credits per typed answer</Label>
                <Input
                  id="ovr-typed"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.typedPerAnswer}
                  placeholder={String(typedPerAnswer(row.global) ?? 1)}
                  onChange={(e) => set({ typedPerAnswer: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Typed submissions have no pages: one charge per non-blank long answer.</p>
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">No token overage</p>
              <p className="text-xs text-muted-foreground">
                {isApi
                  ? "The API price is always fixed: the partner pays exactly the quote."
                  : "Charge exactly the quote instead of max(quote, actual model cost)."}
              </p>
            </div>
            <Toggle
              checked={isApi || draft.noOverage}
              disabled={isApi}
              onChange={(next) => set({ noOverage: next })}
              label="No token overage"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ovr-reason">Reason (required)</Label>
            <Input
              id="ovr-reason"
              value={draft.reason}
              placeholder="Contract reference, e.g. PO 2026-114, 0.8/page for 12 months"
              onChange={(e) => set({ reason: e.target.value })}
            />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            {previewSamples(unit).map((n) => (
              <p key={n}>{previewLine(preview, row.global, n)}</p>
            ))}
            {hasTyped && typedPreviewLine(preview, row.global) && <p>{typedPreviewLine(preview, row.global)}</p>}
          </div>

          {error && (
            <p className={cn("flex items-center gap-2 text-sm text-destructive")}>
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || !draft.reason.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save contract price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevertDialog({
  instituteId,
  row,
  onClose,
  onDone,
}: {
  instituteId: string;
  row: InstituteToolPricingRow;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const revert = useRevertInstituteToolPricing(instituteId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    setError(null);
    revert.mutate(
      { toolKey: row.tool_key, reason: reason.trim() },
      {
        onSuccess: () => onDone(`${toolLabel(row.tool_key, row.label)} is back on the standard rate`),
        onError: (err) => setError(errorDetail(err, "Failed to revert")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revert to the standard rate</DialogTitle>
          <DialogDescription>
            Ends the contract price for {toolLabel(row.tool_key, row.label)}. Work already accepted keeps the price it
            was quoted at; new work pays {formatRate(row.global)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="revert-reason">Reason (required)</Label>
          <Input
            id="revert-reason"
            value={reason}
            placeholder="Contract ended 31 Mar"
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={revert.isPending || !reason.trim()}>
            {revert.isPending ? "Reverting..." : "Revert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
