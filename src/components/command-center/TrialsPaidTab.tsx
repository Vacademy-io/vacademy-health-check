import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Clock, IndianRupee, Loader2, Sparkles } from "lucide-react";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/plans/shared";
import { cn } from "@/lib/utils";
import { buildTrials, monthlyValueMinor, periodPriceMinor, summarizeRevenue, TRIAL_SOURCE_LABEL, type TrialRow } from "@/lib/command-center";
import { formatDay, formatInrMinor, periodText } from "@/lib/plans";
import { QUOTE_FETCH_LIMIT, TAGGED_TRIAL_LIMIT, useRecentQuotes, useTaggedTrials } from "@/services/command-center-api";
import { useSubscriptions } from "@/services/plans-api";

type TrialFilter = "active" | "ending" | "expired" | "all";
const TRIAL_FILTERS: { key: TrialFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "ending", label: "Ending in 3 days" },
  { key: "expired", label: "Expired" },
  { key: "all", label: "All" },
];

function matchesTrial(t: TrialRow, f: TrialFilter): boolean {
  switch (f) {
    case "active":
      return t.daysLeft === null || t.daysLeft >= 0;
    case "ending":
      return t.daysLeft !== null && t.daysLeft >= 0 && t.daysLeft <= 3;
    case "expired":
      return t.daysLeft !== null && t.daysLeft < 0;
    default:
      return true;
  }
}

function DaysLeft({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-muted-foreground">No end date</span>;
  if (days < 0) return <span className="text-xs font-medium text-destructive">Expired {Math.abs(days)}d ago</span>;
  return <span className={cn("text-xs font-medium tabular-nums", days <= 3 ? "text-amber-600" : "text-emerald-600")}>{days === 0 ? "Ends today" : `${days} day${days === 1 ? "" : "s"} left`}</span>;
}

const pill = (active: boolean) => cn("rounded px-3 py-1 text-xs font-medium", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent");

/** Command Center › Trials & Paid: who is trying the product, and who pays for a subscription. */
export function TrialsPaidTab() {
  const quotes = useRecentQuotes();
  const tagged = useTaggedTrials();
  const subs = useSubscriptions();
  const [filter, setFilter] = useState<TrialFilter>("active");

  const trials = useMemo(
    () => buildTrials(quotes.data?.content ?? [], tagged.data?.content ?? [], subs.data ?? []),
    [quotes.data, tagged.data, subs.data]
  );
  const revenue = useMemo(() => (subs.data ? summarizeRevenue(subs.data) : null), [subs.data]);
  const visibleTrials = trials.filter((t) => matchesTrial(t, filter));
  const activeTrials = trials.filter((t) => matchesTrial(t, "active")).length;
  const endingSoon = trials.filter((t) => matchesTrial(t, "ending")).length;
  const trialsLoading = quotes.isLoading || tagged.isLoading || subs.isLoading;
  const trialSourcesFailed = [quotes.isError && "demo workspaces", tagged.isError && "tagged trials", subs.isError && "AI plan trials"].filter(Boolean) as string[];
  const capped = (quotes.data?.totalElements ?? 0) > QUOTE_FETCH_LIMIT || (tagged.data?.total_elements ?? 0) > TAGGED_TRIAL_LIMIT;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Who is on a trial, and who is paying for a subscription.</p>
        <Button variant="outline" size="sm" onClick={() => { quotes.refetch(); tagged.refetch(); subs.refetch(); }}>
          {(quotes.isFetching || tagged.isFetching || subs.isFetching) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="On trial" value={trialsLoading ? "…" : activeTrials} description="Not expired" icon={Sparkles} />
        <StatCard title="Ending in 3 days" value={trialsLoading ? "…" : endingSoon} description="Follow up now" icon={Clock} />
        <StatCard title="Paying" value={revenue ? revenue.payingInstitutes : "…"} description="Subscription period paid" icon={Building2} />
        <StatCard title="MRR" value={revenue ? formatInrMinor(revenue.mrrMinor) : "…"} description="From paid subscriptions" icon={IndianRupee} />
      </div>

      <SectionErrorBoundary title="Trials">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">On trial</CardTitle>
            <CardDescription>
              Demo workspaces provisioned from quotes, institutes tagged Free trial, and AI plan trials, merged per institute.
              {trialSourcesFailed.length > 0 && <span className="text-destructive"> Couldn't load {trialSourcesFailed.join(", ")}.</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Trial filter">
              {TRIAL_FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={pill(filter === f.key)}>
                  {f.label} ({trials.filter((t) => matchesTrial(t, f.key)).length})
                </button>
              ))}
            </div>
            {trialsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Institute</th>
                      <th className="px-2 py-2 font-medium">Trial type</th>
                      <th className="px-2 py-2 font-medium">Started</th>
                      <th className="px-2 py-2 font-medium">Ends</th>
                      <th className="py-2 pl-2 font-medium">Time left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrials.map((t) => (
                      <tr key={t.instituteId} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-3">
                          <Link to={`/institutes/${encodeURIComponent(t.instituteId)}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                          {t.contact && <p className="text-[11px] text-muted-foreground">{t.contact}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.sources.map((s) => (
                              <Badge key={s} variant="outline" className="text-[11px] font-medium">
                                {TRIAL_SOURCE_LABEL[s]}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">{formatDay(t.startedAt)}</td>
                        <td className="px-2 py-2 text-xs">{formatDay(t.endsAt)}</td>
                        <td className="py-2 pl-2">
                          <DaysLeft days={t.daysLeft} />
                        </td>
                      </tr>
                    ))}
                    {visibleTrials.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                          No trials here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {capped && <p className="text-[11px] text-muted-foreground">Showing the newest {QUOTE_FETCH_LIMIT} quotes and {TAGGED_TRIAL_LIMIT} tagged institutes.</p>}
          </CardContent>
        </Card>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="Paid">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paying for a subscription</CardTitle>
            <CardDescription>
              Active or grace subscriptions whose current period is paid (offline payments marked paid included). Waived and complimentary ones aren't
              counted. Covers AI plan subscriptions, the only subscriptions billed through platform billing today.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {subs.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : subs.isError || !revenue ? (
              <p className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">Couldn't load subscriptions.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Institute</th>
                      <th className="px-2 py-2 font-medium">Plan</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 text-right font-medium">Pays</th>
                      <th className="px-2 py-2 text-right font-medium">Monthly value</th>
                      <th className="py-2 pl-2 font-medium">Renews</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.mrrRows.map((s) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-3">
                          <Link to={`/ai-subscriptions?id=${encodeURIComponent(s.id)}`} className="font-medium hover:underline">
                            {s.institute_name ?? s.institute_id}
                          </Link>
                        </td>
                        <td className="px-2 py-2">{s.plan_name ?? s.plan_key ?? "—"}</td>
                        <td className="px-2 py-2">
                          <StatusPill status={s.status} />
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums">
                          {formatInrMinor(periodPriceMinor(s))} <span className="text-muted-foreground">{periodText(s.period_months).toLowerCase()}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatInrMinor(monthlyValueMinor(s))}</td>
                        <td className="py-2 pl-2 text-xs">{s.cancel_at_period_end ? <span className="text-destructive">Cancels {formatDay(s.current_period?.period_end)}</span> : formatDay(s.current_period?.period_end)}</td>
                      </tr>
                    ))}
                    {revenue.mrrRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                          No institute has paid for a subscription yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {revenue && revenue.dueCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {revenue.dueCount} more subscription{revenue.dueCount === 1 ? " is" : "s are"} waiting for payment ({formatInrMinor(revenue.dueMinor)}); see the Revenue tab.
              </p>
            )}
          </CardContent>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
}
