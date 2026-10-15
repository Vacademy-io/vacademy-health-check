import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EnforcementPill, MarginCell, PlansSectionError, PlansSwitchNote } from "@/components/plans/shared";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/metering";
import { formatInr, formatInrMinor, formatRange, formatUsd, pnlCsv, pnlTotals } from "@/lib/plans";
import { usePlanSettings, usePnl } from "@/services/plans-api";

const PERIODS = [
  { key: "current", label: "Current period" },
  { key: "previous", label: "Previous period" },
] as const;

/** Per institute and period: what the plan earns against the real vendor cost of what it absorbs. */
export default function PlanPnlPage() {
  const settings = usePlanSettings();
  const [period, setPeriod] = useState<"current" | "previous">("current");
  const [instituteId, setInstituteId] = useState("");
  const [applied, setApplied] = useState("");
  const pnl = usePnl(period, applied || null, settings.inrPerUsd);
  const rows = pnl.data?.rows ?? [];
  const t = pnlTotals(rows);
  const rate = pnl.data?.inr_per_usd ?? settings.inrPerUsd;

  const exportCsv = () => {
    const blob = new Blob([pnlCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-plan-pnl-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <PageHeader
        title="AI plan P&L"
        description="Plan price against the real vendor cost (ai_usage_event.real_cost_usd) per institute and period. Wallet-charged credits are listed for context; they are revenue as today and not part of the plan margin."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => pnl.refetch()}>
              {pnl.isFetching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <PlansSwitchNote enabled={settings.enabled} loaded={settings.loaded} />
        <SectionErrorBoundary title="P&L">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By institute</CardTitle>
              <CardDescription>
                Margin = price − plan cost, where plan cost is the real vendor cost of the work the plan absorbed (included
                + allowance), at ₹{rate}/$ (setting billing.inr_per_usd). Real cost (all) also covers wallet-charged use,
                which stays wallet revenue as today. Revenue is the period's price whether or not it is paid; v1 takes no
                payments, so check the payment column. Shadow rows show what the plan would have absorbed had it been Live.
                Most uses carry no vendor cost yet: those are estimated at list credits ÷ 150 per dollar (marked
                "estimated").
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      role="radio"
                      aria-checked={period === p.key}
                      onClick={() => setPeriod(p.key)}
                      className={cn("rounded px-3 py-1 text-xs font-medium transition-colors", period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setApplied(instituteId.trim());
                  }}
                >
                  <Input value={instituteId} onChange={(e) => setInstituteId(e.target.value)} placeholder="Institute id (optional)" className="h-8 w-72 font-mono text-xs" aria-label="Institute id" />
                  <Button type="submit" size="sm" variant="outline">
                    Apply
                  </Button>
                  {applied && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setInstituteId("");
                        setApplied("");
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </form>
              </div>
              {pnl.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : pnl.isError ? (
                <PlansSectionError error={pnl.error} what="pnl" onRetry={() => pnl.refetch()} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Institute</th>
                        <th className="px-2 py-2 font-medium">Plan</th>
                        <th className="px-2 py-2 font-medium">Period</th>
                        <th className="px-2 py-2 text-right font-medium">Price</th>
                        <th className="px-2 py-2 text-right font-medium">Included (list cr)</th>
                        <th className="px-2 py-2 text-right font-medium">Included real cost</th>
                        <th className="px-2 py-2 text-right font-medium">Allowance used</th>
                        <th className="px-2 py-2 text-right font-medium">Charged credits</th>
                        <th className="px-2 py-2 text-right font-medium">Real cost (all)</th>
                        <th className="px-2 py-2 text-right font-medium">Plan cost</th>
                        <th className="py-2 pl-2 text-right font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.subscription_id ?? r.institute_id}-${r.period_start}`} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Link to={`/institutes/${encodeURIComponent(r.institute_id)}?tab=ai-plan`} className="font-medium hover:underline">
                              {r.institute_name ?? r.institute_id}
                            </Link>
                            {r.institute_name && <p className="font-mono text-[11px] text-muted-foreground">{r.institute_id}</p>}
                          </td>
                          <td className="px-2 py-2">
                            <span>{r.plan_name ?? r.plan_key ?? "—"}</span>
                            {r.version_no !== null && <span className="ml-1 text-xs text-muted-foreground">v{r.version_no}</span>}
                            {r.basis === "SHADOW" && r.enforcement === "LIVE" && <span className="block text-[11px] text-muted-foreground">shadow basis (switch off)</span>}
                            {(r.enforcement === "SHADOW" || r.enforcement === "LIVE") && (
                              <span className="ml-1.5">
                                <EnforcementPill enforcement={r.enforcement} plansEnabled={settings.enabled} />
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {formatRange(r.period_start, r.period_end)}
                            {r.payment_status && <span className="block text-muted-foreground">{r.payment_status.toLowerCase()}</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatInrMinor(r.price_minor)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.included_list_credits)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatUsd(r.included_cost_usd)}
                            <span className="block text-[11px] text-muted-foreground">{formatInr(r.included_cost_usd * rate)}</span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.allowance_used)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.charged_credits)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatUsd(r.real_cost_usd_total)}
                            <span className="block text-[11px] text-muted-foreground">{formatInr(r.real_cost_usd_total * rate)}</span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatInr(r.plan_cost_inr)}
                            {r.allowance_cost_usd > 0 && <span className="block text-[11px] text-muted-foreground">allowance {formatUsd(r.allowance_cost_usd)}</span>}
                            {r.cost_estimated_events > 0 && (
                              <span className="block text-[11px] text-muted-foreground">
                                {r.cost_basis === "MIXED" ? "partly estimated" : "estimated"} ({r.cost_estimated_events} uses)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <MarginCell margin={r.margin_inr} revenue={r.price_minor / 100} />
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-6 text-center text-xs text-muted-foreground">
                            No subscription periods for this selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {rows.length > 1 && (
                      <tfoot>
                        <tr className="border-t font-medium">
                          <td className="py-2 pr-3" colSpan={3}>
                            Total ({rows.length})
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatInr(t.revenue_inr)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(t.included_list_credits)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatUsd(t.included_cost_usd)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(t.allowance_used)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatCredits(t.charged_credits)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatUsd(t.real_cost_usd_total)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{formatInr(t.plan_cost_inr)}</td>
                          <td className="py-2 pl-2 text-right">
                            <MarginCell margin={t.margin_inr} revenue={t.revenue_inr} />
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>
      </div>
    </div>
  );
}
