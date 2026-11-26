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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  type UsageCharge,
} from "@/services/storage-usage-api";

const GB = 1024 ** 3;
const CREDITS = "CREDITS";

/** The standard plan for new institutes (pricing agreed 26 Nov 2026; 1 credit ≈ ₹0.93). */
const STANDARD = {
  included_storage_gb: "10",
  included_bandwidth_gb: "50",
  storage_rate_per_gb: "5",
  bandwidth_rate_per_gb: "2",
};

/** Storage packs: a fixed monthly price instead of per-GB overage. */
const PACKS = [
  { label: "No pack", gb: 0, credits: 0 },
  { label: "+50 GB · 250 credits/month", gb: 50, credits: 250 },
  { label: "+500 GB · 2,000 credits/month", gb: 500, credits: 2000 },
  { label: "+1 TB · 3,500 credits/month", gb: 1024, credits: 3500 },
] as const;

interface Draft {
  included_storage_gb: string;
  included_bandwidth_gb: string;
  storage_rate_per_gb: string;
  bandwidth_rate_per_gb: string;
  currency: string;
  addon_storage_gb: string;
  addon_price_per_month: string;
  charge_from_month: string;
  note: string;
}

function nextMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function standardDraft(): Draft {
  return {
    ...STANDARD,
    currency: CREDITS,
    addon_storage_gb: "0",
    addon_price_per_month: "0",
    charge_from_month: nextMonth(),
    note: "",
  };
}

function draftFrom(a: UsageAllowance | null): Draft {
  if (!a) return standardDraft();
  return {
    included_storage_gb: String(a.included_storage_gb),
    included_bandwidth_gb: String(a.included_bandwidth_gb),
    storage_rate_per_gb: String(a.storage_rate_per_gb),
    bandwidth_rate_per_gb: String(a.bandwidth_rate_per_gb),
    currency: a.currency,
    addon_storage_gb: String(a.addon_storage_gb ?? 0),
    addon_price_per_month: String(a.addon_price_per_month ?? 0),
    charge_from_month: a.charge_from_month ?? nextMonth(),
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
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {status.currency === CREDITS &&
            (status.charged_to_wallet ? <Badge>Charged to wallet</Badge> : <Badge variant="secondary">Not charged</Badge>)}
        </CardTitle>
        <CardDescription>
          {monthName(status.month)} · storage averaged over {status.storage_snapshot_days} nightly snapshot
          {status.storage_snapshot_days === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Meter label="Storage (average)" used={status.storage_average_bytes}
          includedGb={status.included_storage_gb + status.addon_storage_gb}
          extra={status.storage_extra_bytes} charge={status.storage_charge} currency={status.currency} />
        <Meter label="Bandwidth" used={status.bandwidth_bytes} includedGb={status.included_bandwidth_gb}
          extra={status.bandwidth_extra_bytes} charge={status.bandwidth_charge} currency={status.currency} />
        {status.addon_price > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Storage pack (+{status.addon_storage_gb.toLocaleString("en-IN")} GB)</span>
            <span>{money(status.addon_price, status.currency)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-sm font-medium">Total</span>
          <span className="text-xl font-semibold">{money(status.total_charge, status.currency)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ChargesCard({ charges }: { charges: UsageCharge[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wallet charges</CardTitle>
        <CardDescription>
          Charged after the 3rd of the next month, once bandwidth for the last day is final. A failed charge is
          tried again every night.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No month charged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Storage over</TableHead>
                <TableHead className="text-right">Bandwidth over</TableHead>
                <TableHead className="text-right">Pack</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.month}>
                  <TableCell>{monthName(c.month)}</TableCell>
                  <TableCell className="text-right">{formatBytes(c.storage_extra_bytes)}</TableCell>
                  <TableCell className="text-right">{formatBytes(c.bandwidth_extra_bytes)}</TableCell>
                  <TableCell className="text-right">{c.addon_credits.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-medium">{c.credits.toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    {c.status === "CHARGED" ? (
                      <Badge>Charged</Badge>
                    ) : (
                      <span title={c.error ?? undefined}><Badge variant="destructive">Failed, retrying</Badge></span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Institute → Storage plan. Included storage and bandwidth, the price per extra GB and an
 * optional storage pack. In CREDITS the month's charge is taken from the institute's credit
 * wallet in the first days of the next month (from the start month on, never back-dated);
 * in a real currency it is shown only and billed by hand. Without a plan the institute's
 * admins see plain usage. Nothing here blocks uploads or playback.
 */
export function StorageAllowanceTab({ instituteId }: { instituteId: string }) {
  const { data, isLoading, error } = useUsageAllowance(instituteId);
  const save = useSaveUsageAllowance(instituteId);
  const remove = useRemoveUsageAllowance(instituteId);
  const { toasts, push, dismiss } = useToasts();
  const [draft, setDraft] = useState<Draft>(standardDraft);
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
    addon_storage_gb: num(draft.addon_storage_gb || "0"),
    addon_price_per_month: num(draft.addon_price_per_month || "0"),
  };
  const currency = draft.currency.trim().toUpperCase();
  const credits = currency === CREDITS;
  const monthOk = !credits || /^\d{4}-\d{2}$/.test(draft.charge_from_month);
  const valid = Object.values(values).every((v) => v !== null) && (credits || /^[A-Z]{3}$/.test(currency)) && monthOk;
  const unit = credits ? "credits" : currency || "currency";
  const packIndex = PACKS.findIndex(
    (p) => p.gb === values.addon_storage_gb && p.credits === values.addon_price_per_month
  );

  const onSave = () => {
    if (!valid) return;
    save.mutate(
      {
        included_storage_gb: values.included_storage_gb!,
        included_bandwidth_gb: values.included_bandwidth_gb!,
        storage_rate_per_gb: values.storage_rate_per_gb!,
        bandwidth_rate_per_gb: values.bandwidth_rate_per_gb!,
        currency,
        addon_storage_gb: values.addon_storage_gb!,
        addon_price_per_month: values.addon_price_per_month!,
        charge_from_month: credits ? draft.charge_from_month : null,
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

  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  const field = (key: keyof Draft, label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`allowance-${key}`}>{label}</Label>
      <Input id={`allowance-${key}`} type="number" min={0} step="any" value={draft[key]} onChange={set(key)} />
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, ...STANDARD, currency: CREDITS }))}>
                Use standard plan
              </Button>
              {allowance && (
                <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remove plan
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            {allowance
              ? "The institute's admins see this plan and the charge under Settings → Storage & Bandwidth."
              : "No plan yet: the institute's admins see plain usage and nothing is charged. The form is filled with the standard plan for new institutes."}{" "}
            Going over never stops videos or files from playing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>How the extra is charged</Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={credits ? "default" : "outline"}
                onClick={() => setDraft((d) => ({ ...d, currency: CREDITS }))}>
                From the credit wallet, monthly
              </Button>
              <Button size="sm" variant={credits ? "outline" : "default"}
                onClick={() => setDraft((d) => ({ ...d, currency: d.currency === CREDITS ? "INR" : d.currency }))}>
                Shown only, billed by hand
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {field("included_storage_gb", "Included storage (GB)", "Free every month; compared with the month's average stored GB.")}
            {field("included_bandwidth_gb", "Included bandwidth (GB a month)", "Free every month; downloads and streaming by learners.")}
            {field("storage_rate_per_gb", `Extra storage, ${unit} per GB a month`, "Charged on the average above the included GB (and pack).")}
            {field("bandwidth_rate_per_gb", `Extra bandwidth, ${unit} per GB`, "Charged on every GB above the included amount.")}
            {!credits && (
              <div className="space-y-1.5">
                <Label htmlFor="allowance-currency">Currency</Label>
                <Input id="allowance-currency" value={draft.currency} onChange={set("currency")} />
                <p className="text-xs text-muted-foreground">Three-letter code, e.g. INR or USD.</p>
              </div>
            )}
            {credits && (
              <div className="space-y-1.5">
                <Label htmlFor="allowance-from">First month charged</Label>
                <Input id="allowance-from" type="month" min={thisMonth()} value={draft.charge_from_month}
                  onChange={set("charge_from_month")} />
                <p className="text-xs text-muted-foreground">
                  {monthOk && draft.charge_from_month
                    ? `${monthName(draft.charge_from_month)} is taken from the wallet in early ${monthName(
                        new Date(Date.UTC(Number(draft.charge_from_month.slice(0, 4)), Number(draft.charge_from_month.slice(5, 7)), 1))
                          .toISOString().slice(0, 7))}. Earlier months are never charged.`
                    : "Pick a month."}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Storage pack (fixed monthly price instead of per-GB overage)</Label>
            <div className="flex flex-wrap gap-2">
              {PACKS.map((p, i) => (
                <Button key={p.label} size="sm" variant={packIndex === i ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, addon_storage_gb: String(p.gb), addon_price_per_month: String(p.credits) }))}>
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {field("addon_storage_gb", "Pack size (GB)", "Added to the included storage. Custom deals: type any size.")}
              {field("addon_price_per_month", `Pack price, ${unit} a month`, "Charged every month the plan is active.")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="allowance-note">Note (internal)</Label>
            <Textarea id="allowance-note" rows={2} placeholder="e.g. Agreed in the 1 Dec proposal"
              value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
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
          {!valid && (
            <p className="text-xs text-destructive">
              Fill every amount with a number of 0 or more{credits ? " and pick the first month" : " and a three-letter currency"}.
            </p>
          )}
        </CardContent>
      </Card>

      {data?.current_month && data?.previous_month && (
        <div className="grid gap-4 md:grid-cols-2">
          <MonthCard title="This month so far" status={data.current_month} />
          <MonthCard title="Last month (at today's terms)" status={data.previous_month} />
        </div>
      )}

      {allowance && <ChargesCard charges={data?.charges ?? []} />}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove the storage plan?</DialogTitle>
            <DialogDescription>
              The institute's admins will see plain usage again and nothing more is charged. Months already charged
              stay charged. You can set a plan again at any time.
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
