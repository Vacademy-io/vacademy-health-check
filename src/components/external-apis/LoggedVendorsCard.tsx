import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VENDOR_LOG_NAMES } from "@/lib/external-api-catalog";
import { useLoggedVendors, useSetAutoCapture } from "@/services/external-apis-api";
import { count, dateTime, serviceName, vendorName } from "./format";
import { EmptyNote, ErrorNote } from "./parts";

const CATALOGUED = new Set(Object.values(VENDOR_LOG_NAMES).flat());

/** Vendors the backend has actually logged, so a new API shows up here without a portal change. */
export function LoggedVendorsCard({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const logged = useLoggedVendors(hours);
  const setAutoCapture = useSetAutoCapture();
  const vendors = logged.data?.vendors ?? [];
  const autoCapture = logged.data?.auto_capture ?? false;
  const unlisted = vendors.filter((v) => !CATALOGUED.has(v.vendor)).length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Seen in live traffic</CardTitle>
          <p className="text-xs text-muted-foreground">
            {autoCapture
              ? "Automatic recording is on: every outside call the AI service makes is listed here (which vendor, whether it worked, how long it took; never the content). The main app and the voice bot aren't covered yet."
              : "Automatic recording is off, so only vendors set up to log are listed. Turning it on lists every outside call the AI service makes, never the content. Old records are not cleaned up yet."}
            {unlisted > 0 && ` ${unlisted} new to us: not in the vendor list below yet.`}
          </p>
        </div>
        {logged.data && (
          <Button
            variant="outline"
            disabled={setAutoCapture.isPending}
            onClick={() => setAutoCapture.mutate(!autoCapture)}
          >
            {autoCapture ? "Turn off automatic recording" : "Turn on automatic recording"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {setAutoCapture.isError && <ErrorNote title="Could not change automatic recording" error={setAutoCapture.error} />}
        {logged.isError ? (
          <ErrorNote title="Could not load vendors seen in live traffic" error={logged.error} onRetry={() => logged.refetch()} />
        ) : logged.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : logged.data?.tables_ready === false ? (
          <EmptyNote what="vendor data yet" hint="This arrives with the next release of the main app." />
        ) : vendors.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Called from</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>First seen</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.vendor}>
                  <TableCell className="font-medium">
                    {vendorName(v.vendor)} {!CATALOGUED.has(v.vendor) && <Badge variant="outline">New</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{serviceName(v.source_service)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(v.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(v.failed_calls)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{dateTime(v.first_seen_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{dateTime(v.last_seen_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyNote what="vendor calls logged" hours={hours} onWiden={onWiden} />
        )}
      </CardContent>
    </Card>
  );
}
