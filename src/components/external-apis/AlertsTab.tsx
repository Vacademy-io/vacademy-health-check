import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type ApiAlert,
  type ApiAlertSettings,
  useApiAlerts,
  useMuteApiAlert,
  useSaveAlertSettings,
  useSendTestAlert,
} from "@/services/external-apis-api";
import { alertProblem, dateTime, keyEnding, vendorName } from "./format";
import { EmptyNote, ErrorNote } from "./parts";

function SettingsCard({ saved }: { saved: ApiAlertSettings }) {
  const save = useSaveAlertSettings();
  const test = useSendTestAlert();
  const [emails, setEmails] = useState(saved.emails);
  const [failures, setFailures] = useState(String(saved.consecutive_failures));
  const [repeat, setRepeat] = useState(String(saved.repeat_hours));

  const failureCount = Number(failures);
  const repeatHours = Number(repeat);
  const valid = Number.isInteger(failureCount) && failureCount >= 2 && failureCount <= 50
    && Number.isInteger(repeatHours) && repeatHours >= 1 && repeatHours <= 168;
  const changed = emails !== saved.emails || failureCount !== saved.consecutive_failures || repeatHours !== saved.repeat_hours;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Who gets told</CardTitle>
        <p className="text-xs text-muted-foreground">
          {saved.emails
            ? "These addresses get an email when an API runs out of credits or keeps failing, reminders while it lasts, and a note when it works again."
            : "Nobody is emailed yet. Add an address to start. Problems still show above either way."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <label className="space-y-1 text-sm font-medium">
            Email addresses, separated by commas
            <Input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="tech@yourcompany.com, finance@yourcompany.com"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Alert after this many failures in a row
            <Input
              type="number"
              min={2}
              max={50}
              className="sm:w-28"
              value={failures}
              onChange={(e) => setFailures(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Remind every (hours)
            <Input
              type="number"
              min={1}
              max={168}
              className="sm:w-28"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
        </div>
        {!valid && <p className="text-xs text-red-700">Failures in a row must be 2 to 50, and reminders 1 to 168 hours.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!valid || !changed || save.isPending}
            onClick={() => save.mutate({ emails, consecutive_failures: failureCount, repeat_hours: repeatHours })}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            disabled={!saved.emails || changed || test.isPending}
            title={changed ? "Save first, so the test goes to these addresses" : undefined}
            onClick={() => test.mutate()}
          >
            {test.isPending ? "Sending..." : "Send a test email"}
          </Button>
          {test.isSuccess && <span className="text-xs text-muted-foreground">Sent to {test.data.sent_to.join(", ")}. Check the inbox and spam folder.</span>}
        </div>
        {save.isError && <ErrorNote title="Could not save" error={save.error} />}
        {test.isError && <ErrorNote title="Could not send the test email" error={test.error} />}
      </CardContent>
    </Card>
  );
}

function AlertRow({ alert }: { alert: ApiAlert }) {
  const mute = useMuteApiAlert();
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{vendorName(alert.vendor)}</div>
        <div className="text-xs text-muted-foreground">{keyEnding(alert.key_hint)}</div>
        <div className="text-xs text-muted-foreground">{alert.account ?? "Account not entered, may be an institute's own key"}</div>
      </TableCell>
      <TableCell>
        <Badge variant={alert.is_open ? "destructive" : "secondary"}>{alert.is_open ? alertProblem(alert) : "Resolved"}</Badge>
        {alert.muted && <Badge variant="outline" className="ml-1">Muted</Badge>}
      </TableCell>
      <TableCell className="max-w-xs text-xs">
        {alert.last_http_status != null && <div>Status {alert.last_http_status}</div>}
        {alert.last_error && <div className="break-words text-muted-foreground">{alert.last_error}</div>}
        {alert.last_http_status == null && !alert.last_error && "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {alert.is_open ? `Since ${dateTime(alert.opened_at)}` : alert.resolved_at ? `Ended ${dateTime(alert.resolved_at)}` : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {alert.last_notified_at ? dateTime(alert.last_notified_at) : "Not emailed"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          disabled={mute.isPending}
          onClick={() => mute.mutate({ vendor: alert.vendor, key_hint: alert.key_hint, muted: !alert.muted })}
        >
          {alert.muted ? "Unmute" : "Mute"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Which APIs need attention now, and who hears about it. */
export function AlertsTab() {
  const alerts = useApiAlerts();
  const rows = alerts.data?.alerts ?? [];
  const open = rows.filter((a) => a.is_open).length;

  if (alerts.isError) {
    return <ErrorNote title="Could not load API alerts" error={alerts.error} onRetry={() => alerts.refetch()} />;
  }
  if (alerts.isLoading || !alerts.data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">{open ? `${open} ${open === 1 ? "API needs" : "APIs need"} attention` : "API problems"}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Checked every 5 minutes. An API out of credits alerts on the first refused call. Any other failure alerts
            after {alerts.data.consecutive_failures} in a row, with no success between them.
          </p>
        </CardHeader>
        <CardContent>
          {!alerts.data.tables_ready ? (
            <EmptyNote what="alert data yet" hint="The database update for this has not run. It arrives with the next admin-core deployment." />
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API and key</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Last error</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Last email</TableHead>
                  <TableHead className="text-right">Emails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => <AlertRow key={`${a.vendor}:${a.key_hint}`} alert={a} />)}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              No API has had a problem in the last 7 days.
            </div>
          )}
          <p className="pt-3 text-xs text-muted-foreground">
            Watches keyed calls ai-service makes through httpx, and Serper. Java services (telephony, payments, WhatsApp, email)
            and the voice bot are not watched yet.
          </p>
        </CardContent>
      </Card>
      {/* Remounts when the saved values change, so the form always starts from what was saved. */}
      <SettingsCard
        key={`${alerts.data.emails}|${alerts.data.consecutive_failures}|${alerts.data.repeat_hours}`}
        saved={alerts.data}
      />
    </div>
  );
}
