import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useAiComparison,
  useEmailEvents,
  useMessageStatuses,
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
  failed: number;
  cost: string;
  detail: string;
}

/** Every outside service in one place: how much traffic, what failed and what it cost, per area. */
export function AllVendorsOverview({ hours, onOpen }: { hours: number; onOpen: (tab: string) => void }) {
  const { now, before, ready } = useAiComparison(hours);
  const tel = useTelephonySummary(hours);
  const pay = usePaymentSummary(hours);
  const hooks = useWebhookSummary(hours);
  const logged = useLoggedCallSummary(hours);
  const messages = useMessageStatuses(hours);
  const emailEvents = useEmailEvents(hours);
  const loading = !ready || tel.isLoading || pay.isLoading || hooks.isLoading || logged.isLoading;
  const period = periodWords(hours);

  const telRows = tel.data ?? [];
  const payRows = pay.data ?? [];
  const hookRows = hooks.data ?? [];
  const loggedRows = logged.data ?? [];
  const paid = payRows.filter((r) => isPaid(r.status));
  const loggedCost = loggedRows.map((r) => ({ currency: r.currency, amount: r.cost }));
  const msgRows = messages.data ?? [];
  const billable = sumOf(msgRows, (r) => r.billable);
  const exotelCost = sumOf(telRows.filter((r) => r.provider === "EXOTEL"), (r) => r.price);

  const areas: Area[] = [
    {
      tab: "ai",
      name: "AI and metered features",
      calls: now.calls,
      failed: 0,
      cost: usd(now.cost_usd),
      detail: `${credits(now.credits)} credits charged`,
    },
    {
      tab: "telephony",
      name: "Telephony",
      calls: sumOf(telRows, (r) => r.calls),
      failed: sumOf(telRows.filter((r) => r.status === "FAILED"), (r) => r.calls),
      cost: exotelCost ? `${money(exotelCost, "INR")} (Exotel, paid by institutes)` : "Not reported",
      detail: `${minutes(sumOf(telRows, (r) => r.seconds))} minutes of talk time`,
    },
    {
      tab: "payments",
      name: "Payments",
      calls: sumOf(payRows, (r) => r.payments) + sumOf(hookRows, (r) => r.events),
      failed:
        sumOf(payRows.filter((r) => r.status.toUpperCase().includes("FAIL")), (r) => r.payments) +
        sumOf(hookRows.filter((r) => r.status === "FAILED"), (r) => r.events),
      cost: "Gateway fees not reported",
      detail: `${amountsLabel(paid.map((r) => ({ currency: r.currency, amount: r.amount })))} collected`,
    },
    {
      tab: "messaging",
      name: "Email and WhatsApp",
      calls: sumOf(msgRows, (r) => r.sends),
      // WhatsApp messages Meta rejected, and emails that bounced.
      failed:
        sumOf(msgRows.filter((r) => r.channel === "WHATSAPP_MESSAGE_OUTGOING" && r.status === "FAILED"), (r) => r.sends) +
        sumOf((emailEvents.data ?? []).filter((e) => e.event === "BOUNCE"), (e) => e.events),
      cost: billable ? `${count(billable)} WhatsApp messages billed by Meta` : "Not reported",
      detail: messages.isError
        ? "Couldn't load"
        : `${count(sumOf(msgRows.filter((r) => r.channel === "EMAIL"), (r) => r.sends))} emails, ${count(sumOf(msgRows.filter((r) => r.channel !== "EMAIL"), (r) => r.sends))} WhatsApp`,
    },
    {
      tab: "calls",
      name: "Other vendor calls",
      calls: sumOf(loggedRows, (r) => r.calls),
      failed: sumOf(loggedRows, (r) => r.failed),
      cost: amountsLabel(loggedCost) === "—" ? "No price entered" : amountsLabel(loggedCost),
      detail: `${new Set(loggedRows.map((r) => r.vendor)).size} vendors`,
    },
  ];

  const total = sumOf(areas, (a) => a.calls);
  const failed = sumOf(areas, (a) => a.failed);
  const worst = leader(areas, (a) => a.failed);
  const busiest = leader(areas, (a) => a.calls);
  const weCost = amountsLabel([{ currency: "USD", amount: now.cost_usd }, ...loggedCost]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">All outside services</h2>
        <p className="text-xs text-muted-foreground">AI, telephony, payments, messaging and every other vendor, in the last {period}.</p>
      </div>
      <Tiles
        loading={loading}
        items={[
          { label: "Calls to outside services", value: count(total), note: busiest ? `Most from ${busiest.row.name.toLowerCase()} (${pctLabel(busiest.share)})` : null },
          {
            label: "Failed",
            value: count(failed),
            note: total ? `${pctLabel(pct(failed, total))} of calls${worst ? `, most in ${worst.row.name.toLowerCase()}` : ""}` : null,
            tone: failed ? "warn" : undefined,
          },
          { label: "What we paid vendors", value: weCost, note: "Where the vendor reports a cost. Plivo and Meta don't send one per call." },
          { label: "Credits charged to institutes", value: credits(now.credits), note: changeLabel(now.credits, before.credits, period) },
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
                    <TableCell className="text-right tabular-nums">{count(a.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.tab === "ai" ? <span className="text-muted-foreground">Not recorded</span> : a.failed ? `${count(a.failed)} (${pctLabel(pct(a.failed, a.calls))})` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{a.cost}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.detail}</TableCell>
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
          worst && worst.row.calls > 0 && pct(worst.row.failed, worst.row.calls)! >= 5 &&
            `${pctLabel(pct(worst.row.failed, worst.row.calls))} of ${worst.row.name.toLowerCase()} failed. Open that tab to see why.`,
          "Balances left with each vendor are on the Balances tab.",
        ]}
      />
    </div>
  );
}
