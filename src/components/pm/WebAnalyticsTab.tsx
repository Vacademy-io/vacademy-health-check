import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PRODUCT_LABELS, productName } from "@/lib/pm-view";
import { useGaReport, type GaProductReport } from "@/services/ga-api";
import { Pager, usePaged } from "./Pager";

const RANGES = [7, 30, 90] as const;
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--primary))"];
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 };
const AXIS = { fontSize: 11 };
const num = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Second half of the period vs the first half, in %. */
function trend(p: GaProductReport): number | null {
  const n = p.daily.length;
  if (n < 6) return null;
  const half = Math.floor(n / 2);
  const a = p.daily.slice(0, half).reduce((t, d) => t + d.activeUsers, 0);
  const b = p.daily.slice(n - half).reduce((t, d) => t + d.activeUsers, 0);
  return a > 0 ? Math.round(((b - a) / a) * 100) : null;
}

type Row = { key: string; report: GaProductReport | null };

/** PM View › Web analytics: Google Analytics for every product site, side by side, then one in depth. */
export function WebAnalyticsTab() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const ga = useGaReport(days);
  const report = ga.data;

  // Every product we know of plus anything configured in Google Analytics.
  const rows: Row[] = useMemo(() => {
    const byKey = new Map((report?.products ?? []).map((p) => [p.product.toLowerCase(), p]));
    const keys = [...new Set([...Object.keys(PRODUCT_LABELS), ...byKey.keys()])];
    return keys.map((key) => ({ key, report: byKey.get(key) ?? null })).sort((a, b) => (b.report?.totals.activeUsers ?? -1) - (a.report?.totals.activeUsers ?? -1));
  }, [report]);
  const connected = rows.filter((r) => r.report && !r.report.error);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = rows.find((r) => r.key === picked) ?? connected[0] ?? null;

  const combined = useMemo(() => {
    const base = connected[0]?.report?.daily ?? [];
    return base.map((d, i) => {
      const row: Record<string, string | number> = { date: d.date };
      for (const r of connected) row[r.key] = r.report!.daily[i]?.activeUsers ?? 0;
      return row;
    });
  }, [connected]);
  const totals = connected.reduce(
    (t, r) => ({ visitors: t.visitors + r.report!.totals.activeUsers, leads: t.leads + r.report!.totals.leads, sessions: t.sessions + r.report!.totals.sessions }),
    { visitors: 0, leads: 0, sessions: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Google Analytics for each product website. Visitors are GA users; leads are demo / sign-up events.
            {report?.generatedAt && <> Updated {new Date(report.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Period">
            {RANGES.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={cn("rounded px-3 py-1 text-xs font-medium", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                {d} days
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => ga.refetch()}>
            {ga.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Refresh
          </Button>
        </div>
      </div>

      {ga.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : ga.isError ? (
        <Problem title="Couldn't load Google Analytics" detail={(ga.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (ga.error as Error).message} />
      ) : report && !report.configured ? (
        <Problem title="Google Analytics isn't connected" detail={`${report.message ?? ""} See docs/command-center/GA_SETUP.md.`} />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All products · last {days} days</CardTitle>
              <CardDescription>
                {num(totals.visitors)} visitors · {num(totals.sessions)} sessions · {num(totals.leads)} leads ({pct(totals.leads, totals.visitors)}). Click a product for detail.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-y text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Product</th>
                    <th className="px-2 py-2 text-right font-medium">Visitors</th>
                    <th className="px-2 py-2 text-right font-medium">New visitors</th>
                    <th className="px-2 py-2 text-right font-medium">Sessions</th>
                    <th className="px-2 py-2 text-right font-medium">Page views</th>
                    <th className="px-2 py-2 text-right font-medium">Engaged</th>
                    <th className="px-2 py-2 text-right font-medium">Leads</th>
                    <th className="px-2 py-2 text-right font-medium">Lead rate</th>
                    <th className="px-4 py-2 text-right font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const p = r.report;
                    const t = p && !p.error ? trend(p) : null;
                    const active = selected?.key === r.key;
                    return (
                      <tr key={r.key} onClick={() => p && !p.error && setPicked(r.key)} className={cn("border-b last:border-0", p && !p.error ? "cursor-pointer hover:bg-accent/40" : "", active && "bg-primary/5")}>
                        <td className="px-4 py-2 font-medium">
                          {productName(r.key)}
                          {!p && <span className="ml-2 text-xs font-normal text-muted-foreground">not connected in GA</span>}
                          {p?.error && <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-destructive" title={p.error}><AlertTriangle className="h-3 w-3" /> GA error</span>}
                          {p && !p.error && p.totals.activeUsers === 0 && <span className="ml-2 text-xs font-normal text-amber-600">no traffic recorded</span>}
                        </td>
                        {p && !p.error ? (
                          <>
                            <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.activeUsers)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.newUsers)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.sessions)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.pageViews)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{pct(p.totals.engagedSessions, p.totals.sessions)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.leads)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{pct(p.totals.leads, p.totals.activeUsers)}</td>
                            <td className={cn("px-4 py-2 text-right text-xs tabular-nums", t === null ? "text-muted-foreground" : t >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {t === null ? "—" : `${t >= 0 ? "+" : ""}${t}%`}
                            </td>
                          </>
                        ) : (
                          <td colSpan={8} className="px-2 py-2 text-xs text-muted-foreground">
                            {p?.error ? p.error : "Add this product's GA property to GA_PRODUCTS to see it here."}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {connected.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visitors per day</CardTitle>
                <CardDescription>Each product's site. Trend compares the second half of the period with the first.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={combined}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Legend />
                    {connected.map((r, i) => (
                      <Line key={r.key} type="monotone" dataKey={r.key} name={productName(r.key)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {selected?.report && !selected.report.error && <ProductDetail report={selected.report} days={days} />}
        </>
      )}
    </div>
  );
}

function ProductDetail({ report: p, days }: { report: GaProductReport; days: number }) {
  const sources = usePaged(p.sources ?? [], 10, p.product + days);
  const name = productName(p.product);
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">{name} in detail</h3>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Visitors and leads per day</CardTitle>
          {p.hostnames.length > 0 && <CardDescription>Sites: {p.hostnames.join(", ")}</CardDescription>}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={p.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="v" tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis yAxisId="l" orientation="right" tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
              <Legend />
              <Line yAxisId="v" type="monotone" dataKey="activeUsers" name="Visitors" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              <Line yAxisId="l" type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Where visitors and leads come from</CardTitle>
            <CardDescription>Session source / medium.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-0 pb-3">
            {sources.total === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">No source data for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Source / medium</th>
                    <th className="px-2 py-2 text-right font-medium">Visitors</th>
                    <th className="px-2 py-2 text-right font-medium">Sessions</th>
                    <th className="px-2 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">Lead rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.items.map((s) => (
                    <tr key={s.name} className="border-b last:border-0">
                      <td className="max-w-[16rem] truncate px-4 py-1.5">{s.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(s.activeUsers)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(s.sessions)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(s.leads)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{pct(s.leads, s.activeUsers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-3">
              <Pager {...sources} noun="sources" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Split title="Channels" rows={p.channels} />
          <Split title="Devices" rows={p.devices} />
        </div>
      </div>
    </div>
  );
}

function Split({ title, rows }: { title: string; rows: { name: string; activeUsers: number }[] }) {
  const total = rows.reduce((t, r) => t + r.activeUsers, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No data.</p>}
        {rows.map((r) => (
          <div key={r.name} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span>{r.name}</span>
              <span className="tabular-nums text-muted-foreground">{num(r.activeUsers)} · {pct(r.activeUsers, total)}</span>
            </div>
            <div className="h-1.5 rounded bg-muted">
              <div className="h-1.5 rounded bg-primary" style={{ width: total ? `${(r.activeUsers / total) * 100}%` : 0 }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Problem({ title, detail }: { title: string; detail: string | null }) {
  return (
    <Card className="border-amber-300 dark:border-amber-800">
      <CardContent className="flex gap-3 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">{title}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
