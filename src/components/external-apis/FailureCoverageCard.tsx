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
    covers: "Every call to an integrated vendor, whichever HTTP library makes it (httpx, requests, urllib): OpenRouter, Sarvam, fal.ai, RunPod, Serper, Mathpix, Pexels, Pixabay and the rest. Failures are always recorded; successes only while automatic recording is on.",
    gaps: "Streaming sockets (the tutor's live speech) record only what the code reports.",
  },
  {
    key: "voice_bot",
    name: "Voice bot (AI calling)",
    covers: "Every vendor the bot uses: Sarvam, Navana, Smallest, Rumik, Deepgram, Google, Bedrock, OpenRouter and Edge. HTTP errors and connection failures, any error a speech or LLM service raises mid-call, key refusals and voice previews.",
    gaps: "Copied in every 30 seconds from the bot's last 200 failures; a burst bigger than that between two checks loses the oldest.",
  },
  {
    key: "admin_core",
    name: "Main app",
    covers: "Plivo, Exotel, Airtel, Aavtaar, Razorpay (API and SDK), Stripe, Meta WhatsApp, WATI, Zoom and Google Drive recordings, FX rates and workflow HTTP steps: every HTTP client and payment SDK.",
    gaps: "",
  },
  {
    key: "notification",
    name: "Messaging service",
    covers: "WATI and Meta WhatsApp sends and templates, push notifications (Firebase; an uninstalled app is not a failure), email over SES SMTP and SES checks.",
    gaps: "Delivery failures the vendor reports later by webhook are on the vendor's side, not here.",
  },
  {
    key: "assessment",
    name: "Assessments",
    covers: "OpenRouter evaluation and narratives, Mathpix and DocConverter.",
    gaps: "",
  },
  {
    key: "media",
    name: "File service",
    covers: "DocConverter and CloudConvert.",
    gaps: "",
  },
  {
    key: "community",
    name: "Community service",
    covers: "OpenRouter, Google Play, App Store Connect, Microsoft Partner Center, Firebase and GitHub for app builds.",
    gaps: "",
  },
];

const ELSEWHERE = [
  "Only the third-party APIs we have integrated are recorded. Websites read for lead research and course content are not APIs and are left out.",
  "A failed call keeps what we sent and what the vendor answered, with keys, tokens, phone numbers and emails hidden. Open a row to see them.",
  "A new HTTP client added to any Java service without failure recording fails the build, so a new integration cannot fail out of sight.",
  "Payment outcomes and webhooks: the Payments tab. Telephony call outcomes (busy, no answer): the Telephony tab.",
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
                      {off && <div><Badge variant="outline" className="mt-1">Successes not recorded</Badge></div>}
                      {!row && !sources.isLoading && !off && (
                        <div><Badge variant="outline" className="mt-1">Nothing in this period</Badge></div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md align-top text-xs">
                      <p>{s.covers}</p>
                      {s.gaps && <p className="mt-1 text-muted-foreground">{s.gaps}</p>}
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
          <p className="text-xs text-muted-foreground">
            Automatic recording is off, so the AI service's successful calls are not counted. Its failures are always recorded.
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {ELSEWHERE.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
