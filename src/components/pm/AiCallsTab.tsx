import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download, Loader2, PhoneCall, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { callsByInstitute, callsPerDay, productName, toCsv } from "@/lib/pm-view";
import { useCallsSince } from "@/services/pm-api";
import { Pager, usePaged } from "./Pager";
import { daysAgo, downloadText, usePmData } from "./use-pm-data";

const PERIODS = [7, 30, 90] as const;
const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 };
const AXIS = { fontSize: 11 };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** PM View › AI calls: how many AI calls, and which institutes make them. Read-only, from the platform call log. */
export function AiCallsTab({ onOpenAccount }: { onOpenAccount: (id: string) => void }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [search, setSearch] = useState("");
  const data = usePmData();
  const q = useCallsSince(daysAgo(days - 1));
  const calls = useMemo(() => q.data?.calls ?? [], [q.data]);

  const accountsById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const byInstitute = useMemo(() => callsByInstitute(calls), [calls]);
  const perDay = useMemo(() => callsPerDay(calls, days, data.today).map((d) => ({ ...d, label: shortDate(d.date) })), [calls, days, data.today]);

  const totalCalls = q.data?.totals?.calls ?? calls.length;
  const totalMinutes = q.data?.totals?.minutes ?? byInstitute.reduce((t, r) => t + r.minutes, 0);
  const billed = q.data?.totals?.billed_inr ?? byInstitute.reduce((t, r) => t + r.billedInr, 0);
  const connected = byInstitute.reduce((t, r) => t + r.connected, 0);
  const institutes = byInstitute.filter((r) => r.instituteId !== "none").length;
  const top = byInstitute[0];

  const term = search.trim().toLowerCase();
  const filtered = byInstitute.filter((r) => !term || r.name.toLowerCase().includes(term));
  const paged = usePaged(filtered, 15, `${days}|${term}`);

  const exportCsv = () =>
    downloadText(
      `ai-calls-by-institute-${data.today}-${days}d.csv`,
      toCsv(
        ["Rank", "Institute", "Institute ID", "Product", "Calls", "Connected", "Connected %", "Minutes", "Avg minutes per call", "Billed (₹)", "Share of all calls", "Last call"],
        byInstitute.map((r, i) => {
          const a = accountsById.get(r.instituteId);
          return [i + 1, r.name, r.instituteId === "none" ? "" : r.instituteId, a?.products.map(productName).join(", ") ?? "", r.calls, r.connected, pct(r.connected, r.calls), Math.round(r.minutes), r.calls ? (r.minutes / r.calls).toFixed(1) : "", Math.round(r.billedInr), pct(r.calls, calls.length), r.lastCall?.slice(0, 10) ?? ""];
        })
      )
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">AI calls made by institutes on the platform (read-only, from the call log). Click an institute for its full details.</p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Period">
            {PERIODS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={cn("rounded px-3 py-1 text-xs font-medium", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                {d} days
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!byInstitute.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {q.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Refresh
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-60" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="flex gap-2 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            Couldn't load the call log: {(q.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (q.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <>
          {q.data?.capped && (
            <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> More than {num(calls.length)} calls in this period: the totals are exact, but the per-institute table counts only the latest {num(calls.length)}.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total AI calls" value={num(totalCalls)} sub={`last ${days} days`} />
            <Kpi label="Minutes" value={num(totalMinutes)} sub={totalCalls ? `${(totalMinutes / totalCalls).toFixed(1)} min per call` : undefined} />
            <Kpi label="Connected" value={pct(connected, calls.length)} sub={`${num(connected)} calls answered`} />
            <Kpi label="Institutes calling" value={num(institutes)} sub={institutes ? `${num(calls.length / institutes)} calls per institute on average` : undefined} />
            <Kpi label="Top institute" value={top && top.instituteId !== "none" ? num(top.calls) : "—"} sub={top ? top.name : "No calls"} />
            <Kpi label="Billed" value={inr(billed)} sub="charged to institutes" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI calls per day</CardTitle>
            </CardHeader>
            <CardContent>
              {calls.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No AI calls in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={perDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} stroke="hsl(var(--muted-foreground))" minTickGap={16} />
                    <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} width={36} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v) => [num(Number(v) || 0), "Calls"]} />
                    <Bar dataKey="calls" name="calls" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">AI calls by institute</CardTitle>
                <CardDescription className="text-xs">Most calls first. Share = this institute's part of all calls in the period.</CardDescription>
              </div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institute…" className="h-8 w-56" />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {paged.total === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No institutes made AI calls in this period.</p>
              ) : (
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                      <th className="w-12 px-4 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">Institute</th>
                      <th className="px-2 py-2 text-right font-medium">Calls</th>
                      <th className="px-2 py-2 text-left font-medium">Share</th>
                      <th className="px-2 py-2 text-right font-medium">Connected</th>
                      <th className="px-2 py-2 text-right font-medium">Minutes</th>
                      <th className="px-2 py-2 text-right font-medium">Min / call</th>
                      <th className="px-2 py-2 text-right font-medium">Billed</th>
                      <th className="px-4 py-2 text-left font-medium">Last call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((r) => {
                      const rank = byInstitute.indexOf(r) + 1;
                      const a = accountsById.get(r.instituteId);
                      const share = calls.length ? r.calls / calls.length : 0;
                      return (
                        <tr key={r.instituteId} onClick={() => a && onOpenAccount(r.instituteId)} className={cn("border-b last:border-0", a && "cursor-pointer hover:bg-accent/40")}>
                          <td className="px-4 py-2 text-xs font-semibold tabular-nums text-muted-foreground">{rank}</td>
                          <td className="max-w-[16rem] px-2 py-2">
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              {rank <= 3 && <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" />}
                              {r.name}
                            </p>
                            {a && <p className="truncate text-xs text-muted-foreground">{[a.products.map(productName).join(", "), a.paid ? "Paying" : a.trial ? "On trial" : ""].filter(Boolean).join(" · ") || a.email}</p>}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{num(r.calls)}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-20 rounded bg-muted">
                                <span className="block h-2 rounded bg-primary" style={{ width: `${Math.max(2, share * 100)}%` }} />
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">{pct(r.calls, calls.length)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{pct(r.connected, r.calls)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{num(r.minutes)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.calls ? (r.minutes / r.calls).toFixed(1) : "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{inr(r.billedInr)}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{r.lastCall ? formatDay(r.lastCall) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Pager {...paged} noun="institutes" />
        </>
      )}
    </div>
  );
}
