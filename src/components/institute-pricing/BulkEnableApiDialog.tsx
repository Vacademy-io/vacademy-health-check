import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBulkEnableApiAccess } from "@/services/api-access-api";
import { errorDetail, parseInstituteIds, presetQuota } from "@/lib/eval-api-pricing";
import type { ApiSegment } from "@/types/eval-api";

const NO_SEGMENT = "__none__";
const MAX_IDS = 500;

/** Enable the Evaluation API for a pasted list of institutes (vendor-led onboarding). */
export function BulkEnableApiDialog({
  open,
  onOpenChange,
  initialIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialIds: string[];
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <BulkEnableForm
          key={initialIds.join(",")}
          initialIds={initialIds}
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

function BulkEnableForm({
  initialIds,
  onCancel,
  onDone,
}: {
  initialIds: string[];
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const bulk = useBulkEnableApiAccess();
  const [text, setText] = useState(initialIds.join("\n"));
  const [segment, setSegment] = useState<ApiSegment | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { ids, invalid } = parseInstituteIds(text);
  const tooMany = ids.length > MAX_IDS;

  const submit = () => {
    setError(null);
    bulk.mutate(
      { institute_ids: ids, product: "evaluation", segment, reason: reason.trim() },
      {
        onSuccess: (res) => {
          const n = typeof res?.enabled === "number" ? res.enabled : ids.length;
          onDone(`Evaluation API enabled for ${n} institute${n === 1 ? "" : "s"}`);
        },
        onError: (err) => setError(errorDetail(err, "Bulk enable failed")),
      }
    );
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Enable the Evaluation API</DialogTitle>
        <DialogDescription>
          Paste institute ids (one per line, or comma separated). Each gets the segment preset's daily quotas; tune
          one institute later from its Pricing &amp; API tab. Keys are issued separately.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-ids">Institute ids</Label>
          <Textarea
            id="bulk-ids"
            rows={6}
            className="font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="6b600940-...&#10;0f3c2a11-..."
          />
          <p className="text-xs text-muted-foreground">
            {ids.length} institute{ids.length === 1 ? "" : "s"}
            {invalid.length > 0 && (
              <span className="text-destructive">
                {" "}
                · ignored {invalid.length} entr{invalid.length === 1 ? "y" : "ies"} that are not ids: {invalid.slice(0, 3).join(", ")}
                {invalid.length > 3 ? "…" : ""}
              </span>
            )}
            {tooMany && <span className="text-destructive"> · at most {MAX_IDS} per call</span>}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Segment preset</Label>
          <Select
            value={segment ?? NO_SEGMENT}
            onValueChange={(v) => setSegment(v === NO_SEGMENT ? null : (v as ApiSegment))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SEGMENT}>None</SelectItem>
              <SelectItem value="school">School</SelectItem>
              <SelectItem value="university">University</SelectItem>
              <SelectItem value="upsc">UPSC</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {presetQuota(segment).toLocaleString()} copies/day per institute.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-reason">Reason (required)</Label>
          <Input
            id="bulk-reason"
            value={reason}
            placeholder="Vendor X onboarding, contract ref"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={bulk.isPending || ids.length === 0 || tooMany || !reason.trim()}>
          {bulk.isPending ? "Enabling..." : `Enable for ${ids.length}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
