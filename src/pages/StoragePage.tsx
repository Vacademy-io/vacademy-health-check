import { useState } from "react";
import { Link } from "react-router-dom";
import { Database, HardDrive, IndianRupee, Loader2, RefreshCw, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes } from "@/lib/file-utils";
import { useMeterNow, useStorageBandwidth, type InstituteUsageRow } from "@/services/storage-usage-api";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function share(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "–";
}

/**
 * Storage and bandwidth per institute with our approximate cost, so heavy users
 * (class recordings above all) can be quoted. Costs are what we pay at the configured
 * rates, not prices.
 */
export default function StoragePage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading, error } = useStorageBandwidth(month);
  const meterNow = useMeterNow();
  const { toasts, push, dismiss } = useToasts();

  const totals = data?.totals;
  const rows: InstituteUsageRow[] = data?.institutes ?? [];
  const unassigned = data?.unassigned;
  const empty = !isLoading && !error && !data?.storage_as_of && !data?.bandwidth_tracking_since;

  const runNow = () =>
    meterNow.mutate(undefined, {
      onSuccess: (r) =>
        push(r.started ? "success" : "error",
          r.started ? `Metering started (bandwidth for ${r.bandwidth_date}). Refreshes in ~2 min.` : r.reason ?? "Not started"),
      onError: () => push("error", "Could not start metering"),
    });

  return (
    <div className="space-y-6">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <PageHeader
        title="Storage & Bandwidth"
        description="What each institute stores and streams, and roughly what it costs us. Updated nightly at 04:00 IST."
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="w-40" />
            <Button variant="outline" onClick={runNow} disabled={meterNow.isPending}>
              {meterNow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Run now
            </Button>
          </div>
        }
      />

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">Could not load usage: {(error as Error).message}</CardContent>
        </Card>
      )}

      {empty && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No usage measured yet. Storage needs the first daily S3 Inventory report (up to 48 h after it was switched
            on); bandwidth starts from the first full day of access logs.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {isLoading || !totals ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard title="Stored" value={formatBytes(totals.storage_bytes)} icon={HardDrive}
              description={data?.storage_as_of ? `as of ${data.storage_as_of}` : "no snapshot yet"} />
            <StatCard title="Class recordings" value={formatBytes(totals.recording_bytes)} icon={Database}
              description={`${share(totals.recording_bytes, totals.storage_bytes)} of storage`} />
            <StatCard title={`Bandwidth, ${data?.month}`} value={formatBytes(totals.bandwidth_bytes)} icon={Wifi}
              description={data?.bandwidth_tracking_since ? `measured since ${data.bandwidth_tracking_since}` : "not measured yet"} />
            <StatCard title="Our cost / month (approx.)" value={inr(totals.total_cost_inr)} icon={IndianRupee}
              description={`storage ${inr(totals.storage_cost_inr)} · bandwidth ${inr(totals.bandwidth_cost_inr)}`} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By institute</CardTitle>
          <CardDescription>
            Sorted by our cost. Rates: storage ${data?.rates.storage_usd_per_gb_month}/GB-month, bandwidth $
            {data?.rates.bandwidth_usd_per_gb}/GB, ₹{data?.rates.usd_to_inr}/$.
            {unassigned && unassigned.storage_bytes > 0 && (
              <> {formatBytes(unassigned.storage_bytes)} of files ({share(unassigned.storage_bytes, totals?.storage_bytes ?? 0)}) could
                not be traced to an institute yet.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institute</TableHead>
                  <TableHead className="text-right">Stored</TableHead>
                  <TableHead className="text-right">Recordings</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Bandwidth</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Our cost / month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.institute_id}>
                    <TableCell>
                      <Link to={`/institutes/${r.institute_id}`} className="font-medium hover:underline">
                        {r.institute_name ?? r.institute_id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatBytes(r.storage_bytes)}</TableCell>
                    <TableCell className="text-right">{formatBytes(r.recording_bytes)}</TableCell>
                    <TableCell className="text-right">{share(r.storage_bytes, totals?.storage_bytes ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatBytes(r.bandwidth_bytes)}</TableCell>
                    <TableCell className="text-right">{r.bandwidth_requests.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right font-medium">{inr(r.total_cost_inr)}</TableCell>
                  </TableRow>
                ))}
                {unassigned && (
                  <TableRow className="text-muted-foreground">
                    <TableCell>Not traced to an institute</TableCell>
                    <TableCell className="text-right">{formatBytes(unassigned.storage_bytes)}</TableCell>
                    <TableCell className="text-right">{formatBytes(unassigned.recording_bytes)}</TableCell>
                    <TableCell className="text-right">{share(unassigned.storage_bytes, totals?.storage_bytes ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatBytes(unassigned.bandwidth_bytes)}</TableCell>
                    <TableCell className="text-right">{unassigned.bandwidth_requests.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">{inr(unassigned.total_cost_inr)}</TableCell>
                  </TableRow>
                )}
                {rows.length === 0 && !unassigned && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No data for this month.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
