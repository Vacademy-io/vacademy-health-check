// The summary at the top of each log tab: a few headline figures and what they mean,
// so the table below is for digging in, not for working out the picture.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useAiPeriods,
  useChargeOutcomes,
  useCommunicationTotals,
  useFeatureCosts,
  useLoggedCallSummary,
  usePaymentSummary,
  useTelephonySummary,
  useTelephonyTopInstitutes,
  useWebhookSummary,
} from "@/services/external-apis-api";
import { amountsLabel as amounts, money } from "./balances";
import { chargeLabel, count, humanize, usd, vendorName } from "./format";
import {
  CONNECTED_CALL_STATUS,
  ENDED_CALL_STATUSES,
  groupSum,
  leader,
  minutes,
  pct,
  pctLabel,
  periodWords,
} from "./insights";
import { ErrorNote, Highlights, Tiles } from "./parts";

/** The first few of a long list, then "and N more", so a tile never turns into a wall of text. */
const shortList = (parts: string[], keep = 3): string | null =>
  !parts.length ? null : parts.length <= keep ? parts.join(" · ") : `${parts.slice(0, keep).join(" · ")} and ${parts.length - keep} more`;

const sumOf = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((n, r) => n + pick(r), 0);

// --- Recent calls ---

export function RecentCallsSummary({ hours }: { hours: number }) {
  const ai = useAiPeriods(hours);
  const tel = useTelephonySummary(hours);
  const pay = usePaymentSummary(hours);
  const hooks = useWebhookSummary(hours);
  const logged = useLoggedCallSummary(hours);
  const loading = ai.isLoading || tel.isLoading || pay.isLoading || hooks.isLoading || logged.isLoading;

  const sources = [
    { name: "AI", calls: ai.data?.find((r) => r.current)?.calls ?? 0, failed: 0 },
    { name: "Telephony", calls: sumOf(tel.data ?? [], (r) => r.calls), failed: sumOf((tel.data ?? []).filter((r) => r.status === "FAILED"), (r) => r.calls) },
    { name: "Payments", calls: sumOf(pay.data ?? [], (r) => r.payments), failed: sumOf((pay.data ?? []).filter((r) => r.status.toUpperCase().includes("FAIL")), (r) => r.payments) },
    { name: "Webhooks", calls: sumOf(hooks.data ?? [], (r) => r.events), failed: sumOf((hooks.data ?? []).filter((r) => r.status === "FAILED"), (r) => r.events) },
    { name: "Other vendor calls", calls: sumOf(logged.data ?? [], (r) => r.calls), failed: sumOf(logged.data ?? [], (r) => r.failed) },
  ];
  const total = sumOf(sources, (s) => s.calls);
  const failed = sumOf(sources, (s) => s.failed);
  const worst = leader(sources, (s) => s.failed);
  const busiest = leader(sources, (s) => s.calls);

  return (
    <div className="space-y-3">
      <Tiles
        loading={loading}
        items={[
          { label: "Calls recorded", value: count(total), note: `In the last ${periodWords(hours)}` },
          { label: "Failed", value: count(failed), note: total ? `${pctLabel(pct(failed, total))} of all calls` : null, tone: failed ? "warn" : undefined },
          { label: "Busiest", value: busiest ? busiest.row.name : "—", note: busiest ? `${count(busiest.row.calls)} calls, ${pctLabel(busiest.share)}` : null },
          { label: "Most failures", value: worst ? worst.row.name : "None", note: worst ? `${count(worst.row.failed)} failed` : "Nothing failed" },
        ]}
      />
      <Highlights
        items={[
          worst && worst.row.calls > 0 &&
            `${pctLabel(pct(worst.row.failed, worst.row.calls))} of ${worst.row.name.toLowerCase()} failed. Use "Show failures only" below to see which ones and why.`,
          "AI calls are only recorded once they succeed, so AI failures don't appear here.",
        ]}
      />
    </div>
  );
}

// --- AI calls ---

const NOT_PAID = ["DROPPED_INSUFFICIENT", "SKIPPED_NO_INSTITUTE"];

export function AiCallsSummary({ hours }: { hours: number }) {
  const outcomes = useChargeOutcomes(hours);
  const features = useFeatureCosts(hours);
  const rows = outcomes.data ?? [];
  const total = sumOf(rows, (r) => r.calls);
  const of = (statuses: string[]) => rows.filter((r) => statuses.includes(r.charge_status));
  const charged = of(["POSTED", "PARTIAL_REFUND"]);
  const unpaid = of(NOT_PAID);
  const free = of(["NOT_APPLICABLE"]);
  const refunded = of(["REFUNDED", "PARTIAL_REFUND"]);
  const byModel = groupSum((features.data ?? []).filter((r) => r.model_id), (r) => r.model_id!, (r) => r.cost_usd);
  const modelTotal = sumOf(byModel, (m) => m.total);

  if (outcomes.isError) return <ErrorNote title="Could not load the AI call summary" error={outcomes.error} onRetry={() => outcomes.refetch()} />;

  return (
    <div className="space-y-3">
      <Tiles
        loading={outcomes.isLoading}
        items={[
          { label: "Charged to institutes", value: count(sumOf(charged, (r) => r.calls)), note: total ? `${pctLabel(pct(sumOf(charged, (r) => r.calls), total))} of AI calls` : null },
          { label: "Free by design", value: count(sumOf(free, (r) => r.calls)), note: "Features we don't charge credits for" },
          {
            label: "Ran but not paid for",
            value: count(sumOf(unpaid, (r) => r.calls)),
            note: `${usd(sumOf(unpaid, (r) => r.cost_usd))} vendor cost we absorbed`,
            tone: sumOf(unpaid, (r) => r.calls) ? "warn" : undefined,
          },
          { label: "Refunded", value: count(sumOf(refunded, (r) => r.calls)), note: "Credits given back after a failure" },
        ]}
      />
      <Highlights
        items={[
          ...unpaid.map((r) => r.calls > 0 && `${chargeLabel(r.charge_status)}: ${count(r.calls)} calls costing us ${usd(r.cost_usd)}.`),
          sumOf(free, (r) => r.cost_usd) > 0 && `Free features cost ${usd(sumOf(free, (r) => r.cost_usd))} at the vendor in this period.`,
          byModel[0] && byModel[0].total > 0 &&
            `The most expensive model is ${byModel[0].key}, at ${usd(byModel[0].total)} (${pctLabel(pct(byModel[0].total, modelTotal))} of model spend).`,
        ]}
      />
    </div>
  );
}

// --- Telephony ---

const PLIVO_BACKED = new Set(["PLIVO", "VACADEMY_AI"]);

export function TelephonySummary({ hours }: { hours: number }) {
  const summary = useTelephonySummary(hours);
  const top = useTelephonyTopInstitutes(hours);
  const rows = summary.data ?? [];
  const total = sumOf(rows, (r) => r.calls);
  const ended = rows.filter((r) => ENDED_CALL_STATUSES.includes(r.status));
  const connected = rows.filter((r) => r.status === CONNECTED_CALL_STATUS);
  const unanswered = rows.filter((r) => r.status === "NO_ANSWER" || r.status === "BUSY");
  const failed = rows.filter((r) => r.status === "FAILED");
  const exotel = rows.filter((r) => r.provider === "EXOTEL");
  const plivoConnected = connected.filter((r) => PLIVO_BACKED.has(r.provider));
  const plivoUnbilled = sumOf(plivoConnected, (r) => r.calls - r.billed_calls);
  const byProvider = groupSum(rows, (r) => r.provider, (r) => r.calls);
  const connectRate = pct(sumOf(connected, (r) => r.calls), sumOf(ended, (r) => r.calls));

  if (summary.isError) return <ErrorNote title="Could not load the telephony summary" error={summary.error} onRetry={() => summary.refetch()} />;

  return (
    <div className="space-y-3">
      <Tiles
        loading={summary.isLoading}
        items={[
          { label: "Calls", value: count(total), note: shortList(byProvider.map((p) => `${vendorName(p.key)} ${count(p.total)}`)) },
          {
            label: "Connected",
            value: pctLabel(connectRate),
            note: `${count(sumOf(unanswered, (r) => r.calls))} unanswered or busy, ${count(sumOf(failed, (r) => r.calls))} failed`,
            tone: connectRate != null && connectRate < 40 ? "warn" : undefined,
          },
          { label: "Talk time", value: `${minutes(sumOf(rows, (r) => r.seconds))} min`, note: "Across all providers" },
          {
            label: "Exotel reported cost",
            value: money(sumOf(exotel, (r) => r.price), "INR"),
            note: "Paid by the institutes. Plivo doesn't send call prices.",
          },
        ]}
      />
      <Highlights
        items={[
          sumOf(failed, (r) => r.calls) > 0 &&
            `${count(sumOf(failed, (r) => r.calls))} calls failed outright. Filter the list below by status "Failed" to see the reason.`,
          plivoUnbilled > 0 &&
            `${count(plivoUnbilled)} connected calls on our Plivo account have no credit charge recorded yet. If that stays, we are paying for those minutes.`,
          connectRate != null && connectRate < 40 &&
            "Fewer than 4 in 10 calls connect. Check caller IDs and calling hours with the institutes making the most calls.",
        ]}
      />
      {(top.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Institutes calling the most</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institute</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Connected</TableHead>
                    <TableHead className="text-right">Minutes</TableHead>
                    <TableHead className="text-right">Reported cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(top.data ?? []).map((r) => (
                    <TableRow key={`${r.institute_id}:${r.provider}`}>
                      <TableCell>
                        <Link className="font-medium hover:underline" to={`/institutes/${r.institute_id}`}>{r.institute_name ?? r.institute_id}</Link>
                      </TableCell>
                      <TableCell className="text-xs">{vendorName(r.provider)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(r.calls)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pctLabel(pct(r.connected, r.calls))}</TableCell>
                      <TableCell className="text-right tabular-nums">{minutes(r.seconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.provider === "EXOTEL" ? money(r.price, "INR") : "Not sent"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Payments ---

const isPaid = (status: string) => ["PAID", "SUCCESS", "ACTIVE"].includes(status.toUpperCase());
const isFailed = (status: string) => status.toUpperCase().includes("FAIL");
const isPending = (status: string) => status.toUpperCase().includes("PENDING") || status.toUpperCase() === "INITIATED";

export function PaymentsSummary({ hours }: { hours: number }) {
  const pay = usePaymentSummary(hours);
  const hooks = useWebhookSummary(hours);
  const rows = pay.data ?? [];
  const total = sumOf(rows, (r) => r.payments);
  const paid = rows.filter((r) => isPaid(r.status));
  const failed = rows.filter((r) => isFailed(r.status));
  const pending = rows.filter((r) => isPending(r.status));
  const hookRows = hooks.data ?? [];
  const hookFailed = hookRows.filter((r) => r.status === "FAILED");
  const gateways = groupSum(rows, (r) => r.vendor, (r) => r.payments).map((g) => ({
    name: g.key,
    payments: g.total,
    failed: sumOf(rows.filter((r) => r.vendor === g.key && isFailed(r.status)), (r) => r.payments),
  }));

  if (pay.isError) return <ErrorNote title="Could not load the payments summary" error={pay.error} onRetry={() => pay.refetch()} />;

  return (
    <div className="space-y-3">
      <Tiles
        loading={pay.isLoading}
        items={[
          { label: "Successful payments", value: count(sumOf(paid, (r) => r.payments)), note: total ? `${pctLabel(pct(sumOf(paid, (r) => r.payments), total))} of attempts` : null },
          { label: "Collected", value: amounts(paid.map((r) => ({ currency: r.currency, amount: r.amount }))), note: "Successful payments only" },
          {
            label: "Failed",
            value: count(sumOf(failed, (r) => r.payments)),
            note: `${count(sumOf(pending, (r) => r.payments))} still pending`,
            tone: sumOf(failed, (r) => r.payments) ? "warn" : undefined,
          },
          {
            label: "Webhooks not processed",
            value: count(sumOf(hookFailed, (r) => r.events)),
            note: `Of ${count(sumOf(hookRows, (r) => r.events))} received`,
            tone: sumOf(hookFailed, (r) => r.events) ? "warn" : undefined,
          },
        ]}
      />
      <Highlights
        items={[
          ...gateways
            .filter((g) => g.failed > 0)
            .map((g) => `${vendorName(g.name)}: ${pctLabel(pct(g.failed, g.payments))} of payments failed (${count(g.failed)} of ${count(g.payments)}).`),
          ...groupSum(hookFailed, (r) => r.vendor, (r) => r.events).map(
            (h) => `${count(h.total)} ${vendorName(h.key)} webhooks failed to process. A payment may be paid with the gateway but not marked paid with us.`,
          ),
        ]}
      />
    </div>
  );
}

// --- Messaging ---

export function MessagingSummary({ hours }: { hours: number }) {
  const totals = useCommunicationTotals(hours);
  const t = totals.data;
  if (totals.isError) return null;
  return (
    <div className="space-y-3">
      <Tiles
        loading={totals.isLoading}
        items={[
          { label: "WhatsApp bulk sends", value: count(t?.all), note: "Requests to WATI" },
          { label: "Accepted by WATI", value: count(t?.success), note: t?.all ? `${pctLabel(pct(t.success, t.all))} of requests` : null },
          { label: "Rejected", value: count(t?.failed), note: t?.all ? `${pctLabel(pct(t.failed, t.all))} of requests` : null, tone: t?.failed ? "warn" : undefined },
          { label: "Still waiting", value: count(t ? Math.max(0, t.all - t.success - t.failed) : 0), note: "No answer from WATI yet" },
        ]}
      />
      <Highlights
        items={[
          t && t.failed > 0 && `${count(t.failed)} bulk sends were rejected. Open one below to see WATI's reason, often an unapproved template or an expired token.`,
          "Delivery of each email and WhatsApp message is per institute: pick one in the second table.",
        ]}
      />
    </div>
  );
}

// --- Other logged vendor calls ---

export function LoggedCallsSummary({ hours }: { hours: number }) {
  const summary = useLoggedCallSummary(hours);
  const rows = summary.data ?? [];
  const total = sumOf(rows, (r) => r.calls);
  const failed = sumOf(rows, (r) => r.failed);
  const avgMs = total ? sumOf(rows, (r) => (r.avg_ms ?? 0) * r.calls) / total : null;
  const byVendor = groupSum(rows, (r) => r.vendor, (r) => r.calls).map((v) => ({
    name: v.key,
    calls: v.total,
    failed: sumOf(rows.filter((r) => r.vendor === v.key), (r) => r.failed),
  }));
  const busiest = rows[0];
  const failing = [...byVendor].filter((v) => v.failed > 0).sort((a, b) => b.failed - a.failed);

  if (summary.isError) return <ErrorNote title="Could not load the vendor call summary" error={summary.error} onRetry={() => summary.refetch()} />;

  return (
    <div className="space-y-3">
      <Tiles
        loading={summary.isLoading}
        items={[
          { label: "Calls", value: count(total), note: shortList(byVendor.map((v) => `${vendorName(v.name)} ${count(v.calls)}`)) },
          { label: "Failed", value: count(failed), note: total ? `${pctLabel(pct(failed, total))} of calls` : null, tone: failed ? "warn" : undefined },
          { label: "Recorded cost", value: amounts(rows.map((r) => ({ currency: r.currency, amount: r.cost }))), note: "From the prices entered under Keys & accounts" },
          { label: "Average response", value: avgMs == null ? "—" : `${(avgMs / 1000).toFixed(1)}s`, note: "Time the vendor took to answer" },
        ]}
      />
      <Highlights
        items={[
          ...failing.slice(0, 3).map((v) => `${vendorName(v.name)}: ${count(v.failed)} of ${count(v.calls)} calls failed (${pctLabel(pct(v.failed, v.calls))}).`),
          failing.length > 3 && `${failing.length - 3} more vendors had failures. See the table below.`,
          busiest && `Most used: ${vendorName(busiest.vendor)} ${humanize(busiest.operation).toLowerCase()}, ${count(busiest.calls)} calls.`,
        ]}
      />
      {byVendor.length > 0 && <VendorBreakdown vendors={byVendor} />}
    </div>
  );
}


const BREAKDOWN_ROWS = 8;

/** Calls per vendor, busiest first: a few rows, with the rest one click away. */
function VendorBreakdown({ vendors }: { vendors: Array<{ name: string; calls: number; failed: number }> }) {
  const [all, setAll] = useState(false);
  const shown = all ? vendors : vendors.slice(0, BREAKDOWN_ROWS);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Calls by vendor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Failure rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((v) => (
                <TableRow key={v.name}>
                  <TableCell className="break-all font-medium">{vendorName(v.name)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(v.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.failed ? count(v.failed) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.failed ? pctLabel(pct(v.failed, v.calls)) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {vendors.length > BREAKDOWN_ROWS && (
          <div className="pt-3 text-center">
            <Button variant="outline" size="sm" onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : `Show all ${vendors.length} vendors`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
