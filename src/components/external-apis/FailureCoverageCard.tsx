import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFailureSources, useLoggedVendors } from "@/services/external-apis-api";
import { count, dateTime } from "./format";

interface Source {
  key: string;
  name: string;
  covers: string;
  gaps: string;
}

/** Every place a failed third-party call can be recorded, and what each one cannot see. */
const SOURCES: Source[] = [
  {
    key: "ai",
    name: "AI service",
    covers: "Every outside call it makes over HTTP: OpenRouter, Sarvam, fal.ai, Serper, Mathpix, Pexels and the rest, when automatic recording is on.",
    gaps: "Streaming sockets (the tutor's live speech) record only what the code reports.",
  },
  {
    key: "voice_bot",
    name: "Voice bot (AI calling)",
    covers: "Every HTTP error or connection failure to an outside vendor, Sarvam refusing a key (out of credits, rate limited, revoked), and a call switching to the fallback speech vendor mid-call.",
    gaps: "Copied in every 30 seconds from the bot's last 200 failures; a burst bigger than that between two checks loses the oldest.",
  },
  {
    key: "admin_core",
    name: "Main app",
    covers: "Plivo, Exotel, Airtel, Aavtaar, Razorpay, Meta WhatsApp, WATI, FX rates, workflow HTTP steps and every other call made through its standard HTTP client.",
    gaps: "Not yet: calls made with its two other HTTP libraries (about 40 places, e.g. some Google and Zoom calls) and payment SDKs. Payment outcomes are on the Payments tab.",
  },
];

const ELSEWHERE = [
  "Email and WhatsApp sends are not part of this page.",
  "Payment and webhook failures: the Payments tab.",
  "Telephony call outcomes (busy, no answer, failed): the Telephony tab.",
  "Not recorded anywhere yet: the messaging service (WATI, Meta WhatsApp, email), the media service (CloudConvert, file storage), assessments, community and sign-in services.",
];

export function FailureCoverageCard({ hours }: { hours: number }) {
  const sources = useFailureSources(hours);
  const logged = useLoggedVendors(hours);
  const byKey = new Map((sources.data ?? []).map((s) => [s.source_service, s]));
  const autoCapture = logged.data?.auto_capture;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-sm font-medium">Where failed calls come from</CardTitle>
        <p className="text-xs text-muted-foreground">
          What each service records, so a missing failure is a known gap rather than a surprise.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Records</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Last recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SOURCES.map((s) => {
                const row = byKey.get(s.key);
                const off = s.key === "ai" && autoCapture === false;
                return (
                  <TableRow key={s.key}>
                    <TableCell className="align-top font-medium">
                      {s.name}
                      {off && <div><Badge variant="destructive" className="mt-1">Recording off</Badge></div>}
                      {!row && !sources.isLoading && !off && (
                        <div><Badge variant="outline" className="mt-1">Nothing in this period</Badge></div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md align-top text-xs">
                      <p>{s.covers}</p>
                      <p className="mt-1 text-muted-foreground">{s.gaps}</p>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">{row ? count(row.calls) : "—"}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">{row ? count(row.failed) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                      {row?.last_at ? dateTime(row.last_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {autoCapture === false && (
          <p className="text-xs text-red-700 dark:text-red-400">
            Automatic recording is off, so the AI service's failed calls are not being recorded. Turn it on under All vendors.
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {ELSEWHERE.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
