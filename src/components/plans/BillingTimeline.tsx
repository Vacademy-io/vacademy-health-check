import { useState, type ReactNode } from "react";
import { AlertTriangle, Ban, Banknote, Copy, ExternalLink, Link2, Loader2, ReceiptText, RotateCcw, Undo2, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen } from "@/lib/model-defaults";
import {
  AFA_FREE_CEILING_MINOR,
  CHARGE_KIND_LABEL,
  CHARGE_STATUS_LABEL,
  MANDATE_METHOD_LABEL,
  MANDATE_STATUS_LABEL,
  buildMarkPaid,
  buildRefund,
  chargeActions,
  chargeAmountText,
  chargeTone,
  currentMandate,
  emptyMarkPaidDraft,
  linkExpired,
  mandateCancellable,
  mandateTone,
  refundEffect,
  type MarkPaidDraft,
} from "@/lib/plan-billing";
import { formatDay, formatInrMinor, formatRange, minorToRupeesText, parseRupeesToMinor } from "@/lib/plans";
import {
  useBillingSwitches,
  useCancelMandate,
  useMarkChargePaid,
  useRefundCharge,
  useSendChargeLink,
  useSubscriptionBilling,
  useWaiveCharge,
  type LinkResult,
} from "@/services/plan-billing-api";
import type { SubscriptionCharge, SubscriptionMandate } from "@/types/plan-billing";
import type { Subscription } from "@/types/plans";
import { Field, PlansSectionError, ReasonField, TonePill } from "./shared";

type Notify = (tone: "success" | "error" | "info", text: string) => void;
type Action = { kind: "link" | "paid" | "waive" | "refund"; charge: SubscriptionCharge } | { kind: "mandate"; mandate: SubscriptionMandate };

/** SubscriptionPanel → billing: the charges of a paid subscription, the autopay mandate and the staff money actions. */
export function BillingTimeline({ sub, notify }: { sub: Subscription; notify: Notify }) {
  const switches = useBillingSwitches();
  const billing = useSubscriptionBilling(sub.id);
  const [action, setAction] = useState<Action | null>(null);

  const charges = billing.data?.charges ?? [];
  const mandates = billing.data?.mandates ?? [];
  const mandate = currentMandate(mandates);
  const biggest = charges.reduce((m, c) => Math.max(m, c.total_minor ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-4 w-4" /> Billing
        </CardTitle>
        <CardDescription>
          One charge per period (plus pro-rata upgrades). A charge is collected by autopay when a mandate is active and the amount is within{" "}
          {formatInrMinor(AFA_FREE_CEILING_MINOR)}, otherwise by a payment link. Benefits start only once a period is paid.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {switches.loaded && switches.paymentsEnabled !== true && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-mono">billing.subscriptions.payments.enabled</span> is off{switches.paymentsEnabled === null && " (not registered yet)"}: no
              link is created or debit taken automatically. Offline payment and waivers still work.
            </span>
          </p>
        )}
        {billing.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : billing.isError ? (
          <PlansSectionError error={billing.error} what="subscriptions/{id}/billing" onRetry={() => billing.refetch()} />
        ) : (
          <>
            <MandateRow
              mandate={mandate}
              others={mandates.length - (mandate ? 1 : 0)}
              autopayEnabled={switches.autopayEnabled}
              overCeiling={biggest > AFA_FREE_CEILING_MINOR}
              onCancel={(m) => setAction({ kind: "mandate", mandate: m })}
            />
            {charges.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No charges yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Service period</th>
                      <th className="px-2 py-2 font-medium">Amount</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Collection</th>
                      <th className="py-2 pl-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((c) => (
                      <ChargeRow key={c.id} charge={c} onAction={(kind) => setAction({ kind, charge: c })} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
      {action?.kind === "link" && <SendLinkDialog instituteId={sub.institute_id} charge={action.charge} onClose={() => setAction(null)} notify={notify} />}
      {action?.kind === "paid" && <MarkPaidDialog instituteId={sub.institute_id} charge={action.charge} onClose={() => setAction(null)} notify={notify} />}
      {action?.kind === "waive" && <WaiveDialog instituteId={sub.institute_id} charge={action.charge} onClose={() => setAction(null)} notify={notify} />}
      {action?.kind === "refund" && <RefundDialog instituteId={sub.institute_id} charge={action.charge} onClose={() => setAction(null)} notify={notify} />}
      {action?.kind === "mandate" && <CancelMandateDialog instituteId={sub.institute_id} mandate={action.mandate} onClose={() => setAction(null)} notify={notify} />}
    </Card>
  );
}

function MandateRow({
  mandate,
  others,
  autopayEnabled,
  overCeiling,
  onCancel,
}: {
  mandate: SubscriptionMandate | null;
  others: number;
  autopayEnabled: boolean | null;
  overCeiling: boolean;
  onCancel: (m: SubscriptionMandate) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
      <div className="space-y-1 text-xs">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-muted-foreground" /> Autopay
          {mandate ? (
            <TonePill tone={mandateTone(mandate.status)}>{MANDATE_STATUS_LABEL[mandate.status] ?? mandate.status}</TonePill>
          ) : (
            <TonePill tone="muted">No mandate</TonePill>
          )}
          {autopayEnabled !== true && <span className="text-[11px] font-normal text-muted-foreground">(billing.autopay.enabled is off)</span>}
        </p>
        {mandate ? (
          <p className="text-muted-foreground">
            {MANDATE_METHOD_LABEL[mandate.method ?? ""] ?? mandate.method ?? "Method unknown"}
            {mandate.max_amount_minor !== null && ` · up to ${formatInrMinor(mandate.max_amount_minor)} per debit`} · since {formatDay(mandate.created_at)}
            {mandate.token_id && <span className="ml-1 font-mono text-[10px]">{mandate.token_id}</span>}
          </p>
        ) : (
          <p className="text-muted-foreground">Renewals are collected by payment link. The institute's admin can set up autopay from their billing page.</p>
        )}
        {mandate?.status === "PENDING" && mandate.registration_link_url && (
          <p>
            <CopyLink url={mandate.registration_link_url} label="Approval link" />
          </p>
        )}
        {overCeiling && (
          <p className="text-amber-700 dark:text-amber-300">
            A charge here is above {formatInrMinor(AFA_FREE_CEILING_MINOR)}: those always go by payment link, mandate or not.
          </p>
        )}
        {others > 0 && <p className="text-muted-foreground">{others} older mandate{others === 1 ? "" : "s"} (cancelled, rejected or expired).</p>}
      </div>
      {mandate && mandateCancellable(mandate) && (
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => onCancel(mandate)}>
          <Ban className="mr-1 h-4 w-4" /> Cancel mandate
        </Button>
      )}
    </div>
  );
}

function ChargeRow({ charge: c, onAction }: { charge: SubscriptionCharge; onAction: (kind: "link" | "paid" | "waive" | "refund") => void }) {
  const acts = chargeActions(c);
  const expired = linkExpired(c);
  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-3">
        <p className="font-medium">{formatRange(c.service_start, c.service_end)}</p>
        <p className="text-[11px] text-muted-foreground">
          {CHARGE_KIND_LABEL[c.kind] ?? c.kind}
          {c.place_of_supply && ` · place of supply ${c.place_of_supply}`}
        </p>
      </td>
      <td className="px-2 py-2 text-xs tabular-nums">
        {chargeAmountText(c)}
        {c.refunded_minor > 0 && <p className="text-muted-foreground">refunded {formatInrMinor(c.refunded_minor)}</p>}
      </td>
      <td className="px-2 py-2">
        <TonePill tone={chargeTone(c.status)}>{CHARGE_STATUS_LABEL[c.status] ?? c.status}</TonePill>
        {c.invoice_number && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{c.invoice_number}</p>}
      </td>
      <td className="space-y-0.5 px-2 py-2 text-xs text-muted-foreground">
        {c.payment_link_url && (
          <p>
            <CopyLink url={c.payment_link_url} label={expired ? "Link (expired)" : "Payment link"} />
            {c.link_expires_at && <span className="ml-1">{expired ? "expired" : "until"} {formatWhen(c.link_expires_at)}</span>}
          </p>
        )}
        {c.mandate_id && (
          <p>
            Autopay debit{c.debit_attempts > 0 ? ` · ${c.debit_attempts} attempt${c.debit_attempts === 1 ? "" : "s"}` : ""}
            {c.next_attempt_at && ` · next ${formatWhen(c.next_attempt_at)}`}
          </p>
        )}
        {c.pre_debit_notice_sent_at && <p>Pre-debit notice {formatWhen(c.pre_debit_notice_sent_at)}</p>}
        {c.vendor_payment_id && <p className="font-mono text-[10px]">{c.vendor_payment_id}</p>}
        {!c.payment_link_url && !c.mandate_id && !c.vendor_payment_id && <p>—</p>}
      </td>
      <td className="py-2 pl-2">
        <div className="flex flex-wrap justify-end gap-1">
          {acts.link && (
            <Button size="sm" variant="outline" onClick={() => onAction("link")}>
              {acts.link === "send" ? <Link2 className="mr-1 h-3.5 w-3.5" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              {acts.link === "send" ? "Send link" : "Resend link"}
            </Button>
          )}
          {acts.markPaid && (
            <Button size="sm" variant="outline" onClick={() => onAction("paid")}>
              <Banknote className="mr-1 h-3.5 w-3.5" /> Paid offline
            </Button>
          )}
          {acts.waive && (
            <Button size="sm" variant="ghost" onClick={() => onAction("waive")}>
              Waive
            </Button>
          )}
          {acts.refund && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => onAction("refund")}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Refund
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2">
        {label} <ExternalLink className="h-3 w-3" />
      </a>
      <button
        type="button"
        className="rounded p-0.5 hover:bg-accent"
        aria-label="Copy link"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <Copy className="h-3 w-3" />
      </button>
      {copied && <span className="text-[10px]">copied</span>}
    </span>
  );
}

// ---------------------------------------------------------------- dialogs

function ActionDialog({
  title,
  description,
  children,
  error,
  pending,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  error: string | null;
  pending: boolean;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChargeSummary({ charge: c }: { charge: SubscriptionCharge }) {
  return (
    <div className="rounded-md border p-3 text-xs">
      <p className="font-medium">
        {CHARGE_KIND_LABEL[c.kind] ?? c.kind} · {formatRange(c.service_start, c.service_end)}
      </p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">{chargeAmountText(c)}</p>
    </div>
  );
}

function SendLinkDialog({ instituteId, charge, onClose, notify }: { instituteId: string; charge: SubscriptionCharge; onClose: () => void; notify: Notify }) {
  const send = useSendChargeLink();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkResult | null>(null);
  const resend = !!charge.payment_link_url;
  const go = () => {
    setError(null);
    if (!charge.subscription_id) return setError("This charge has no subscription id; reload the page");
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    send.mutate(
      { instituteId, subscriptionId: charge.subscription_id, chargeId: charge.id, reason: reason.trim() },
      {
        onSuccess: (r) => {
          setResult(r);
          if (!r.url) return notify("error", "No link came back; reload the page and check the charge");
          notify(
            r.emailed_to > 0 ? "success" : "info",
            r.emailed_to > 0
              ? `${r.reused ? "Current link" : "Payment link"} emailed to ${r.emailed_to} admin${r.emailed_to === 1 ? "" : "s"}.`
              : "Link created but not emailed (no admin email, or the mail was withheld). Copy it from here."
          );
        },
        onError: (err) => setError(errorDetail(err, "Could not create the link")),
      }
    );
  };
  return (
    <ActionDialog
      title={resend ? "Resend the payment link?" : "Send a payment link?"}
      description={
        resend
          ? "Emails the institute's admins the current link again, or a new one if it has expired or is about to (if the old one was paid meanwhile, the payment is fulfilled instead)."
          : "Creates a Razorpay payment link for this charge now and emails it to the institute's admins."
      }
      error={error}
      pending={send.isPending}
      confirmLabel={result ? "Send again" : resend ? "Resend" : "Send"}
      onConfirm={go}
      onClose={onClose}
    >
      <ChargeSummary charge={charge} />
      {result?.url && (
        <p className="rounded-md border border-emerald-500/40 p-3 text-xs">
          <CopyLink url={result.url} label={result.reused ? "Current payment link" : "New payment link"} />
          {result.expires_at && <span className="ml-1 text-muted-foreground">valid until {formatWhen(result.expires_at)}</span>}
        </p>
      )}
      {!result && <ReasonField id="sl-reason" value={reason} onChange={setReason} />}
    </ActionDialog>
  );
}

function MarkPaidDialog({ instituteId, charge, onClose, notify }: { instituteId: string; charge: SubscriptionCharge; onClose: () => void; notify: Notify }) {
  const mark = useMarkChargePaid();
  const [draft, setDraft] = useState<MarkPaidDraft>(() => emptyMarkPaidDraft(charge));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MarkPaidDraft>(k: K, v: MarkPaidDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const go = () => {
    setError(null);
    const built = buildMarkPaid(draft, charge);
    if ("error" in built) return setError(built.error);
    mark.mutate(
      { instituteId, chargeId: charge.id, body: built.body },
      {
        onSuccess: () => {
          notify("success", `Recorded ${formatInrMinor(built.body.amount_minor)} received offline (${built.body.reference}). The tax invoice is issued from the charge snapshot.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not record the payment")),
      }
    );
  };
  return (
    <ActionDialog
      title="Record an offline payment"
      description="For a bank transfer or cheque that reached the platform account. The charge becomes Paid, the plan activates or renews, the open link is cancelled and a tax invoice is issued."
      error={error}
      pending={mark.isPending}
      confirmLabel="Record payment"
      onConfirm={go}
      onClose={onClose}
    >
      <ChargeSummary charge={charge} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reference (UTR / cheque no.)" htmlFor="mp-ref" hint="3-50 letters, digits or / _ . - ; each reference can be used once.">
          <Input id="mp-ref" value={draft.reference} onChange={(e) => set("reference", e.target.value)} maxLength={50} className="h-9 font-mono" />
        </Field>
        <Field label="Received on" htmlFor="mp-at">
          <Input id="mp-at" type="datetime-local" value={draft.paid_at} onChange={(e) => set("paid_at", e.target.value)} className="h-9" />
        </Field>
        <Field label="Amount received (₹, GST included)" htmlFor="mp-amt" hint={charge.total_minor !== null ? `Must equal ${formatInrMinor(charge.total_minor)}` : "Not priced yet: the server checks it against the GST-inclusive total."}>
          <Input id="mp-amt" value={draft.amount_rupees} onChange={(e) => set("amount_rupees", e.target.value)} inputMode="decimal" className="h-9" />
        </Field>
      </div>
      <ReasonField id="mp-reason" value={draft.reason} onChange={(v) => set("reason", v)} />
    </ActionDialog>
  );
}

function WaiveDialog({ instituteId, charge, onClose, notify }: { instituteId: string; charge: SubscriptionCharge; onClose: () => void; notify: Notify }) {
  const waive = useWaiveCharge();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    waive.mutate(
      { instituteId, chargeId: charge.id, reason: reason.trim() },
      {
        onSuccess: () => {
          notify("success", "Charge waived.");
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not waive the charge")),
      }
    );
  };
  return (
    <ActionDialog
      title="Waive this charge?"
      description="The period is given free: the plan activates or renews without payment, the open link is cancelled, and no tax invoice is issued (no consideration, no supply)."
      error={error}
      pending={waive.isPending}
      confirmLabel="Waive"
      onConfirm={go}
      onClose={onClose}
    >
      <ChargeSummary charge={charge} />
      <ReasonField id="wv-reason" value={reason} onChange={setReason} />
    </ActionDialog>
  );
}

function RefundDialog({ instituteId, charge, onClose, notify }: { instituteId: string; charge: SubscriptionCharge; onClose: () => void; notify: Notify }) {
  const refund = useRefundCharge();
  const refundable = chargeActions(charge).refundableMinor;
  const [amount, setAmount] = useState(minorToRupeesText(refundable));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const parsed = parseRupeesToMinor(amount);
  const amountMinor = "value" in parsed && parsed.value !== null ? parsed.value : null;
  const go = () => {
    setError(null);
    const built = buildRefund({ amount_rupees: amount, reason }, charge);
    if ("error" in built) return setError(built.error);
    if (confirm.trim().toUpperCase() !== "REFUND") return setError("Type REFUND to confirm");
    refund.mutate({ instituteId, body: built.body }, {
      onSuccess: (r) => {
        notify("success", `Refund of ${formatInrMinor(built.body.amount_minor)} started${r.credit_note_number ? `; credit note ${r.credit_note_number}` : ""}.`);
        onClose();
      },
      onError: (err) => setError(errorDetail(err, "Could not start the refund")),
    });
  };
  return (
    <ActionDialog
      title="Refund this payment?"
      description="Refunds the online payment through Razorpay to the original method and issues a GST credit note against the invoice. This cannot be undone."
      error={error}
      pending={refund.isPending}
      confirmLabel="Refund"
      destructive
      onConfirm={go}
      onClose={onClose}
    >
      <ChargeSummary charge={charge} />
      <Field label="Amount (₹, GST included)" htmlFor="rf-amt" hint={`Up to ${formatInrMinor(refundable)}${charge.refunded_minor > 0 ? ` (already refunded ${formatInrMinor(charge.refunded_minor)})` : ""}`}>
        <Input id="rf-amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-9" />
      </Field>
      {amountMinor !== null && amountMinor > 0 && <p className="text-xs text-muted-foreground">{refundEffect(charge, amountMinor)}</p>}
      <ReasonField id="rf-reason" value={reason} onChange={setReason} placeholder="Required — printed on the credit note" />
      <Field label="Type REFUND to confirm" htmlFor="rf-confirm">
        <Input id="rf-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 w-32 font-mono" />
      </Field>
    </ActionDialog>
  );
}

function CancelMandateDialog({ instituteId, mandate, onClose, notify }: { instituteId: string; mandate: SubscriptionMandate; onClose: () => void; notify: Notify }) {
  const cancel = useCancelMandate();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the subscription's history)");
    cancel.mutate(
      { instituteId, mandateId: mandate.id, reason: reason.trim() },
      {
        onSuccess: () => {
          notify("success", "Mandate cancelled. Renewals go by payment link from now on.");
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not cancel the mandate")),
      }
    );
  };
  return (
    <ActionDialog
      title="Cancel the autopay mandate?"
      description="Cancels the token with Razorpay. Any scheduled debit is dropped and that charge falls back to a payment link. The plan itself is not cancelled."
      error={error}
      pending={cancel.isPending}
      confirmLabel="Cancel mandate"
      destructive
      onConfirm={go}
      onClose={onClose}
    >
      <div className="rounded-md border p-3 text-xs">
        <p className="font-medium">
          {MANDATE_METHOD_LABEL[mandate.method ?? ""] ?? mandate.method ?? "Mandate"} · {MANDATE_STATUS_LABEL[mandate.status] ?? mandate.status}
        </p>
        {mandate.max_amount_minor !== null && <p className="text-muted-foreground">Up to {formatInrMinor(mandate.max_amount_minor)} per debit</p>}
      </div>
      <ReasonField id="cm-reason" value={reason} onChange={setReason} />
    </ActionDialog>
  );
}
