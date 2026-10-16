import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toggle } from "@/components/shared/Toggle";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import {
  ASSIGN_SOURCES,
  ENFORCEMENTS,
  ENFORCEMENT_HINT,
  ENFORCEMENT_LABEL,
  PERIOD_MONTH_OPTIONS,
  SOURCE_LABEL,
  buildAssign,
  emptyAssignDraft,
  currentSubscription,
  formatInrMinor,
  periodText,
  sortVersions,
  type AssignDraft,
} from "@/lib/plans";
import { useCreateSubscription, usePlan, usePlans, useSubscriptions } from "@/services/plans-api";
import { useBillingSwitches } from "@/services/plan-billing-api";
import { AFA_FREE_CEILING_MINOR } from "@/lib/plan-billing";
import type { Enforcement } from "@/types/plans";
import { Field, ReasonField, SELECT_CLASS } from "./shared";
import { InstitutePicker } from "./InstitutePicker";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/**
 * Assignment by a super admin. MANUAL / COMPLIMENTARY take no payment and default to SHADOW, which
 * charges as today. PAYMENT is a sales-led paid plan: it is created PENDING with a due charge for the
 * first period, is always Live, and starts when that charge is paid (link, autopay or offline).
 */
export function AssignDialog({
  instituteId = "",
  instituteName = null,
  onClose,
  notify,
}: {
  instituteId?: string;
  instituteName?: string | null;
  onClose: () => void;
  notify: Notify;
}) {
  const create = useCreateSubscription();
  const switches = useBillingSwitches();
  const plans = usePlans();
  const [draft, setDraft] = useState<AssignDraft>(() => emptyAssignDraft(new Date(), instituteId));
  const [name, setName] = useState<string | null>(instituteName);
  const [planId, setPlanId] = useState("");
  const plan = usePlan(planId || null);
  const existing = useSubscriptions(draft.institute_id || null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AssignDraft>(k: K, v: AssignDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const published = sortVersions(plan.data?.versions ?? []).filter((v) => v.status === "PUBLISHED");
  const version = published.find((v) => v.id === draft.plan_version_id) ?? null;
  const live = draft.institute_id ? currentSubscription(existing.data ?? []) : null;
  const paid = draft.source === "PAYMENT";
  const paidPrice = paid ? (draft.price_override_rupees.trim() !== "" ? Math.round(Number(draft.price_override_rupees.replace(/[,₹\s]/g, "")) * 100) : version?.price_minor ?? null) : null;
  const activePlans = (plans.data ?? []).filter((p) => p.is_active);

  const save = () => {
    setError(null);
    const built = buildAssign(draft, version);
    if ("error" in built) return setError(built.error);
    create.mutate(built.body, {
      onSuccess: () => {
        notify(
          "success",
          built.body.source === "PAYMENT"
            ? `${plan.data?.name ?? "Plan"} v${version?.version_no} created for ${name ?? draft.institute_id}, pending payment${built.body.send_link ? "; the payment link goes to its admins" : ""}.`
            : `${plan.data?.name ?? "Plan"} v${version?.version_no} assigned to ${name ?? draft.institute_id} (${ENFORCEMENT_LABEL[built.body.enforcement]}).`
        );
        onClose();
      },
      onError: (err) => setError(errorDetail(err, "Could not assign the plan")),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign an AI plan</DialogTitle>
          <DialogDescription>
            One live subscription per institute. The plan only decides who pays for each AI use; prices stay as they are. Manual and
            complimentary plans take no payment; a paid plan starts when its first payment arrives.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Institute">
            <InstitutePicker
              value={draft.institute_id}
              label={name}
              onChange={(id, n) => {
                set("institute_id", id);
                setName(n);
              }}
              disabled={!!instituteId}
            />
          </Field>
          {live && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This institute already has a {live.status === "PENDING" ? "pending-payment" : live.status.toLowerCase()} subscription ({live.plan_name ?? "plan"} v{live.version_no ?? "?"}). Cancel it, or
              schedule a plan change at renewal from its panel, instead of assigning a second one.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="as-plan">
              <select
                id="as-plan"
                className={SELECT_CLASS}
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  set("plan_version_id", "");
                }}
              >
                <option value="">{plans.isLoading ? "Loading…" : "— pick a plan —"}</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.plan_key})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Published version"
              htmlFor="as-version"
              hint={planId && !plan.isLoading && published.length === 0 ? "This plan has no published version yet." : version ? `${formatInrMinor(version.price_minor)} · ${version.allowance_credits.toLocaleString("en-IN")} credits allowance` : undefined}
            >
              <select
                id="as-version"
                className={SELECT_CLASS}
                value={draft.plan_version_id}
                disabled={!planId || published.length === 0}
                onChange={(e) => {
                  const v = published.find((x) => x.id === e.target.value);
                  setDraft((d) => ({ ...d, plan_version_id: e.target.value, period_months: v?.period_months ?? d.period_months, grace_days: v ? String(v.grace_days) : d.grace_days }));
                }}
              >
                <option value="">— pick a version —</option>
                {published.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_no} · {formatInrMinor(v.price_minor)} {periodText(v.period_months).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            {paid ? (
              <Field label="Start" hint="The first period starts when it is paid; renewals keep that date.">
                <p className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">On payment</p>
              </Field>
            ) : (
              <Field label="Start" htmlFor="as-start" hint="Periods are counted from this moment (the anchor).">
                <Input id="as-start" type="datetime-local" value={draft.start_at} onChange={(e) => set("start_at", e.target.value)} className="h-9" />
              </Field>
            )}
            {paid ? (
              <Field label="Period" hint="A paid plan bills the version's own period.">
                <p className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">{version ? periodText(version.period_months) : "From the version"}</p>
              </Field>
            ) : (
              <Field label="Period" htmlFor="as-period">
                <select id="as-period" className={SELECT_CLASS} value={draft.period_months} onChange={(e) => set("period_months", Number(e.target.value))}>
                  {PERIOD_MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {periodText(m)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Grace days" htmlFor="as-grace">
              <Input id="as-grace" value={draft.grace_days} onChange={(e) => set("grace_days", e.target.value)} inputMode="numeric" className="h-9" />
            </Field>
            <Field label="Source" htmlFor="as-source" hint={paid ? "Paid: a GST invoice per period; unpaid renewals go to grace, then expire." : "Both roll over automatically at period end."}>
              <select id="as-source" className={SELECT_CLASS} value={draft.source} onChange={(e) => set("source", e.target.value as AssignDraft["source"])}>
                {ASSIGN_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={paid ? "Price override (₹ before GST, optional)" : "Price override (₹, optional)"}
              htmlFor="as-price"
              hint={paid ? "A custom deal: the charge base. Blank = the version's price. GST is added at checkout." : "A custom deal. Blank = the version's price. Used for P&L."}
            >
              <Input id="as-price" value={draft.price_override_rupees} onChange={(e) => set("price_override_rupees", e.target.value)} inputMode="decimal" placeholder={version ? String(version.price_minor / 100) : ""} className="h-9" />
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Auto-renew</p>
                <p className="text-xs text-muted-foreground">Off: the subscription expires at the end of the period.</p>
              </div>
              <Toggle checked={draft.auto_renew} onChange={(v) => set("auto_renew", v)} label="Auto-renew" />
            </div>
          </div>
          {paid ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Email the payment link now</p>
                  <p className="text-xs text-muted-foreground">
                    Off: the charge is created and you send the link later from the subscription's Billing card (or record an offline payment).
                  </p>
                </div>
                <Toggle checked={draft.send_link} onChange={(v) => set("send_link", v)} label="Email the payment link now" />
              </div>
              <p className="text-xs text-muted-foreground">
                Enforcement is Live for paid plans: benefits apply only to paid periods. The institute's admin can register autopay when paying
                {paidPrice !== null && paidPrice > AFA_FREE_CEILING_MINOR ? `; above ${formatInrMinor(AFA_FREE_CEILING_MINOR)} per period renewals always go by link` : ""}.
              </p>
              {switches.loaded && switches.paymentsEnabled !== true && (
                <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  billing.subscriptions.payments.enabled is off: no payment link can be created yet. Only an offline payment or a waiver can start this plan.
                </p>
              )}
              {version && version.currency.toUpperCase() !== "INR" && (
                <p className="text-xs text-destructive">This version is priced in {version.currency}; paid plans are INR only.</p>
              )}
            </div>
          ) : (
          <Field label="Enforcement">
            <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Enforcement">
              {ENFORCEMENTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={draft.enforcement === e}
                  onClick={() => set("enforcement", e as Enforcement)}
                  className={cn("rounded px-3 py-1 text-xs font-medium transition-colors", draft.enforcement === e ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >
                  {ENFORCEMENT_LABEL[e]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{ENFORCEMENT_HINT[draft.enforcement]}</p>
            {draft.enforcement === "LIVE" && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Live changes this institute's bills from the start date. The usual path is Shadow first, compare on Plan P&L,
                then switch to Live from the subscription panel.
              </p>
            )}
          </Field>
          )}
          <ReasonField id="as-reason" value={draft.reason} onChange={(v) => set("reason", v)} placeholder="Required — e.g. pilot agreed with the owner on 15 Oct" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {paid ? (draft.send_link ? "Create and send link" : "Create pending plan") : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
