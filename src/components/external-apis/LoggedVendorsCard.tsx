import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VENDOR_LOG_NAMES } from "@/lib/external-api-catalog";
import { useLoggedVendors, useSetAutoCapture } from "@/services/external-apis-api";
import { count, dateTime, vendorName } from "./format";
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
              ? "Automatic capture is on: every third-party httpx call from ai-service is logged, metadata only. Java services and the voice bot are not covered."
              : "Automatic capture is off, so only vendors with explicit logging appear. Turning it on logs host, method, status and timing, never bodies, and the table has no cleanup yet."}
            {unlisted > 0 && ` ${unlisted} not in the catalog yet.`}
          </p>
        </div>
        {logged.data && (
          <Button
            variant="outline"
            disabled={setAutoCapture.isPending}
            onClick={() => setAutoCapture.mutate(!autoCapture)}
          >
            {autoCapture ? "Turn off automatic capture" : "Turn on automatic capture"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {setAutoCapture.isError && <ErrorNote title="Could not change automatic capture" error={setAutoCapture.error} />}
        {logged.isError ? (
          <ErrorNote title="Could not load vendors seen in live traffic" error={logged.error} onRetry={() => logged.refetch()} />
        ) : logged.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : logged.data?.tables_ready === false ? (
          <EmptyNote what="vendor data yet" hint="The database update for this has not run. It arrives with the next admin-core deployment." />
        ) : vendors.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Service</TableHead>
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
                  <TableCell className="text-xs">{v.source_service}</TableCell>
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
