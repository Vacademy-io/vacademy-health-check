import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCommunicationTotals,
  useEmailEvents,
  useMessageStatuses,
  useMessagingTopInstitutes,
  useWhatsAppErrors,
  useWhatsAppPricing,
} from "@/services/external-apis-api";
import { count } from "./format";
import { pct, pctLabel, whatsappErrorMeaning } from "./insights";
import { ErrorNote, Highlights, Tiles } from "./parts";

const EMAIL = "EMAIL";
const WHATSAPP = "WHATSAPP_MESSAGE_OUTGOING";
const sumOf = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((n, r) => n + pick(r), 0);

/** Email and WhatsApp volume, delivery and failure reasons, from notification-service's own log. */
export function MessagingOverview({ hours }: { hours: number }) {
  const statuses = useMessageStatuses(hours);
  const events = useEmailEvents(hours);
  const errors = useWhatsAppErrors(hours);
  const pricing = useWhatsAppPricing(hours);
  const institutes = useMessagingTopInstitutes(hours);
  const wati = useCommunicationTotals(hours);

  if (statuses.isError) {
    return (
      <ErrorNote
        title="Could not load email and WhatsApp totals"
        error={statuses.error}
        onRetry={() => statuses.refetch()}
      />
    );
  }

  const rows = statuses.data ?? [];
  const of = (channel: string, status?: string[]) =>
    sumOf(rows.filter((r) => r.channel === channel && (!status || status.includes(r.status))), (r) => r.sends);
  const emails = of(EMAIL);
  const whatsapp = of(WHATSAPP);
  const waFailed = of(WHATSAPP, ["FAILED"]);
  const waDelivered = of(WHATSAPP, ["DELIVERED", "READ"]);
  const waRead = of(WHATSAPP, ["READ"]);
  const waReported = of(WHATSAPP, ["SENT", "DELIVERED", "READ", "FAILED"]);

  const event = (name: string) => sumOf((events.data ?? []).filter((e) => e.event === name), (e) => e.events);
  const bounces = event("BOUNCE");
  const complaints = event("COMPLAINT");
  const delivered = event("DELIVERY");
  const opens = event("OPEN");
  const bounceRate = pct(bounces, emails);

  const priced = pricing.data ?? [];
  const billable = sumOf(priced, (p) => p.messages);
  const topError = errors.data?.[0];

  return (
    <div className="space-y-4">
      <Tiles
        loading={statuses.isLoading}
        items={[
          { label: "Emails sent", value: count(emails), note: delivered ? `${count(delivered)} confirmed delivered` : "Delivery confirmations not received" },
          {
            label: "Email bounces and complaints",
            value: count(bounces + complaints),
            note: emails ? `${pctLabel(bounceRate)} bounced. Above 5%, AWS may pause sending.` : null,
            tone: (bounceRate ?? 0) >= 2 || complaints > 0 ? "warn" : undefined,
          },
          {
            label: "WhatsApp messages sent",
            value: count(whatsapp),
            note: waReported ? `${pctLabel(pct(waDelivered, waReported))} delivered, ${pctLabel(pct(waRead, waReported))} read` : "No delivery reports yet",
          },
          {
            label: "WhatsApp failed",
            value: count(waFailed),
            note: waReported ? `${pctLabel(pct(waFailed, waReported))} of messages Meta reported on` : null,
            tone: waFailed ? "warn" : undefined,
          },
        ]}
      />

      <Highlights
        items={[
          topError && `Most WhatsApp failures (${count(topError.failed)}): ${whatsappErrorMeaning(topError.code)}.`,
          billable > 0 &&
            `Meta billed ${count(billable)} WhatsApp messages: ${priced.map((p) => `${count(p.messages)} ${p.category}`).join(", ")}. Marketing messages cost the most.`,
          emails > 0 && opens > 0 && `${count(opens)} email opens recorded, on emails that have open tracking turned on.`,
          (bounceRate ?? 0) >= 2 && "The bounce rate is high. Check which institute is sending to old or bought contact lists.",
          wati.data && wati.data.all > 0 &&
            `WATI bulk sends: ${count(wati.data.all)} requests, ${count(wati.data.failed)} rejected. Details are in the first table below.`,
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Why WhatsApp messages failed</CardTitle>
          </CardHeader>
          <CardContent>
            {errors.isError ? (
              <ErrorNote title="Could not load failure reasons" error={errors.error} />
            ) : !(errors.data ?? []).length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No failed WhatsApp messages in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Meta code</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(errors.data ?? []).map((e) => (
                    <TableRow key={e.code}>
                      <TableCell className="text-sm">{whatsappErrorMeaning(e.code)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.code === "none" ? "—" : e.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(e.failed)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Institutes sending the most</CardTitle>
          </CardHeader>
          <CardContent>
            {institutes.isError ? (
              <ErrorNote title="Could not load sends by institute" error={institutes.error} />
            ) : !(institutes.data ?? []).length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sends in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institute</TableHead>
                      <TableHead className="text-right">Emails</TableHead>
                      <TableHead className="text-right">WhatsApp</TableHead>
                      <TableHead className="text-right">WhatsApp failed</TableHead>
                      <TableHead className="text-right">Billed by Meta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(institutes.data ?? []).map((r) => (
                      <TableRow key={r.institute_id}>
                        <TableCell>
                          <Link className="font-medium hover:underline" to={`/institutes/${r.institute_id}`}>
                            {r.institute_name ?? r.institute_id}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{count(r.emails)}</TableCell>
                        <TableCell className="text-right tabular-nums">{count(r.whatsapp)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.whatsapp_failed ? `${count(r.whatsapp_failed)} (${pctLabel(pct(r.whatsapp_failed, r.whatsapp))})` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.billable ? count(r.billable) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
