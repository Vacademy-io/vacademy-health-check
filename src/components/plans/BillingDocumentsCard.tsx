import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorDetail } from "@/lib/eval-api-pricing";
import {
  BRAND_MODE_LABEL,
  ITEM_KIND_LABEL,
  buildStaffCreditNote,
  canIssueCreditNote,
  creditableMinor,
  documentTotals,
  formatMinor,
} from "@/lib/plan-billing";
import { formatDay, formatInrMinor, minorToRupeesText } from "@/lib/plans";
import { PLAN_BILLING_ENDPOINTS, openDocumentPdf, useBillingDocuments, useIssueStaffCreditNote } from "@/services/plan-billing-api";
import type { BillingDocument } from "@/types/plan-billing";
import { PlansSectionError, TonePill } from "./shared";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/** Institute → AI plan: every platform tax invoice and credit note (credit packs and AI plans). */
export function BillingDocumentsCard({ instituteId, notify }: { instituteId: string; notify: Notify }) {
  const docs = useBillingDocuments(instituteId);
  const [opening, setOpening] = useState<string | null>(null);
  const [crediting, setCrediting] = useState<BillingDocument | null>(null);
  const rows = docs.data ?? [];
  const totals = documentTotals(rows);

  const open = async (d: BillingDocument) => {
    setOpening(d.id);
    try {
      await openDocumentPdf(instituteId, d);
    } catch (err) {
      notify("error", errorDetail(err, "Could not open the PDF"));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Invoices and credit notes
        </CardTitle>
        <CardDescription>
          Tax invoices issued by the platform to this institute, for credit packs and AI plans, and the credit notes against them (refunds).
          Amounts come from the payment snapshot taken at order time.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {docs.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : docs.isError ? (
          <PlansSectionError error={docs.error} what="invoices" service="admin-core" path={PLAN_BILLING_ENDPOINTS.documents(instituteId)} onRetry={() => docs.refetch()} />
        ) : rows.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Number</th>
                  <th className="px-2 py-2 font-medium">Issued</th>
                  <th className="px-2 py-2 font-medium">For</th>
                  <th className="px-2 py-2 text-right font-medium">Taxable</th>
                  <th className="px-2 py-2 text-right font-medium">GST</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const cn = d.doc_kind === "CREDIT_NOTE";
                  return (
                    <tr key={`${d.doc_kind}:${d.id}`} className="border-b align-top last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-mono text-xs font-medium">{d.number ?? "(no number)"}</p>
                        <TonePill tone={cn ? "warn" : "muted"}>{cn ? "Credit note" : "Invoice"}</TonePill>
                        {d.brand_mode && <span className="ml-1 text-[10px] text-muted-foreground">{BRAND_MODE_LABEL[d.brand_mode]}</span>}
                      </td>
                      <td className="px-2 py-2 text-xs">{formatDay(d.issued_at)}</td>
                      <td className="px-2 py-2 text-xs">
                        <p>{d.description ?? (d.item_kind ? ITEM_KIND_LABEL[d.item_kind] ?? d.item_kind : "—")}</p>
                        {cn && d.invoice_number && <p className="text-muted-foreground">against {d.invoice_number}</p>}
                        {cn && d.reason && <p className="text-muted-foreground">“{d.reason}”</p>}
                        {d.buyer_legal_name && <p className="text-muted-foreground">{d.buyer_legal_name}</p>}
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums">{formatMinor(d.base_minor, d.currency)}</td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums">{formatMinor(d.tax_minor, d.currency)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {cn ? "−" : ""}
                        {formatMinor(d.total_minor, d.currency)}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 text-right">
                        {canIssueCreditNote(d, rows) && (
                          <Button size="sm" variant="ghost" onClick={() => setCrediting(d)} aria-label={`Issue a credit note against ${d.number ?? "this invoice"}`}>
                            Credit note
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void open(d)} disabled={opening === d.id} aria-label={`Open ${d.number ?? "document"} PDF`}>
                          {opening === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "PDF"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {totals.map((t) => (
                  <tr key={t.currency} className="text-xs text-muted-foreground">
                    <td colSpan={5} className="pt-2 text-right">
                      Invoiced {formatMinor(t.invoiced, t.currency)} − credited {formatMinor(t.credited, t.currency)} =
                    </td>
                    <td className="pt-2 text-right font-medium tabular-nums text-foreground">{formatMinor(t.net, t.currency)}</td>
                    <td />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
      {crediting && <StaffCreditNoteDialog instituteId={instituteId} invoice={crediting} docs={rows} onClose={() => setCrediting(null)} notify={notify} />}
    </Card>
  );
}

/**
 * Staff credit note against an AI-plan invoice: for money returned outside Razorpay (an offline
 * payment refunded by bank transfer) or a waiver after invoicing. Online refunds use Refund on the
 * charge instead (their credit note follows the processed refund).
 */
function StaffCreditNoteDialog({
  instituteId,
  invoice,
  docs,
  onClose,
  notify,
}: {
  instituteId: string;
  invoice: BillingDocument;
  docs: BillingDocument[];
  onClose: () => void;
  notify: Notify;
}) {
  const issue = useIssueStaffCreditNote();
  const left = creditableMinor(invoice, docs);
  const [amount, setAmount] = useState(minorToRupeesText(left));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    const built = buildStaffCreditNote({ amount_rupees: amount, reason }, invoice, docs);
    if ("error" in built) return setError(built.error);
    if (confirm.trim().toUpperCase() !== "CREDIT") return setError("Type CREDIT to confirm");
    issue.mutate(
      { instituteId, invoiceId: invoice.id, body: built.body },
      {
        onSuccess: (r) => {
          notify("success", `Credit note ${r.number ?? ""} issued for ${formatInrMinor(built.body.amount_minor)}${r.emailed ? " and emailed" : ""}.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not issue the credit note")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue a credit note?</DialogTitle>
          <DialogDescription>
            Reduces invoice {invoice.number ?? ""} for money returned outside Razorpay (an offline payment refunded by bank transfer) or a waiver after
            invoicing. It moves no money and does not change the plan. For an online payment, refund the charge instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="scn-amt" className="text-xs font-medium">
              Amount (₹, GST included)
            </label>
            <Input id="scn-amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-9" />
            <p className="text-xs text-muted-foreground">Up to {formatInrMinor(left)} is left on this invoice.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="scn-reason" className="text-xs font-medium">
              Reason
            </label>
            <Input id="scn-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Required — printed on the credit note" className="h-9" />
          </div>
          <div className="space-y-1">
            <label htmlFor="scn-confirm" className="text-xs font-medium">
              Type CREDIT to confirm
            </label>
            <Input id="scn-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 w-32 font-mono" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" onClick={go} disabled={issue.isPending}>
            {issue.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
