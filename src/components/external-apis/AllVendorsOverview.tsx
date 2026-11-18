import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useAiComparison,
  useLoggedCallSummary,
  usePaymentSummary,
  useTelephonySummary,
  useWebhookSummary,
} from "@/services/external-apis-api";
import { amountsLabel, money } from "./balances";
import { count, credits, usd } from "./format";
import { changeLabel, leader, minutes, pct, pctLabel, periodWords } from "./insights";
import { Highlights, Tiles } from "./parts";

const sumOf = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((n, r) => n + pick(r), 0);
const isPaid = (status: string) => ["PAID", "SUCCESS", "ACTIVE"].includes(status.toUpperCase());

interface Area {
  tab: string;
  name: string;
  calls: number;
  /** Null where failures are not recorded at all (AI calls are written only on success). */
  failed: number | null;
  cost: string;
  detail: string;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/** Every outside service in one place: how much traffic, what failed and what it cost, per area. */
export function AllVendorsOverview({ hours, onOpen }: { hours: number; onOpen: (tab: string) => void }) {
  const ai = useAiComparison(hours);
  const tel = useTelephonySummary(hours);
  const pay = usePaymentSummary(hours);
  const hooks = useWebhookSummary(hours);
  const logged = useLoggedCallSummary(hours);
  const period = periodWords(hours);
  const { now, before } = ai;

  const telRows = tel.data ?? [];
  const payRows = pay.data ?? [];
  const hookRows = hooks.data ?? [];
  const loggedRows = logged.data ?? [];
  const paid = payRows.filter((r) => isPaid(r.status));
  const loggedCost = loggedRows.map((r) => ({ currency: r.currency, amount: r.cost }));
  const exotelCost = sumOf(telRows.filter((r) => r.provider === "EXOTEL"), (r) => r.price);
  const hookFailed = sumOf(hookRows.filter((r) => r.status === "FAILED"), (r) => r.events);

  const areas: Area[] = [
    {
      tab: "ai",
      name: "AI and metered features",
      calls: now.calls,
      failed: null,
      cost: usd(now.cost_usd),
      detail: `${credits(now.credits)} credits charged`,
      loading: ai.isLoading,
      error: ai.isError,
      retry: ai.refetch,
    },
    {
      tab: "telephony",
      name: "Telephony",
      calls: sumOf(telRows, (r) => r.calls),
      failed: sumOf(telRows.filter((r) => r.status === "FAILED"), (r) => r.calls),
      cost: exotelCost ? `${money(exotelCost, "INR")} (Exotel, paid by institutes)` : "Not reported",
      detail: `${minutes(sumOf(telRows, (r) => r.seconds))} minutes of talk time`,
      loading: tel.isLoading,
      error: tel.isError,
      retry: () => tel.refetch(),
    },
    {
      tab: "payments",
      // Payment attempts only: a webhook is the gateway calling us about the same payment.
      name: "Payments",
      calls: sumOf(payRows, (r) => r.payments),
      failed: sumOf(payRows.filter((r) => r.status.toUpperCase().includes("FAIL")), (r) => r.payments),
      cost: "Gateway fees not reported",
      detail:
        `${amountsLabel(paid.map((r) => ({ currency: r.currency, amount: r.amount })))} collected` +
        (hooks.isError ? "; webhooks couldn't load" : hookFailed ? `; ${count(hookFailed)} webhooks not processed` : ""),
      loading: pay.isLoading,
      error: pay.isError,
      retry: () => { pay.refetch(); hooks.refetch(); },
    },
    {
      tab: "calls",
      name: "Vendor calls & failures",
      calls: sumOf(loggedRows, (r) => r.calls),
      failed: sumOf(loggedRows, (r) => r.failed),
      cost: amountsLabel(loggedCost) === "—" ? "No price entered" : amountsLabel(loggedCost),
      detail: `${new Set(loggedRows.map((r) => r.vendor)).size} vendors`,
      loading: logged.isLoading,
      error: logged.isError,
      retry: () => logged.refetch(),
    },
  ];

  const ok = areas.filter((a) => !a.error);
  const broken = areas.filter((a) => a.error);
  const loading = areas.some((a) => a.loading);
  const total = sumOf(ok, (a) => a.calls);
  // Failure rates only over areas that record failures, so successful-only AI rows don't dilute them.
  const withFailures = ok.filter((a) => a.failed != null);
  const failed = sumOf(withFailures, (a) => a.failed ?? 0);
  const failedOf = sumOf(withFailures, (a) => a.calls);
  const worst = leader(withFailures, (a) => a.failed ?? 0);
  const busiest = leader(ok, (a) => a.calls);
  const weCost = ai.isError || logged.isError ? "—" : amountsLabel([{ currency: "USD", amount: now.cost_usd }, ...loggedCost]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">All outside services</h2>
        <p className="text-xs text-muted-foreground">AI, telephony, payments and every other vendor, in the last {period}.</p>
      </div>
      {broken.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>
            {broken.map((a) => a.name).join(", ")} couldn&apos;t load, so {broken.length === 1 ? "it is" : "they are"} left out of the totals below.
          </span>
          <Button variant="outline" size="sm" onClick={() => broken.forEach((a) => a.retry())}>Try again</Button>
        </div>
      )}
      <Tiles
        loading={loading}
        items={[
          { label: "Calls to outside services", value: count(total), note: busiest ? `Most from ${busiest.row.name.toLowerCase()} (${pctLabel(busiest.share)})` : null },
          {
            label: "Failed",
            value: count(failed),
            note: failedOf
              ? `${pctLabel(pct(failed, failedOf))} of the calls that record failures${worst ? `, most in ${worst.row.name.toLowerCase()}` : ""}. AI calls are recorded only when they succeed.`
              : "AI calls are recorded only when they succeed.",
            tone: failed ? "warn" : undefined,
          },
          { label: "What we paid vendors", value: weCost, note: "Where the vendor reports a cost. Plivo doesn't send one per call." },
          {
            label: "Credits charged to institutes",
            value: ai.isError ? "—" : credits(now.credits),
            note: ai.isError ? "Couldn't load" : changeLabel(now.credits, before.credits, period),
          },
        ]}
      />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By area</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Vendor cost</TableHead>
                  <TableHead>Also</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((a) => (
                  <TableRow key={a.tab}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    {a.error ? (
                      <TableCell colSpan={4} className="text-xs text-red-700 dark:text-red-400">
                        Couldn&apos;t load.{" "}
                        <button type="button" className="underline" onClick={a.retry}>Try again</button>
                      </TableCell>
                    ) : a.loading ? (
                      <TableCell colSpan={4} className="text-xs text-muted-foreground">Loading…</TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums">{count(a.calls)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {a.failed == null ? (
                            <span className="text-muted-foreground">Not recorded</span>
                          ) : a.failed ? `${count(a.failed)} (${pctLabel(pct(a.failed, a.calls))})` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{a.cost}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.detail}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onOpen(a.tab)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Highlights
        items={[
          worst && worst.row.calls > 0 && (pct(worst.row.failed ?? 0, worst.row.calls) ?? 0) >= 5 &&
            `${pctLabel(pct(worst.row.failed ?? 0, worst.row.calls))} of ${worst.row.name.toLowerCase()} failed. Open that tab to see why.`,
          "Balances left with each vendor are on the Balances tab.",
        ]}
      />
    </div>
  );
}
