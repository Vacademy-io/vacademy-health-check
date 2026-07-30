import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProvisionDemoDialog } from "./ProvisionDemoDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListQuotes,
  adminUpdateQuoteStatus,
  money,
  type SavedQuote,
} from "@/services/pricing-api";

const STATUSES = ["DRAFT", "SENT", "AGREED", "LOST"] as const;

const SOURCE_LABELS: Record<string, string> = {
  ONBOARDING: "From onboarding form",
  STANDALONE: "Public pricing link",
  INTERNAL: "Built by the team",
};

/** Every plan a prospect has built, newest first, with the line-item breakdown on expand. */
export function QuotesTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pricing", "quotes", status, source],
    queryFn: () => adminListQuotes({ status: status || undefined, source: source || undefined }),
  });

  const setQuoteStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => adminUpdateQuoteStatus(id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing", "quotes"] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Couldn't load quotes. If this persists, the pricing backend may not be deployed yet.
      </p>
    );
  }

  const quotes = data?.content ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={source || "ALL"} onValueChange={(v) => setSource(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="self-center text-sm text-muted-foreground">
          {data?.totalElements ?? 0} quote{(data?.totalElements ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No quotes yet. They appear here as soon as someone saves a plan.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Organization</th>
                <th className="px-3 py-2.5 font-medium">Contact</th>
                <th className="px-3 py-2.5 font-medium">Plan</th>
                <th className="px-3 py-2.5 text-right font-medium">First year</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.map((q) => (
                <QuoteRow
                  key={q.id}
                  quote={q}
                  expanded={open === q.id}
                  onToggle={() => setOpen(open === q.id ? null : q.id)}
                  onStatus={(next) => setQuoteStatus.mutate({ id: q.id, next })}
                  onProvisioned={() => qc.invalidateQueries({ queryKey: ["pricing", "quotes"] })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuoteRow({
  quote,
  expanded,
  onToggle,
  onStatus,
  onProvisioned,
}: {
  quote: SavedQuote;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (next: string) => void;
  onProvisioned: () => void;
}) {
  const [provisioning, setProvisioning] = useState(false);
  const symbol = quote.currency === "INR" ? "₹" : "$";
  // The breakdown was snapshotted as JSON at save time, so an old quote reads back correctly
  // even after the rate card changes.
  let breakdown: { recurringLines?: { label: string; amount: number; includedFree: boolean }[]; oneTimeLines?: { label: string; amount: number }[] } | null = null;
  try {
    breakdown = quote.breakdown ? JSON.parse(quote.breakdown) : null;
  } catch {
    breakdown = null;
  }

  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/30" onClick={onToggle}>
        <td className="px-3 py-3 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-3 font-medium">{quote.organizationName || "—"}</td>
        <td className="px-3 py-3">
          <div>{quote.contactName || "—"}</div>
          <div className="text-xs text-muted-foreground">{quote.contactEmail}</div>
        </td>
        <td className="px-3 py-3">
          <div>{quote.bracketCode ? titleCase(quote.bracketCode) : "—"}</div>
          <div className="text-xs text-muted-foreground">{cycleLabel(quote.billingCycle)}</div>
        </td>
        <td className="px-3 py-3 text-right font-medium tabular-nums">
          {money(quote.total, symbol)}
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">
          {SOURCE_LABELS[quote.source] ?? quote.source}
        </td>
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <Select value={quote.status} onValueChange={onStatus}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={6} className="px-3 py-4">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What they picked
                </p>
                {breakdown ? (
                  <ul className="space-y-1">
                    {[...(breakdown.recurringLines ?? []), ...(breakdown.oneTimeLines ?? [])].map(
                      (l, i) => (
                        <li key={i} className="flex justify-between gap-4 text-sm">
                          <span className="text-muted-foreground">{l.label}</span>
                          <span className="tabular-nums">
                            {"includedFree" in l && (l as { includedFree: boolean }).includedFree
                              ? "Free"
                              : money(l.amount, symbol)}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No breakdown stored.</p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <Row label="Recurring (list)" value={money(quote.recurringAnnual, symbol)} />
                <Row label="One-time" value={money(quote.oneTimeTotal, symbol)} />
                <Row label="Subtotal" value={money(quote.subtotal, symbol)} />
                <Row label="Tax" value={money(quote.taxAmount, symbol)} />
                <Row label="First year total" value={money(quote.total, symbol)} bold />
                <div className="pt-3">
                  {quote.provisionedInstituteId ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <strong>Demo workspace live.</strong>{" "}
                      {quote.demoExpiresAt
                        ? new Date(quote.demoExpiresAt) < new Date()
                          ? `Expired ${new Date(quote.demoExpiresAt).toLocaleDateString()} — they can no longer sign in.`
                          : `Access ends ${new Date(quote.demoExpiresAt).toLocaleDateString()}.`
                        : "No end date recorded."}
                      <span className="ml-1 font-mono opacity-70">{quote.provisionedInstituteId}</span>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setProvisioning(true)}>
                      <Rocket className="mr-1.5 h-3.5 w-3.5" />
                      Create demo account
                    </Button>
                  )}
                  <ProvisionDemoDialog
                    quote={quote}
                    open={provisioning}
                    onOpenChange={setProvisioning}
                    onProvisioned={onProvisioned}
                  />
                </div>
                <p className="pt-2 text-xs text-muted-foreground">
                  {quote.contactPhone && <>Phone {quote.contactPhone} · </>}
                  Rate card {quote.rateCardVersion ?? "—"}
                  {quote.submissionId && <> · linked to an onboarding submission</>}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "border-t pt-1 font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function titleCase(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase();
}

function cycleLabel(c: string) {
  return c === "MONTHLY" ? "Monthly" : c === "HALF_YEARLY" ? "Half-yearly" : "Annual upfront";
}
