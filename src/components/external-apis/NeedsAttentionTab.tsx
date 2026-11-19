import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLoggedFailures, useRefreshBalances, useVendorBalances } from "@/services/external-apis-api";
import { failingVendors, TOP_UP_WORDS, topUps } from "./attention";
import { collapseSharedPlivo, money } from "./balances";
import { count, dateTime, vendorName } from "./format";
import { periodWords } from "./insights";
import { ErrorNote, Tiles } from "./parts";
import { VendorLogCard } from "./VendorLogCard";

/**
 * The first thing an admin sees: which accounts need money now, which integrated vendors are
 * failing, and each failed call with what we sent and what the vendor answered.
 */
export function NeedsAttentionTab({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const platform = useVendorBalances("platform");
  const telephony = useVendorBalances("telephony");
  const refresh = useRefreshBalances();
  const failures = useLoggedFailures(hours);
  const [vendor, setVendor] = useState<string | null>(null);

  const balances = [...(platform.data ?? []), ...collapseSharedPlivo(telephony.data ?? [])];
  const toTopUp = topUps(balances);
  const failing = failingVendors(failures.data ?? []);
  const failedCalls = failing.reduce((n, v) => n + v.failed, 0);
  const balancesLoading = platform.isLoading || telephony.isLoading;
  const period = periodWords(hours);

  const show = (v: string | null) => {
    setVendor(v);
    // Bring the failed calls into view; they are below the two lists.
    requestAnimationFrame(() => document.getElementById("failed-calls")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="space-y-6">
      <Tiles
        loading={balancesLoading || failures.isLoading}
        items={[
          { label: "Accounts to top up", value: count(toTopUp.length), tone: toTopUp.length ? "warn" : undefined, note: toTopUp.length ? "Listed below with a link to add money" : "Every balance we can read is fine" },
          { label: `Vendors failing (${period})`, value: count(failing.length), tone: failing.length ? "warn" : undefined, note: failing.length ? `Latest: ${vendorName(failing[0].vendor)}` : "No failed calls to integrated vendors" },
          { label: `Failed calls (${period})`, value: count(failedCalls), note: "Open one to see the request and the vendor's answer" },
        ]}
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Top up</CardTitle>
            <p className="text-xs text-muted-foreground">
              Accounts that are empty, out of credits, below $5 / ₹500, or whose balance could not be read. Vendors with no balance API are listed on the Balances tab.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
            Check balances now
          </Button>
        </CardHeader>
        <CardContent>
          {platform.isError && telephony.isError ? (
            <ErrorNote title="Could not read balances" error={platform.error} onRetry={() => refresh.mutate()} />
          ) : balancesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : toTopUp.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {toTopUp.map(({ row, why, url }) => (
                  <TableRow key={`${row.vendor}-${row.account ?? ""}-${row.institute_name ?? ""}`}>
                    <TableCell className="font-medium">{row.vendor}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.institute_name ?? row.account ?? "Platform account"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.kind === "account_status" ? row.state_label ?? "—" : money(row.balance, row.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={why === "unreadable" ? "outline" : "destructive"}>{TOP_UP_WORDS[why]}</Badge>
                      {row.message && <div className="mt-1 max-w-sm text-xs text-muted-foreground">{row.message}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      {url && (
                        <Button asChild size="sm" variant={why === "unreadable" ? "outline" : "default"}>
                          <a href={url} target="_blank" rel="noreferrer">
                            {why === "unreadable" ? "Open account" : "Top up"}
                            <ExternalLink className="ml-2 h-3 w-3" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to top up. Every balance we can read is above its alert level.</p>
          )}
          {(platform.isError || telephony.isError) && !(platform.isError && telephony.isError) && (
            <p className="mt-3 text-xs text-destructive">
              {platform.isError ? "AI and media vendor balances" : "Plivo and Exotel balances"} could not be read just now, so they are not in this list.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Failing vendors</CardTitle>
          <p className="text-xs text-muted-foreground">
            Integrated third-party APIs with failed calls in the {period}, from every service. Pick one to see its failed calls below.
          </p>
        </CardHeader>
        <CardContent>
          {failures.isError ? (
            <ErrorNote title="Could not load failures" error={failures.error} onRetry={() => failures.refetch()} />
          ) : failures.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : failing.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Failed calls</TableHead>
                  <TableHead>Status codes</TableHead>
                  <TableHead>Likely cause</TableHead>
                  <TableHead>Last failure</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {failing.map((v) => (
                  <TableRow key={v.vendor} className={vendor === v.vendor ? "bg-muted/50" : undefined}>
                    <TableCell className="font-medium">{vendorName(v.vendor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(v.failed)}</TableCell>
                    <TableCell className="text-xs">
                      {v.statuses.slice(0, 3).map((s) => `${s.label} × ${count(s.failed)}`).join(" · ")}
                      {v.statuses.length > 3 && ` · +${v.statuses.length - 3} more`}
                    </TableCell>
                    <TableCell className="text-xs">{v.hint ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime(v.last_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => show(v.vendor)}>See calls</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No failed calls to integrated vendors in the {period}.
              {onWiden && (
                <Button variant="link" className="h-auto px-1 text-sm" onClick={onWiden}>Look at the last 30 days</Button>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <div id="failed-calls" className="space-y-2">
        {vendor && (
          <div className="flex items-center gap-2 text-sm">
            <span>Showing failed calls to <span className="font-medium">{vendorName(vendor)}</span>.</span>
            <Button variant="link" className="h-auto px-0" onClick={() => setVendor(null)}>Show every vendor</Button>
          </div>
        )}
        <VendorLogCard
          key={vendor ?? "all"}
          preset={{ status: "FAILED", ...(vendor ? { vendor } : {}) }}
          title="Failed calls"
          emptyWhat="failed calls"
          onWiden={onWiden}
          description="Click a call to see what we sent and what the vendor answered (keys, tokens, phone numbers and emails hidden)."
          source="calls"
          hours={hours}
          showHttpStatus
          operationLabel="Operation"
          showInstitute
        />
      </div>
    </div>
  );
}
