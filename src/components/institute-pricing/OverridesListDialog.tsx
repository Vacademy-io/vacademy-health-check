import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toolLabel, unitNoun } from "@/lib/eval-api-pricing";
import type { ActiveOverride } from "@/types/eval-api";

function rate(o: ActiveOverride, unitField?: string) {
  const parts: string[] = [];
  if (o.flat !== null) parts.push(`base ${o.flat}`);
  if (o.per_unit !== null) parts.push(`${o.per_unit} per ${unitNoun(unitField, 1)}`);
  return parts.length > 0 ? parts.join(" + ") : "params only";
}

/** Institutes paying a contract price for one tool, linking to their Pricing & API tab. */
export function OverridesListDialog({
  toolKey,
  label,
  unitField,
  overrides,
  open,
  onOpenChange,
}: {
  toolKey: string;
  label?: string;
  unitField?: string;
  overrides: ActiveOverride[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Contract prices</DialogTitle>
          <DialogDescription>
            {toolLabel(toolKey, label)} — {overrides.length} institute{overrides.length === 1 ? "" : "s"} pay their own
            price. Edit one from its Pricing &amp; API tab.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {overrides.map((o) => (
            <li key={`${o.institute_id}:${o.id ?? ""}`} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/institutes/${o.institute_id}`} className="font-mono text-xs text-primary hover:underline">
                  {o.institute_id}
                </Link>
                <span className="font-medium">{rate(o, unitField)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {o.no_token_overage && <Badge variant="outline">no overage</Badge>}
                {o.effective_from && <span>since {new Date(o.effective_from).toLocaleDateString()}</span>}
                {o.created_by && <span>by {o.created_by}</span>}
                {o.reason && <span>· “{o.reason}”</span>}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
