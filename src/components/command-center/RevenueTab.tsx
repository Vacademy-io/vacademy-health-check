import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, Clock, IndianRupee, Info, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlansSectionError, StatusPill } from "@/components/plans/shared";
import { cn } from "@/lib/utils";
import { monthlyValueMinor, periodPriceMinor, summarizeRevenue } from "@/lib/command-center";
import { formatDay, formatInrMinor, PAYMENT_LABEL, periodText } from "@/lib/plans";
import { useSubscriptions } from "@/services/plans-api";
import type { Subscription } from "@/types/plans";

const WINDOWS = [30, 90] as const;
const TABS = [
  { key: "mrr", label: "In MRR" },
  { key: "due", label: "Awaiting payment" },
  { key: "churned", label: "Churned" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Command Center › Revenue tab: MRR and payment state from the existing platform billing (AI plan subscriptions). */
export function RevenueTab() {
  const subs = useSubscriptions();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [tab, setTab] = useState<TabKey>("mrr");
  const r = useMemo(() => (subs.data ? summarizeRevenue(subs.data, new Date(), days) : null), [subs.data, days]);
  const rows = r ? (tab === "mrr" ? r.mrrRows : tab === "due" ? r.dueRows : r.churnedRows) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Monthly recurring revenue and payment state, read from platform billing.</p>
        <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Window">
              {WINDOWS.map((d) => (
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
            <Button variant="outline" size="sm" onClick={() => subs.refetch()}>
              {subs.isFetching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
        </div>
      </div>
      <div className="space-y-6">
        <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b>Coverage:</b> AI plan subscriptions only. Credit packs and core LMS subscriptions aren't billed through platform billing yet, so they
            aren't in these numbers. Per-product revenue needs the product entitlements table (plan v2, Phase 0). MRR counts ACTIVE and GRACE
            subscriptions whose current period is <b>paid</b> (marked-paid included); waived, complimentary and refunded periods are left out.
          </p>
        </div>

        {subs.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : subs.isError ? (
          <PlansSectionError error={subs.error} what="subscriptions" onRetry={() => subs.refetch()} />
        ) : (
          r && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard title="MRR" value={formatInrMinor(r.mrrMinor)} description="Paid subscriptions, annual ÷ 12" icon={IndianRupee} />
                <StatCard title="Paying institutes" value={r.payingInstitutes} description={`${r.trials} on a plan trial`} icon={Building2} />
                <StatCard title="At risk (grace)" value={formatInrMinor(r.atRiskMinor)} description={`${r.atRiskCount} subscription${r.atRiskCount === 1 ? "" : "s"} past period end`} icon={AlertTriangle} />
                <StatCard title="Awaiting payment" value={formatInrMinor(r.dueMinor)} description={`${r.dueCount} charge${r.dueCount === 1 ? "" : "s"} not collected yet`} icon={Clock} />
                <StatCard title={`New MRR (${days}d)`} value={formatInrMinor(r.newMinor)} description={`${r.newCount} subscription${r.newCount === 1 ? "" : "s"} started`} icon={TrendingUp} />
                <StatCard title={`Churned MRR (${days}d)`} value={formatInrMinor(r.churnedMinor)} description={`${r.churnedCount} cancelled or expired`} icon={TrendingDown} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <SectionErrorBoundary title="Plan mix">
                  <Card className="lg:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Plan mix</CardTitle>
                      <CardDescription>Share of MRR by plan.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {r.planMix.length === 0 && <p className="text-xs text-muted-foreground">No paid subscriptions yet.</p>}
                      {r.planMix.map((p) => {
                        const pct = r.mrrMinor > 0 ? (p.mrrMinor / r.mrrMinor) * 100 : 0;
                        return (
                          <div key={p.plan} className="space-y-1">
                            <div className="flex justify-between gap-2 text-sm">
                              <span className="truncate font-medium">{p.plan}</span>
                              <span className="tabular-nums">{formatInrMinor(p.mrrMinor)}</span>
                            </div>
                            <div className="h-2 rounded bg-muted">
                              <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {p.subscriptions} subscription{p.subscriptions === 1 ? "" : "s"} · {pct.toFixed(0)}%
                            </p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </SectionErrorBoundary>

                <SectionErrorBoundary title="Subscriptions">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Subscriptions</CardTitle>
                      <CardDescription>Open a row to manage billing on the AI subscriptions page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="List">
                        {TABS.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            aria-pressed={tab === t.key}
                            className={cn("rounded px-3 py-1 text-xs font-medium", tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                          >
                            {t.label} ({t.key === "mrr" ? r.mrrRows.length : t.key === "due" ? r.dueRows.length : r.churnedRows.length})
                          </button>
                        ))}
                      </div>
                      <RevenueTable rows={rows} tab={tab} />
                    </CardContent>
                  </Card>
                </SectionErrorBoundary>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function RevenueTable({ rows, tab }: { rows: Subscription[]; tab: TabKey }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Institute</th>
            <th className="px-2 py-2 font-medium">Plan</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Payment</th>
            <th className="px-2 py-2 font-medium">{tab === "churned" ? "Ended" : "Period ends"}</th>
            <th className="px-2 py-2 text-right font-medium">{tab === "due" ? "Amount due" : "Monthly value"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-2 pr-3">
                <Link to={`/ai-subscriptions?id=${encodeURIComponent(s.id)}`} className="font-medium hover:underline">
                  {s.institute_name ?? s.institute_id}
                </Link>
                <Link to={`/institutes/${encodeURIComponent(s.institute_id)}`} className="block font-mono text-[11px] text-muted-foreground hover:underline">
                  {s.institute_id}
                </Link>
              </td>
              <td className="px-2 py-2">
                {s.plan_name ?? s.plan_key ?? "—"}
                <span className="block text-[11px] text-muted-foreground">{periodText(s.period_months)}</span>
              </td>
              <td className="px-2 py-2">
                <StatusPill status={s.status} />
              </td>
              <td className="px-2 py-2 text-xs">
                {s.current_period?.payment_status ? (PAYMENT_LABEL[s.current_period.payment_status as keyof typeof PAYMENT_LABEL] ?? s.current_period.payment_status) : "—"}
              </td>
              <td className="px-2 py-2 text-xs">{formatDay(tab === "churned" ? (s.end_at ?? s.updated_at) : s.current_period?.period_end)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatInrMinor(tab === "due" ? periodPriceMinor(s) : monthlyValueMinor(s))}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
