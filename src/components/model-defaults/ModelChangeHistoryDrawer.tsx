import { AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModelChangeLog } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { describeValue, formatWhen, isNotFound } from "@/lib/model-defaults";

const TABLE_LABEL: Record<string, string> = {
  ai_model_defaults: "Feature default",
  ai_video_stage_models: "Video stage",
};

/**
 * Side drawer with the model change log, newest first — every feature when `useCase` is
 * null, else one feature (or "video" for the stage matrix). Same shape as PricingHistoryDrawer.
 */
export function ModelChangeHistoryDrawer({
  useCase,
  title,
  open,
  onOpenChange,
}: {
  useCase: string | null;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useModelChangeLog(useCase, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 content-start overflow-y-auto sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Model change history</DialogTitle>
          <DialogDescription>{title ?? (useCase ? useCase : "Every feature and video stage")} — last 50 changes</DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {isNotFound(error) ? "The change log isn't deployed on ai-service yet." : errorDetail(error, "Could not load history")}
          </p>
        )}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
        <ol className="space-y-3">
          {data?.map((e) => (
            <li key={e.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TABLE_LABEL[e.table_name] ?? e.table_name}</Badge>
                <span className="font-mono text-xs">{e.row_key}</span>
                <span className="text-xs text-muted-foreground">{formatWhen(e.created_at)}</span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 break-all text-xs">
                <span className="font-mono text-muted-foreground">{describeValue(e.old_value, e.new_value)}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="font-mono font-medium">{describeValue(e.new_value, e.old_value)}</span>
              </p>
              {e.reason && <p className="mt-1 text-muted-foreground">“{e.reason}”</p>}
              <p className="mt-1 text-xs text-muted-foreground">by {e.actor ?? "unknown"}</p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
