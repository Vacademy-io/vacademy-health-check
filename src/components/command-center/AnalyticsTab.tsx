import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Building2, Globe, IndianRupee, Loader2, MousePointerClick, Sparkles, Users } from "lucide-react";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildTrials, dailyPlatformSeries, PRODUCTS, summarizeRevenue } from "@/lib/command-center";
import { useActivityTrends } from "@/services/dashboard-api";
import { useAllInstituteDates, useRecentQuotes, useTaggedTrials } from "@/services/command-center-api";
import { useGaReport, type GaProductReport } from "@/services/ga-api";
import { useSubscriptions } from "@/services/plans-api";

const RANGES = [7, 30, 90] as const;
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
const TOOLTIP = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 };
const AXIS = { fontSize: 11 };

const num = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const label = (product: string) => PRODUCTS.find((p) => p.key === product)?.label ?? product;
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Command Center › Analytics: website traffic (Google Analytics) next to accounts, trials and payments, day by day. */
export function AnalyticsTab() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const ga = useGaReport(days);
  const instituteDates = useAllInstituteDates();
  const quotes = useRecentQuotes();
  const tagged = useTaggedTrials();
  const subs = useSubscriptions();
  const activity = useActivityTrends(days);

  const trials = useMemo(() => buildTrials(quotes.data?.content ?? [], tagged.data?.content ?? [], subs.data ?? []), [quotes.data, tagged.data, subs.data]);
  const platform = useMemo(
    () => dailyPlatformSeries(instituteDates.data ?? [], trials, subs.data ?? [], days),
    [instituteDates.data, trials, subs.data, days]
  );
  const revenue = useMemo(() => (subs.data ? summarizeRevenue(subs.data) : null), [subs.data]);
  const onTrialNow = trials.filter((t) => t.daysLeft === null || t.daysLeft >= 0).length;

  const report = ga.data;
  const { gaProducts, gaOk, trafficSeries } = useMemo(() => {
    const all = report?.configured ? report.products : [];
    const ok = all.filter((p) => !p.error);
    // One row per day with a column per product, for the multi-line chart.
    const series = (ok[0]?.daily ?? []).map((d, i) => {
      const row: Record<string, string | number> = { date: d.date };
      for (const p of ok) row[p.product] = p.daily[i]?.activeUsers ?? 0;
      return row;
    });
    return { gaProducts: all, gaOk: ok, trafficSeries: series };
  }, [report]);
  const visitors = gaOk.reduce((t, p) => t + p.totals.activeUsers, 0);
  const leads = gaOk.reduce((t, p) => t + p.totals.leads, 0);

  const platformSeries = useMemo(() => {
    const active = new Map((activity.data?.daily_trends ?? []).map((t) => [t.date.slice(0, 10), t.unique_users]));
    return platform.daily.map((d) => ({ ...d, activeUsers: active.get(d.date) ?? 0 }));
  }, [platform.daily, activity.data]);

  const platformLoading = instituteDates.isLoading || quotes.isLoading || tagged.isLoading || subs.isLoading;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Day by day: who visits each product's website, and how many become accounts, trials and paying customers.</p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Range">
            {RANGES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={cn("rounded px-3 py-1 text-xs font-medium", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              >
                {d} days
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => { ga.refetch(); instituteDates.refetch(); quotes.refetch(); tagged.refetch(); subs.refetch(); activity.refetch(); }}>
            {(ga.isFetching || instituteDates.isFetching) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
        </div>
      </div>

      <Section title={`Last ${days} days at a glance`} description="Website numbers come from Google Analytics; accounts, trials and payments from the platform.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Website visitors" value={report?.configured ? num(visitors) : "—"} description="All product sites (GA users)" icon={Globe} />
          <StatCard title="Demo / lead requests" value={report?.configured ? num(leads) : "—"} description={`${pct(leads, visitors)} of visitors`} icon={MousePointerClick} />
          <StatCard title="Accounts created" value={platformLoading ? "…" : num(platform.totals.accounts)} description="New institutes" icon={Building2} />
          <StatCard title="Trials started" value={platformLoading ? "…" : num(platform.totals.trials)} description={`${num(onTrialNow)} on trial now`} icon={Sparkles} />
          <StatCard title="Paid subscriptions started" value={platformLoading ? "…" : num(platform.totals.paid)} description={revenue ? `${num(revenue.payingInstitutes)} paying now` : undefined} icon={IndianRupee} />
          <StatCard title="Active users (platform)" value={activity.data ? num(activity.data.total_unique_users) : "…"} description="Signed in at least once" icon={Users} />
        </div>
      </Section>

      <SectionErrorBoundary title="Website traffic">
        <Section title="Website traffic by product" description="Google Analytics users per day on each product's site.">
          {ga.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : ga.isError ? (
            <GaProblem title="Couldn't reach Google Analytics" detail={(ga.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? (ga.error as Error).message} />
          ) : report && !report.configured ? (
            <GaProblem title="Google Analytics isn't connected yet" detail={report.message} />
          ) : (
            <>
              {gaProducts.filter((p) => p.error).map((p) => (
                <GaProblem key={p.product} title={`${label(p.product)}: Google Analytics returned an error`} detail={p.error} />
              ))}
              {gaOk.filter((p) => p.totals.activeUsers === 0).map((p) => (
                <NoDataNotice key={p.product} product={p} days={days} />
              ))}
              <Card>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trafficSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                      <Legend />
                      {gaOk.map((p, i) => (
                        <Line key={p.product} type="monotone" dataKey={p.product} name={label(p.product)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <ProductTable products={gaOk} />
              <div className="grid gap-4 lg:grid-cols-2">
                <SplitCard title="Devices" description="Users by device type, per product." products={gaOk} pick={(p) => p.devices} />
                <SplitCard title="Where visitors come from" description="Top channels by users, per product." products={gaOk} pick={(p) => p.channels.slice(0, 4)} />
              </div>
            </>
          )}
        </Section>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Platform per day">
        <Section
          title="Accounts, trials and payments per day"
          description="From the platform, all products together: three products share one login, so these can't be split by product until each institute records its products."
        >
          <Card>
            <CardContent className="pt-6">
              {platformLoading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={platformSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Legend />
                    <Bar dataKey="accounts" name="Accounts created" fill="hsl(var(--chart-1))" />
                    <Bar dataKey="trials" name="Trials started" fill="hsl(var(--chart-3))" />
                    <Bar dataKey="paid" name="Paid subscriptions" fill="hsl(var(--chart-2))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active users per day</CardTitle>
              <CardDescription>People who signed in to the platform each day.</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={platformSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={AXIS} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Line type="monotone" dataKey="activeUsers" name="Active users" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <DailyTable rows={platformSeries} gaProducts={gaOk} />
        </Section>
      </SectionErrorBoundary>
    </div>
  );
}

function GaProblem({ title, detail }: { title: string; detail: string | null | undefined }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {detail && <p className="mt-0.5">{detail}</p>}
        <p className="mt-1">Setup steps: docs/command-center/GA_SETUP.md in this repository.</p>
      </div>
    </div>
  );
}

/** A product whose site has sent Google Analytics nothing in the range: almost always the tag isn't on the site yet. */
function NoDataNotice({ product, days }: { product: GaProductReport; days: number }) {
  const site = product.hostnames[0] ?? `GA property ${product.propertyId}`;
  return (
    <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{label(product.product)}: not connected to Google Analytics yet</p>
        <p className="mt-0.5">
          No visits from {site} in the last {days} days. The site isn't sending data yet: the shared Google Analytics tag isn't on it, or it was added less
          than a day ago (Google Analytics takes up to 24 hours to show new data).
        </p>
      </div>
    </div>
  );
}

function SiteStatus({ product }: { product: GaProductReport }) {
  const live = product.totals.activeUsers > 0;
  return (
    <span
      className={cn(
        "ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        live ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      )}
    >
      {live ? "Connected" : "Not connected yet"}
    </span>
  );
}

function ProductTable({ products }: { products: GaProductReport[] }) {
  if (products.length === 0) return null;
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Product site</th>
              <th className="px-2 py-2 text-right font-medium">Visitors</th>
              <th className="px-2 py-2 text-right font-medium">New visitors</th>
              <th className="px-2 py-2 text-right font-medium">Sessions</th>
              <th className="px-2 py-2 text-right font-medium">Page views</th>
              <th className="px-2 py-2 text-right font-medium">Engaged</th>
              <th className="px-2 py-2 text-right font-medium">Lead requests</th>
              <th className="py-2 pl-2 text-right font-medium">Lead rate</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.product} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <span className="font-medium">{label(p.product)}</span>
                  <SiteStatus product={p} />
                  <span className="block text-[11px] text-muted-foreground">{p.hostnames.length ? p.hostnames.join(", ") : `GA property ${p.propertyId}`}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.activeUsers)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.newUsers)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.sessions)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.pageViews)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(p.totals.engagedSessions, p.totals.sessions)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(p.totals.leads)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{pct(p.totals.leads, p.totals.activeUsers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SplitCard({ title, description, products, pick }: { title: string; description: string; products: GaProductReport[]; pick: (p: GaProductReport) => { name: string; activeUsers: number }[] }) {
  if (products.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.map((p) => {
          const rows = pick(p);
          const total = Math.max(1, rows.reduce((t, r) => t + r.activeUsers, 0));
          return (
            <div key={p.product} className="space-y-1.5">
              <p className="text-xs font-semibold">{label(p.product)}</p>
              {rows.length === 0 && <p className="text-[11px] text-muted-foreground">No data in this range.</p>}
              {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate capitalize text-muted-foreground">{r.name}</span>
                  <div className="h-2 flex-1 rounded bg-muted">
                    <div className="h-2 rounded bg-primary" style={{ width: `${(r.activeUsers / total) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {num(r.activeUsers)} <span className="text-muted-foreground">({pct(r.activeUsers, total)})</span>
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DailyTable({ rows, gaProducts }: { rows: { date: string; accounts: number; trials: number; paid: number; activeUsers: number }[]; gaProducts: GaProductReport[] }) {
  const gaByDate = new Map<string, Record<string, number>>();
  for (const p of gaProducts) for (const d of p.daily) gaByDate.set(d.date, { ...(gaByDate.get(d.date) ?? {}), [p.product]: d.activeUsers });
  const newestFirst = [...rows].reverse();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Day by day</CardTitle>
        <CardDescription>Every number above, one row per day, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Date</th>
              {gaProducts.map((p) => (
                <th key={p.product} className="px-2 py-2 text-right font-medium">
                  {label(p.product)} visitors
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Accounts</th>
              <th className="px-2 py-2 text-right font-medium">Trials</th>
              <th className="px-2 py-2 text-right font-medium">Paid</th>
              <th className="py-2 pl-2 text-right font-medium">Active users</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((r) => (
              <tr key={r.date} className="border-b last:border-0">
                <td className="py-1.5 pr-3 text-xs">{shortDate(r.date)}</td>
                {gaProducts.map((p) => (
                  <td key={p.product} className="px-2 py-1.5 text-right tabular-nums">
                    {num(gaByDate.get(r.date)?.[p.product] ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums">{r.accounts}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.trials}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.paid}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{num(r.activeUsers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
