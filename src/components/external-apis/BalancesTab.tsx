import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useProviderTotals,
  useRefreshBalances,
  useTelephonySummary,
  useVendorBalances,
} from "@/services/external-apis-api";
import {
  agoLabel,
  collapseSharedPlivo,
  daysLeft,
  isLow,
  money,
  NOT_REPORTED,
  sortBalances,
  totalsByCurrency,
  type VendorBalance,
} from "./balances";
import { dailySpendByVendor, daysWords, minutes, periodWords, runwayDays } from "./insights";
import { ErrorNote, Highlights, Tiles } from "./parts";

/** Balance rows by the vendor key our usage records use, so recorded spend can give a runway. */
const SPEND_KEY: Record<string, string> = { OpenRouter: "openrouter", "fal.ai": "fal", RunPod: "runpod" };
/** Providers whose calls draw on our Plivo master balance. */
const PLIVO_BACKED = new Set(["PLIVO", "VACADEMY_AI"]);

interface Runway {
  days: number;
  basis: string;
}

function StatusBadge({ row }: { row: VendorBalance }) {
  if (row.status === "error") return <Badge variant="destructive">Couldn&apos;t check</Badge>;
  if (row.status === "not_set_up") return <Badge variant="outline">Not set up</Badge>;
  if (isLow(row)) return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">Low</Badge>;
  if (row.kind === "key_limit") return <Badge variant="secondary">Key cap</Badge>;
  return <Badge variant="secondary">Live</Badge>;
}

function AccountCard({ row, runway, note }: { row: VendorBalance; runway: Runway | null; note?: string | null }) {
  return (
    <Card className={isLow(row) ? "border-amber-400" : undefined}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{row.vendor}</p>
            {row.account && <p className="truncate text-xs text-muted-foreground">{row.account}</p>}
          </div>
          <StatusBadge row={row} />
        </div>
        <p className={`text-2xl font-semibold tabular-nums ${row.status === "ok" ? "" : "text-muted-foreground"}`}>
          {row.status === "ok" ? money(row.balance, row.currency) : "—"}
        </p>
        {runway && (
          <p className={`text-xs ${runway.days < 7 ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}>
            Lasts {daysWords(runway.days)} {runway.basis}
          </p>
        )}
        {note && <p className="text-xs">{note}</p>}
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

export function BalancesTab({ hours }: { hours: number }) {
  const refresh = useRefreshBalances();
  const platform = useVendorBalances("platform");
  const telephony = useVendorBalances("telephony");
  const providers = useProviderTotals(hours);
  const calls = useTelephonySummary(hours);

  const period = periodWords(hours);
  const spend = dailySpendByVendor(providers.data ?? [], hours);
  const telephonyRows = collapseSharedPlivo(telephony.data ?? []);
  const plivoMaster = telephonyRows.find((r) => r.vendor === "Plivo" && r.status === "ok") ?? null;
  const ours = sortBalances([...(platform.data ?? []), ...(plivoMaster ? [plivoMaster] : [])]);
  const institutes = sortBalances(telephonyRows.filter((r) => r !== plivoMaster));
  const plivoSeconds = (calls.data ?? [])
    .filter((r) => PLIVO_BACKED.has(r.provider))
    .reduce((n, r) => n + r.seconds, 0);

  const runwayOf = (row: VendorBalance): Runway | null => {
    const reported = daysLeft(row);
    if (reported != null) return { days: reported, basis: "at the spend rate the vendor reports" };
    const perDay = SPEND_KEY[row.vendor] ? spend.get(SPEND_KEY[row.vendor]) : null;
    const days = runwayDays(row.status === "ok" ? row.balance : null, perDay);
    return days == null ? null : { days, basis: `at the spend recorded over the last ${period} (${money(perDay, "USD")} a day)` };
  };

  const loading = platform.isLoading || telephony.isLoading;
  const runways = ours.map((r) => ({ row: r, runway: runwayOf(r) })).filter((x) => x.runway != null);
  const shortest = runways.sort((a, b) => a.runway!.days - b.runway!.days)[0];
  const lowOurs = ours.filter(isLow);
  const lowInstitutes = institutes.filter(isLow);
  const failed = [...ours, ...institutes].filter((r) => r.status === "error");
  const notSetUp = ours.filter((r) => r.status === "not_set_up");
  const instituteTotals = totalsByCurrency(institutes);

  const nameOf = (r: VendorBalance) => r.institute_name ?? r.institute_id ?? r.account ?? r.vendor;
  const listNames = (rows: VendorBalance[]) =>
    rows.slice(0, 5).map(nameOf).join(", ") + (rows.length > 5 ? ` and ${rows.length - 5} more` : "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Money left with each vendor, as the vendor itself reports it. Our own prepaid accounts come first, then the
          telephony accounts institutes pay for themselves.
        </p>
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Checking with vendors" : "Check again"}
          </Button>
          <p className="text-xs text-muted-foreground">Balances are re-checked every 10 minutes.</p>
          {refresh.isError && <p className="text-xs text-red-700 dark:text-red-400">The check didn&apos;t go through. Try again.</p>}
        </div>
      </div>

      <Tiles
        loading={loading}
        items={[
          {
            label: "Runs out first",
            value: shortest ? shortest.row.vendor : "—",
            note: shortest ? `In ${daysWords(shortest.runway!.days)}` : "No account has recorded spend to measure against",
            tone: shortest && shortest.runway!.days < 7 ? "warn" : undefined,
          },
          {
            label: "Our accounts running low",
            value: String(lowOurs.length),
            note: lowOurs.length ? listNames(lowOurs) : "None below $5",
            tone: lowOurs.length ? "warn" : undefined,
          },
          {
            label: "Institutes running low",
            value: String(lowInstitutes.length),
            note: lowInstitutes.length ? "Their calls stop when the balance hits zero" : "None below ₹500",
            tone: lowInstitutes.length ? "warn" : undefined,
          },
          {
            label: "Couldn't be checked",
            value: String(failed.length),
            note: failed.length ? "See the messages below" : "Every check went through",
            tone: failed.length ? "warn" : undefined,
          },
        ]}
      />

      <Highlights
        items={[
          shortest && shortest.runway!.days < 14 &&
            `Top up ${shortest.row.vendor} soon: ${money(shortest.row.balance, shortest.row.currency)} left lasts ${daysWords(shortest.runway!.days)} ${shortest.runway!.basis}.`,
          plivoMaster &&
            `All Plivo calling, for every institute, draws on one master balance of ${money(plivoMaster.balance, plivoMaster.currency)}. ` +
            `${minutes(plivoSeconds)} minutes were used on it in the last ${period}. ` +
            "Plivo doesn't send us call prices, so how long it lasts can't be worked out here.",
          lowInstitutes.length > 0 &&
            `${lowInstitutes.length} institute${lowInstitutes.length === 1 ? " is" : "s are"} close to running out on their own telephony account: ${listNames(lowInstitutes)}. Ask them to top up.`,
          failed.length > 0 &&
            `${failed.length} account${failed.length === 1 ? "" : "s"} couldn't be checked: ${listNames(failed)}. Usually the saved credentials were changed with the vendor.`,
          notSetUp.length > 0 && `${listNames(notSetUp)}: not set up to report a balance yet.`,
        ]}
      />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Our prepaid accounts</h3>
          <p className="text-xs text-muted-foreground">
            Paid for by Vacademy. When one runs out, the features that use it stop working for every institute.
          </p>
        </div>
        {platform.isError && (
          <ErrorNote title="AI vendor balances could not be loaded" error={platform.error} onRetry={() => platform.refetch()} />
        )}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : ours.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ours.map((row) => (
              <AccountCard
                key={`${row.vendor}:${row.account}`}
                row={row}
                runway={runwayOf(row)}
                note={row === plivoMaster ? `${minutes(plivoSeconds)} call minutes in the last ${period}` : null}
              />
            ))}
          </div>
        ) : (
          !platform.isError && <p className="text-sm text-muted-foreground">No prepaid accounts reported.</p>
        )}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Institutes&apos; own telephony accounts</CardTitle>
          <p className="text-xs text-muted-foreground">
            Exotel accounts belong to the institute, so this is their money, not ours. Lowest first.
            {instituteTotals.length > 0 &&
              ` ${instituteTotals.map((t) => `${money(t.total, t.currency)} across ${t.accounts} account${t.accounts === 1 ? "" : "s"}`).join(" · ")}.`}
          </p>
        </CardHeader>
        <CardContent>
          {telephony.isLoading ? (
            <Skeleton className="h-40" />
          ) : telephony.isError ? (
            <ErrorNote title="Telephony balances could not be loaded" error={telephony.error} onRetry={() => telephony.refetch()} />
          ) : !institutes.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No institute has its own telephony account set up.</p>
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
                  {institutes.map((row) => (
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
