import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Ban, CalendarClock, Eye, History, Loader2, Plus, Radio, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActorName } from "@/components/shared/ActorName";
import { Toggle } from "@/components/shared/Toggle";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatCredits } from "@/lib/metering";
import { formatWhen } from "@/lib/model-defaults";
import {
  ENFORCEMENT_HINT,
  ENFORCEMENT_LABEL,
  MODE_LABEL,
  PAYMENT_LABEL,
  SOURCE_LABEL,
  allowanceMeter,
  allowedModes,
  applyOverride,
  buildOverride,
  describeCaps,
  describeStateChange,
  emptyOverrideDraft,
  eventLabel,
  formatDay,
  formatInrMinor,
  formatRange,
  formatUsd,
  isLiveStatus,
  periodText,
  sortVersions,
  type OverrideDraft,
} from "@/lib/plans";
import {
  useBillingFeatures,
  useCancelSubscription,
  useCreateOverride,
  useDeleteOverride,
  usePatchSubscription,
  usePlan,
  usePlans,
  useSubscriptionEvents,
  useSubscriptionOverrides,
} from "@/services/plans-api";
import type { BillingFeature, Enforcement, ItemMode, PaymentStatus, Subscription, SubscriptionOverride, SubscriptionPatch } from "@/types/plans";
import { EnforcementPill, Field, MeterBar, ModeBadge, PlansSectionError, ReasonField, SELECT_CLASS, StatusPill } from "./shared";
import { BillingTimeline } from "./BillingTimeline";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/** Everything a super admin can do to one subscription. Used on Subscriptions and the institute "AI plan" tab. */
export function SubscriptionPanel({ sub, plansEnabled, notify }: { sub: Subscription; plansEnabled: boolean | null; notify: Notify }) {
  const live = isLiveStatus(sub.status);
  const paid = sub.source === "PAYMENT";
  const pendingPayment = sub.status === "PENDING";
  const plan = usePlan(sub.plan_id);
  const version = plan.data?.versions.find((v) => v.id === sub.plan_version_id) ?? null;
  const pending = useMemo(() => {
    if (!sub.pending_plan_version_id) return null;
    return plan.data?.versions.find((v) => v.id === sub.pending_plan_version_id) ?? null;
  }, [plan.data, sub.pending_plan_version_id]);
  const meter = allowanceMeter(sub.current_period);
  const price = sub.price_override_minor ?? sub.current_period?.price_minor_snapshot ?? sub.version_price_minor ?? version?.price_minor ?? null;
  const [dialog, setDialog] = useState<null | "enforcement" | "cancel" | "renewal" | "auto_renew" | "cancel_at_end">(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {sub.plan_name ?? plan.data?.name ?? "AI plan"} {sub.version_no !== null ? `v${sub.version_no}` : version ? `v${version.version_no}` : ""}
              </CardTitle>
              <StatusPill status={sub.status} />
              {/* A paid plan keeps its benefits whatever billing.plans.enabled says. */}
              <EnforcementPill enforcement={sub.enforcement} plansEnabled={paid ? true : plansEnabled} />
            </div>
            {sub.plan_id && (
              <Link to={`/ai-plans/${encodeURIComponent(sub.plan_id)}?version=${encodeURIComponent(sub.plan_version_id)}`} className="text-xs font-medium underline underline-offset-2">
                Open plan
              </Link>
            )}
          </div>
          <CardDescription>
            <Link to={`/institutes/${encodeURIComponent(sub.institute_id)}?tab=ai-plan`} className="font-medium hover:underline">
              {sub.institute_name ?? sub.institute_id}
            </Link>
            {sub.institute_name && <span className="ml-1 font-mono text-[11px]">{sub.institute_id}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Current period" value={formatRange(sub.current_period?.period_start ?? sub.anchor_at, sub.current_period?.period_end ?? null)} />
            <Item label="Price" value={`${formatInrMinor(price)}${paid ? " + GST" : ""}${sub.price_override_minor !== null ? " (custom deal)" : ""} · ${periodText(sub.period_months).toLowerCase()}`} />
            <Item label="Source · payment" value={`${SOURCE_LABEL[sub.source] ?? sub.source} · ${sub.current_period?.payment_status ? PAYMENT_LABEL[sub.current_period.payment_status as PaymentStatus] ?? sub.current_period.payment_status : "—"}`} />
            <Item label="Started" value={formatRange(sub.start_at, sub.end_at)} />
          </dl>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium">Allowance this period</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCredits(meter.used)} of {formatCredits(meter.credits)} used · {formatCredits(meter.remaining)} left
              </span>
            </div>
            <MeterBar pct={meter.pct} />
            {sub.enforcement === "SHADOW" && <p className="text-[11px] text-muted-foreground">Shadow never draws on the allowance.</p>}
          </div>

          {pendingPayment && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-500/40 p-3">
              <div className="text-xs">
                <p className="text-sm font-medium">Waiting for the first payment</p>
                <p className="mt-1 text-muted-foreground">
                  Nothing changes for this institute until the first period is paid (by link, autopay or an offline payment recorded under Billing).
                  It then becomes Active and the period starts on the payment date.
                </p>
              </div>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialog("cancel")}>
                <Ban className="mr-1 h-4 w-4" /> Withdraw
              </Button>
            </div>
          )}
          {live && (
            <div className="grid gap-3 lg:grid-cols-2">
              {paid ? (
                <div className="rounded-md border border-blue-500/40 p-3 text-xs">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Radio className="h-4 w-4 text-blue-600" /> Enforcement: Live (paid plan)
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    A paid plan is always Live and gives its benefits only for paid periods. The global switch does not take them away from a paying
                    institute.
                  </p>
                </div>
              ) : (
              <div className={cn("rounded-md border p-3", sub.enforcement === "LIVE" ? "border-blue-500/40" : "border-amber-500/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {sub.enforcement === "LIVE" ? <Radio className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-amber-600" />}
                      Enforcement: {ENFORCEMENT_LABEL[sub.enforcement]}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{ENFORCEMENT_HINT[sub.enforcement]}</p>
                    {plansEnabled !== true && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">billing.plans.enabled is off: this subscription has no effect at all yet.</p>
                    )}
                  </div>
                  <Button size="sm" variant={sub.enforcement === "LIVE" ? "outline" : "default"} onClick={() => setDialog("enforcement")}>
                    {sub.enforcement === "LIVE" ? "Back to Shadow" : "Go Live"}
                  </Button>
                </div>
              </div>
              )}
              <div className="space-y-2 rounded-md border p-3">
                <SettingRow label="Auto-renew" hint="Off: expires at the end of the current period." checked={sub.auto_renew} onClick={() => setDialog("auto_renew")} />
                <SettingRow label="Cancel at period end" hint="On: becomes Cancelled when this period ends; billing then returns to today's." checked={sub.cancel_at_period_end} onClick={() => setDialog("cancel_at_end")} />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <div className="text-xs">
                    <p className="font-medium">Plan at renewal</p>
                    <p className="text-muted-foreground">
                      {sub.pending_plan_version_id
                        ? `Moves to ${pending ? `${plan.data?.name ?? ""} v${pending.version_no}` : sub.pending_plan_version_id} at the next renewal`
                        : "Same version"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDialog("renewal")}>
                    <CalendarClock className="mr-1 h-4 w-4" /> Change at renewal
                  </Button>
                </div>
                <div className="flex justify-end border-t pt-2">
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialog("cancel")}>
                    <Ban className="mr-1 h-4 w-4" /> Cancel subscription
                  </Button>
                </div>
              </div>
            </div>
          )}
          {sub.reason && (
            <p className="text-xs text-muted-foreground">
              Assigned {formatWhen(sub.created_at)} by <ActorName id={sub.created_by} /> — “{sub.reason}”
            </p>
          )}
        </CardContent>
      </Card>

      {paid && <BillingTimeline sub={sub} notify={notify} />}
      <OverridesCard sub={sub} editable={live} notify={notify} />
      <EventsCard subscriptionId={sub.id} />

      {dialog === "enforcement" && <EnforcementDialog sub={sub} plansEnabled={plansEnabled} onClose={() => setDialog(null)} notify={notify} />}
      {dialog === "auto_renew" && (
        <PatchDialog
          sub={sub}
          title={sub.auto_renew ? "Turn auto-renew off?" : "Turn auto-renew on?"}
          description={sub.auto_renew ? "The subscription expires at the end of the current period; billing then returns to today's." : "The subscription rolls into a new period at each period end."}
          patch={{ auto_renew: !sub.auto_renew }}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog === "cancel_at_end" && (
        <PatchDialog
          sub={sub}
          title={sub.cancel_at_period_end ? "Keep the subscription after this period?" : "Cancel at the end of this period?"}
          description={sub.cancel_at_period_end ? "Clears the scheduled cancellation." : `It stays as it is until ${formatDay(sub.current_period?.period_end)}, then becomes Cancelled.`}
          patch={{ cancel_at_period_end: !sub.cancel_at_period_end }}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog === "renewal" && <RenewalDialog sub={sub} onClose={() => setDialog(null)} notify={notify} />}
      {dialog === "cancel" && <CancelDialog sub={sub} onClose={() => setDialog(null)} notify={notify} />}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SettingRow({ label, hint, checked, onClick }: { label: string; hint: string; checked: boolean; onClick: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </div>
      {/* The switch opens a confirmation with a reason; it does not flip on its own. */}
      <Toggle checked={checked} onChange={onClick} label={label} />
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

function PatchDialog({
  sub,
  title,
  description,
  patch,
  onClose,
  notify,
  confirmWord,
  children,
}: {
  sub: Subscription;
  title: string;
  description: string;
  patch: Omit<SubscriptionPatch, "reason">;
  onClose: () => void;
  notify: Notify;
  confirmWord?: string;
  children?: ReactNode;
}) {
  const mutate = usePatchSubscription();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    if (confirmWord && confirm.trim().toUpperCase() !== confirmWord) return setError(`Type ${confirmWord} to confirm`);
    mutate.mutate(
      { id: sub.id, ...patch, reason: reason.trim() },
      {
        onSuccess: () => {
          notify("success", `${sub.institute_name ?? sub.institute_id}: saved.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          <ReasonField id="sp-reason" value={reason} onChange={setReason} />
          {confirmWord && (
            <Field label={`Type ${confirmWord} to confirm`} htmlFor="sp-confirm">
              <Input id="sp-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 w-32 font-mono" />
            </Field>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={mutate.isPending}>
            {mutate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnforcementDialog({ sub, plansEnabled, onClose, notify }: { sub: Subscription; plansEnabled: boolean | null; onClose: () => void; notify: Notify }) {
  const next: Enforcement = sub.enforcement === "LIVE" ? "SHADOW" : "LIVE";
  return (
    <PatchDialog
      sub={sub}
      title={next === "LIVE" ? `Go Live for ${sub.institute_name ?? sub.institute_id}?` : "Back to Shadow?"}
      description={
        next === "LIVE"
          ? "From the next AI use, this institute's billing follows the plan: included uses stop costing credits, allowance uses draw down the allowance, the rest is charged as today."
          : "From the next AI use, every use is charged from the wallet exactly as today; the plan only records what it would have done. Allowance already used this period stays used."
      }
      patch={{ enforcement: next }}
      onClose={onClose}
      notify={notify}
      confirmWord={next === "LIVE" ? "LIVE" : undefined}
    >
      <div className="rounded-md border p-3 text-xs">
        <p className="font-medium">{ENFORCEMENT_LABEL[next]}</p>
        <p className="mt-1 text-muted-foreground">{ENFORCEMENT_HINT[next]}</p>
        {next === "LIVE" && plansEnabled !== true && (
          <p className="mt-2 text-amber-700 dark:text-amber-300">billing.plans.enabled is off, so this takes effect only once the switch is turned on.</p>
        )}
        {next === "LIVE" && <p className="mt-2 text-muted-foreground">AI calling and telephony stay charged in every case.</p>}
      </div>
    </PatchDialog>
  );
}

function RenewalDialog({ sub, onClose, notify }: { sub: Subscription; onClose: () => void; notify: Notify }) {
  const plans = usePlans();
  const [planId, setPlanId] = useState(sub.plan_id ?? "");
  const plan = usePlan(planId || null);
  const [versionId, setVersionId] = useState(sub.pending_plan_version_id ?? "");
  const published = sortVersions(plan.data?.versions ?? []).filter((v) => v.status === "PUBLISHED" && v.id !== sub.plan_version_id);
  const clearing = versionId === "";
  return (
    <PatchDialog
      sub={sub}
      title="Change the plan at renewal"
      description="The subscription keeps its current version until the period ends, then renews onto the version picked here (its price, allowance and items). Nothing changes now."
      patch={{ pending_plan_version_id: clearing ? null : versionId }}
      onClose={onClose}
      notify={notify}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan" htmlFor="rn-plan">
          <select
            id="rn-plan"
            className={SELECT_CLASS}
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setVersionId("");
            }}
          >
            <option value="">— pick a plan —</option>
            {(plans.data ?? []).filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Published version" htmlFor="rn-version" hint={clearing ? (sub.pending_plan_version_id ? "Leaving this empty clears the scheduled change." : "Pick the version to renew onto.") : undefined}>
          <select id="rn-version" className={SELECT_CLASS} value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!planId}>
            <option value="">— keep the current version —</option>
            {published.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no} · {formatInrMinor(v.price_minor)} · {v.allowance_credits.toLocaleString("en-IN")} credits
              </option>
            ))}
          </select>
        </Field>
      </div>
    </PatchDialog>
  );
}

function CancelDialog({ sub, onClose, notify }: { sub: Subscription; onClose: () => void; notify: Notify }) {
  const cancel = useCancelSubscription();
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    cancel.mutate(
      { id: sub.id, reason: reason.trim(), immediate },
      {
        onSuccess: () => {
          notify("success", `${sub.institute_name ?? sub.institute_id}: subscription ${immediate ? "cancelled" : "set to cancel at period end"}.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not cancel")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel this subscription?</DialogTitle>
          <DialogDescription>
            After cancellation the institute is charged for every AI use exactly as today.{" "}
            {sub.source === "PAYMENT"
              ? "No refund is issued automatically: refund a paid period from Billing (that issues a credit note). Any unpaid charge and its link are voided."
              : "No refund is issued (manual and complimentary plans take no payment)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
            <span>
              <span className="font-medium">Cancel now</span>
              <span className="block text-xs text-muted-foreground">Off: it stays active until the current period ends, then becomes Cancelled.</span>
            </span>
          </label>
          <ReasonField id="cx-reason" value={reason} onChange={setReason} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={go} disabled={cancel.isPending}>
            {cancel.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {immediate ? "Cancel now" : "Cancel at period end"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- overrides

function OverridesCard({ sub, editable, notify }: { sub: Subscription; editable: boolean; notify: Notify }) {
  const overrides = useSubscriptionOverrides(sub.id);
  const features = useBillingFeatures();
  const plan = usePlan(sub.plan_id);
  const version = plan.data?.versions.find((v) => v.id === sub.plan_version_id) ?? null;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SubscriptionOverride | null>(null);
  const labels = useMemo(() => new Map((features.data ?? []).map((f) => [f.feature_key, f.label])), [features.data]);
  const active = (overrides.data ?? []).filter((o) => o.is_active);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Custom deal (overrides)</CardTitle>
            <CardDescription>
              Per-feature changes for this institute only. An override wins over the plan item; the platform eligibility guard
              still wins over both.
            </CardDescription>
          </div>
          {editable && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add override
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {overrides.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : overrides.isError ? (
          <PlansSectionError error={overrides.error} what="subscriptions/{id}/overrides" onRetry={() => overrides.refetch()} />
        ) : active.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No overrides: the plan's items apply as published.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="px-2 py-2 font-medium">Mode</th>
                  <th className="px-2 py-2 font-medium">Caps</th>
                  <th className="px-2 py-2 font-medium">Why</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {active.map((o) => {
                  const planItem = version?.items.find((i) => i.feature_key === o.feature_key);
                  return (
                    <tr key={o.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{labels.get(o.feature_key) ?? o.feature_key}</p>
                        {planItem && <p className="text-[11px] text-muted-foreground">Plan: {MODE_LABEL[planItem.mode]}</p>}
                      </td>
                      <td className="px-2 py-2">{o.mode ? <ModeBadge mode={o.mode} /> : <span className="text-xs text-muted-foreground">Plan's</span>}</td>
                      <td className="px-2 py-2 text-xs">
                        {describeCaps(applyOverride(planItem, o))}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {o.reason}
                        <span className="block">
                          {formatWhen(o.created_at)} · <ActorName id={o.created_by} />
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {editable && (
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(o)} aria-label="Remove override">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {adding && <OverrideDialog sub={sub} features={features.data ?? []} onClose={() => setAdding(false)} notify={notify} />}
      {removing && <RemoveOverrideDialog sub={sub} override={removing} label={labels.get(removing.feature_key) ?? removing.feature_key} onClose={() => setRemoving(null)} notify={notify} />}
    </Card>
  );
}

function OverrideDialog({ sub, features, onClose, notify }: { sub: Subscription; features: BillingFeature[]; onClose: () => void; notify: Notify }) {
  const create = useCreateOverride(sub.id);
  const [draft, setDraft] = useState<OverrideDraft>(() => emptyOverrideDraft());
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof OverrideDraft>(k: K, v: OverrideDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const feature = features.find((f) => f.feature_key === draft.feature_key);
  const modes = feature ? allowedModes(feature.eligibility) : [];
  const capsMatter = draft.mode === "INCLUDED" || draft.mode === "";

  const go = () => {
    setError(null);
    const built = buildOverride(draft, feature);
    if ("error" in built) return setError(built.error);
    create.mutate(built.body, {
      onSuccess: () => {
        notify("success", `Override for ${feature?.label} added.`);
        onClose();
      },
      onError: (err) => setError(errorDetail(err, "Could not add the override")),
    });
  };

  const cap = (k: keyof OverrideDraft, label: string) => (
    <Field label={label}>
      <Input value={draft[k]} onChange={(e) => set(k, e.target.value)} inputMode="decimal" placeholder="Plan's" className="h-9" disabled={!capsMatter} aria-label={label} />
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an override</DialogTitle>
          <DialogDescription>Blank caps keep the plan's. Overrides apply from the next AI use.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Feature" htmlFor="ov-feature">
              <select
                id="ov-feature"
                className={SELECT_CLASS}
                value={draft.feature_key}
                onChange={(e) => setDraft((d) => ({ ...d, feature_key: e.target.value, mode: "" }))}
              >
                <option value="">— pick a feature —</option>
                {features.filter((f) => f.is_active).map((f) => (
                  <option key={f.feature_key} value={f.feature_key}>
                    {f.label}
                    {f.eligibility === "ALWAYS_CHARGED" ? " (always charged)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode" htmlFor="ov-mode">
              <select id="ov-mode" className={SELECT_CLASS} value={draft.mode} onChange={(e) => set("mode", e.target.value as ItemMode | "")} disabled={!feature}>
                <option value="">Keep the plan's mode</option>
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {cap("inst_units_cap", "Institute uses")}
            {cap("inst_credits_cap", "Institute list credits")}
            {cap("inst_cost_usd_cap", "Institute cost USD")}
            {cap("user_units_cap", "Uses per user")}
            {cap("user_credits_cap", "Credits per user")}
          </div>
          {!capsMatter && <p className="text-xs text-muted-foreground">Fair-use caps apply only to included features.</p>}
          {draft.inst_cost_usd_cap.trim() !== "" && Number.isFinite(Number(draft.inst_cost_usd_cap)) && (
            <p className="text-xs text-muted-foreground">Cost cap {formatUsd(Number(draft.inst_cost_usd_cap))} is internal and never shown to the institute.</p>
          )}
          <ReasonField id="ov-reason" value={draft.reason} onChange={(v) => set("reason", v)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveOverrideDialog({ sub, override, label, onClose, notify }: { sub: Subscription; override: SubscriptionOverride; label: string; onClose: () => void; notify: Notify }) {
  const del = useDeleteOverride(sub.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    del.mutate(
      { overrideId: override.id, reason: reason.trim() },
      {
        onSuccess: () => {
          notify("success", `Override for ${label} removed.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not remove the override")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove the override for {label}?</DialogTitle>
          <DialogDescription>The plan item applies again from the next AI use.</DialogDescription>
        </DialogHeader>
        <ReasonField id="rov-reason" value={reason} onChange={setReason} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={go} disabled={del.isPending}>
            {del.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- events

function EventsCard({ subscriptionId }: { subscriptionId: string }) {
  const events = useSubscriptionEvents(subscriptionId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> History
        </CardTitle>
        <CardDescription>Every change to this subscription, with who made it and why.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {events.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.isError ? (
          <PlansSectionError error={events.error} what="subscriptions/{id}/events" onRetry={() => events.refetch()} />
        ) : (events.data ?? []).length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No events yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {(events.data ?? []).map((e) => {
              const change = describeStateChange(e.from_state, e.to_state);
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                  <p className="text-sm font-medium">{eventLabel(e.event_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(e.created_at)} · <ActorName id={e.actor} />
                  </p>
                  {change && <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">{change}</p>}
                  {e.reason && <p className="mt-0.5 text-xs">“{e.reason}”</p>}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
