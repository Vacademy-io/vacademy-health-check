import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActorName } from "@/components/shared/ActorName";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatBytes } from "@/lib/file-utils";
import {
  money,
  useRemoveUsageAllowance,
  useSaveUsageAllowance,
  useUsageAllowance,
  type AllowanceStatus,
  type UsageAllowance,
} from "@/services/storage-usage-api";

const GB = 1024 ** 3;

interface Draft {
  included_storage_gb: string;
  included_bandwidth_gb: string;
  storage_rate_per_gb: string;
  bandwidth_rate_per_gb: string;
  currency: string;
  note: string;
}

const EMPTY: Draft = {
  included_storage_gb: "",
  included_bandwidth_gb: "",
  storage_rate_per_gb: "",
  bandwidth_rate_per_gb: "",
  currency: "INR",
  note: "",
};

function draftFrom(a: UsageAllowance | null): Draft {
  if (!a) return EMPTY;
  return {
    included_storage_gb: String(a.included_storage_gb),
    included_bandwidth_gb: String(a.included_bandwidth_gb),
    storage_rate_per_gb: String(a.storage_rate_per_gb),
    bandwidth_rate_per_gb: String(a.bandwidth_rate_per_gb),
    currency: a.currency,
    note: a.note ?? "",
  };
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function Meter({ label, used, includedGb, extra, charge, currency }: {
  label: string;
  used: number;
  includedGb: number;
  extra: number;
  charge: number;
  currency: string;
}) {
  const pct = includedGb > 0 ? Math.min(100, (used / GB / includedGb) * 100) : used > 0 ? 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatBytes(used)} of {includedGb.toLocaleString("en-IN")} GB
        </span>
      </div>
      <Progress value={pct} className={cn(extra > 0 && "[&>div]:bg-destructive")} />
      <p className={cn("text-xs", extra > 0 ? "text-destructive" : "text-muted-foreground")}>
        {extra > 0 ? `${formatBytes(extra)} over · ${money(charge, currency)}` : "Within the plan"}
      </p>
    </div>
  );
}

function MonthCard({ title, status }: { title: string; status: AllowanceStatus }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {monthName(status.month)} · storage averaged over {status.storage_snapshot_days} nightly snapshot
          {status.storage_snapshot_days === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Meter label="Storage (average)" used={status.storage_average_bytes} includedGb={status.included_storage_gb}
          extra={status.storage_extra_bytes} charge={status.storage_charge} currency={status.currency} />
        <Meter label="Bandwidth" used={status.bandwidth_bytes} includedGb={status.included_bandwidth_gb}
          extra={status.bandwidth_extra_bytes} charge={status.bandwidth_charge} currency={status.currency} />
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-sm font-medium">Extra charge</span>
          <span className="text-xl font-semibold">{money(status.total_charge, status.currency)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Institute → Storage plan. Sets the institute's included storage and bandwidth and the
 * price per extra GB. Opt-in: without a plan the institute's admins see plain usage. Nothing
 * here blocks uploads or raises an invoice; the extra charge is shown to the institute's
 * admins (Settings → Storage & Bandwidth) and billed by hand.
 */
export function StorageAllowanceTab({ instituteId }: { instituteId: string }) {
  const { data, isLoading, error } = useUsageAllowance(instituteId);
  const save = useSaveUsageAllowance(instituteId);
  const remove = useRemoveUsageAllowance(instituteId);
  const { toasts, push, dismiss } = useToasts();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const allowance = data?.allowance ?? null;

  // Reset the form only when the saved plan changes, not on every background refetch
  // (a refetch on window focus would otherwise wipe half-typed edits).
  const savedVersion = isLoading ? null : allowance ? `${allowance.updated_at}` : "none";
  const [formVersion, setFormVersion] = useState<string | null>(null);
  if (savedVersion !== null && savedVersion !== formVersion) {
    setFormVersion(savedVersion);
    setDraft(draftFrom(allowance));
  }

  const values = {
    included_storage_gb: num(draft.included_storage_gb),
    included_bandwidth_gb: num(draft.included_bandwidth_gb),
    storage_rate_per_gb: num(draft.storage_rate_per_gb),
    bandwidth_rate_per_gb: num(draft.bandwidth_rate_per_gb),
  };
  const currency = draft.currency.trim().toUpperCase();
  const valid = Object.values(values).every((v) => v !== null) && /^[A-Z]{3}$/.test(currency);

  const onSave = () => {
    if (!valid) return;
    save.mutate(
      {
        included_storage_gb: values.included_storage_gb!,
        included_bandwidth_gb: values.included_bandwidth_gb!,
        storage_rate_per_gb: values.storage_rate_per_gb!,
        bandwidth_rate_per_gb: values.bandwidth_rate_per_gb!,
        currency,
        note: draft.note.trim() || null,
      },
      {
        onSuccess: () => push("success", allowance ? "Storage plan updated" : "Storage plan set"),
        onError: (e) => push("error", errorDetail(e, "Could not save the storage plan")),
      }
    );
  };

  const onRemove = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setConfirmRemove(false);
        push("success", "Storage plan removed; the institute sees plain usage again");
      },
      onError: (e) => push("error", errorDetail(e, "Could not remove the storage plan")),
    });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Could not load the storage plan: {errorDetail(error, "request failed")}
        </CardContent>
      </Card>
    );
  }

  const field = (key: keyof Draft, label: string, hint: string, step = "any") => (
    <div className="space-y-1.5">
      <Label htmlFor={`allowance-${key}`}>{label}</Label>
      <Input
        id={`allowance-${key}`}
        type={key === "currency" ? "text" : "number"}
        min={key === "currency" ? undefined : 0}
        step={key === "currency" ? undefined : step}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              Storage &amp; bandwidth plan
              {allowance ? <Badge>On a plan</Badge> : <Badge variant="secondary">No plan</Badge>}
            </CardTitle>
            {allowance && (
              <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove plan
              </Button>
            )}
          </div>
          <CardDescription>
            {allowance
              ? "The institute's admins see these numbers and the extra charge under Settings → Storage & Bandwidth. Changes apply to the whole current month."
              : "This institute has no storage plan: its admins see plain usage and no charge. Set the included amounts and the price per extra GB to put it on one."}{" "}
            Nothing is blocked and no invoice is raised; bill the extra charge by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {field("included_storage_gb", "Included storage (GB)", "Compared with the month's average stored GB.")}
            {field("included_bandwidth_gb", "Included bandwidth (GB a month)", "Compared with the month's total downloads and streaming.")}
            {field("storage_rate_per_gb", "Extra storage price, per GB a month", "Charged on the average above the included GB.")}
            {field("bandwidth_rate_per_gb", "Extra bandwidth price, per GB", "Charged on every GB above the included amount.")}
            {field("currency", "Currency", "Three-letter code, e.g. INR or USD.")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allowance-note">Note (internal)</Label>
            <Textarea
              id="allowance-note"
              rows={2}
              placeholder="e.g. Agreed in the 1 Dec proposal"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {allowance?.updated_at && (
                <>
                  Last changed {new Date(allowance.updated_at).toLocaleString("en-IN")}
                  {allowance.updated_by && (
                    <>
                      {" "}by <ActorName id={allowance.updated_by} />
                    </>
                  )}
                </>
              )}
            </p>
            <Button onClick={onSave} disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {allowance ? "Save changes" : "Set plan"}
            </Button>
          </div>
          {!valid && (draft.included_storage_gb || draft.storage_rate_per_gb) && (
            <p className="text-xs text-destructive">Fill every amount with a number of 0 or more, and a three-letter currency.</p>
          )}
        </CardContent>
      </Card>

      {data?.current_month && data?.previous_month && (
        <div className="grid gap-4 md:grid-cols-2">
          <MonthCard title="This month so far" status={data.current_month} />
          <MonthCard title="Last month (at today's terms)" status={data.previous_month} />
        </div>
      )}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove the storage plan?</DialogTitle>
            <DialogDescription>
              The institute's admins will see plain usage again, with no included amounts and no extra charge. You
              can set a plan again at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="destructive" onClick={onRemove} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
