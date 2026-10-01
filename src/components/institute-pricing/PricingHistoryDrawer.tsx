import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToolPricingHistory } from "@/services/institute-pricing-api";
import {
  API_EVAL_TOOL_KEY,
  DASHBOARD_EVAL_TOOL_KEY,
  errorDetail,
  typedPerAnswer,
  toolLabel,
  unitNoun,
} from "@/lib/eval-api-pricing";
import type { PricingHistoryEntry } from "@/types/eval-api";

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function rateText(e: PricingHistoryEntry, unitField?: string) {
  const parts: string[] = [];
  if (e.flat !== null) parts.push(`base ${e.flat}`);
  if (e.per_unit !== null) parts.push(`${e.per_unit} per ${unitNoun(unitField, 1)}`);
  const typed = typedPerAnswer(e);
  if (typed !== null) parts.push(`typed ${typed} per answer`);
  if (e.no_token_overage) parts.push("no overage");
  return parts.length > 0 ? parts.join(" · ") : "inherits global";
}

/**
 * Side drawer with the global edits and this institute's override rows for one
 * tool, newest first. Override rows carry their own end date (replaced or reverted).
 */
export function PricingHistoryDrawer({
  toolKey,
  instituteId,
  unitField,
  open,
  onOpenChange,
}: {
  toolKey: string | null;
  instituteId?: string;
  unitField?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useToolPricingHistory(toolKey, instituteId, open);
  const unit =
    unitField ??
    (toolKey === API_EVAL_TOOL_KEY ? "pages" : toolKey === DASHBOARD_EVAL_TOOL_KEY ? "questions" : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 content-start overflow-y-auto sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Price history</DialogTitle>
          <DialogDescription>
            {toolKey ? toolLabel(toolKey) : ""}
            {instituteId ? " — global edits and this institute's contract prices" : " — global edits and every contract price"}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {errorDetail(error, "Could not load history")}
          </p>
        )}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
        <ol className="space-y-3">
          {data?.map((e) => (
            <li key={e.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.scope === "override" ? "default" : "outline"}>
                  {e.scope === "override" ? "Contract" : "Global"}
                </Badge>
                <span className="text-xs text-muted-foreground">{when(e.changed_at)}</span>
                {e.scope === "override" && (
                  <Badge variant={e.effective_to ? "secondary" : "success"}>{e.effective_to ? "ended" : "active"}</Badge>
                )}
              </div>
              <p className="mt-1 font-medium">{rateText(e, unit)}</p>
              {e.reason && <p className="mt-1 text-muted-foreground">“{e.reason}”</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                by {e.changed_by ?? "unknown"}
                {e.institute_id && !instituteId ? ` · institute ${e.institute_id}` : ""}
                {e.effective_to ? ` · ended ${when(e.effective_to)}${e.ended_by ? ` by ${e.ended_by}` : ""}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
