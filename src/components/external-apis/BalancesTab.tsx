import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRefreshBalances, useVendorBalances } from "@/services/external-apis-api";
import {
  agoLabel,
  daysLeft,
  money,
  NOT_REPORTED,
  runwayLabel,
  sortBalances,
  totalsByCurrency,
  type VendorBalance,
} from "./balances";
import { EmptyNote, ErrorNote } from "./parts";

function StatusBadge({ row }: { row: VendorBalance }) {
  if (row.status === "error") return <Badge variant="destructive">Check failed</Badge>;
  if (row.status === "not_set_up") return <Badge variant="outline">Not set up</Badge>;
  if (row.kind === "key_limit") return <Badge variant="secondary">Key limit</Badge>;
  return <Badge variant="secondary">Live</Badge>;
}

function PlatformCard({ row }: { row: VendorBalance }) {
  const runway = runwayLabel(daysLeft(row));
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{row.vendor}</p>
            {row.account && <p className="truncate text-xs text-muted-foreground">{row.account}</p>}
          </div>
          <StatusBadge row={row} />
        </div>
        {row.status === "ok" ? (
          <p className="text-2xl font-semibold tabular-nums">{money(row.balance, row.currency)}</p>
        ) : (
          <p className="text-2xl font-semibold text-muted-foreground">—</p>
        )}
        {runway && <p className="text-xs">{runway}</p>}
        {row.message && (
          <p className={`text-xs ${row.status === "error" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
            {row.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Checked {agoLabel(row.checked_at)}</p>
      </CardContent>
    </Card>
  );
}

function PlatformSection() {
  const { data, isLoading, error, refetch } = useVendorBalances("platform");
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Platform keys</h3>
        <p className="text-xs text-muted-foreground">The keys ai-service holds, checked with each vendor.</p>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : error ? (
        <ErrorNote title="Platform balances could not be loaded" error={error} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyNote what="platform keys with a balance API" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortBalances(data).map((row) => <PlatformCard key={`${row.vendor}:${row.account}`} row={row} />)}
        </div>
      )}
    </section>
  );
}

function TelephonySection() {
  const { data, isLoading, error, refetch } = useVendorBalances("telephony");
  const rows = sortBalances(data ?? []);
  const totals = totalsByCurrency(rows);
  const failed = rows.filter((r) => r.status === "error").length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Telephony accounts</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every enabled Exotel and Plivo account, as the provider reports it. Lowest balance first.
        </p>
        {totals.length > 0 && (
          <p className="text-xs">
            {totals.map((t) => `${money(t.total, t.currency)} across ${t.accounts} account${t.accounts === 1 ? "" : "s"}`).join(" · ")}
            {failed > 0 && ` · ${failed} could not be checked`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : error ? (
          <ErrorNote title="Telephony balances could not be loaded" error={error} onRetry={() => refetch()} />
        ) : !rows.length ? (
          <EmptyNote what="enabled Exotel or Plivo accounts" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institute</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.vendor}:${row.institute_id}:${row.account}`}>
                    <TableCell>{row.institute_name ?? row.institute_id ?? "—"}</TableCell>
                    <TableCell>{row.vendor}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.account ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.status === "ok" ? money(row.balance, row.currency) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <StatusBadge row={row} />
                        {row.message && <p className="text-xs text-muted-foreground">{row.message}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{agoLabel(row.checked_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BalancesTab() {
  const refresh = useRefreshBalances();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Balances reported by the vendors themselves, so every figure here is the vendor's, not our estimate.
          Vendors without a balance API are listed at the bottom.
        </p>
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Checking with vendors" : "Check again"}
          </Button>
          <p className="text-xs text-muted-foreground">Balances refresh every 10 minutes on their own.</p>
          {refresh.isError && <p className="text-xs text-red-700 dark:text-red-400">Neither service answered. Try again.</p>}
        </div>
      </div>
      <PlatformSection />
      <TelephonySection />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Not shown here</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {NOT_REPORTED.map((n) => (
              <li key={n.vendors}>
                <span className="font-medium">{n.vendors}</span>
                <span className="text-muted-foreground">: {n.reason}.</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
