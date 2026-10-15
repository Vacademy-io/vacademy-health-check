import { useMemo, useState, type ReactNode } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatCredits } from "@/lib/metering";
import {
  SIMULATE_DAY_OPTIONS,
  formatInr,
  formatInrMinor,
  formatUsd,
  periodText,
  simulationTotals,
  sortVersions,
} from "@/lib/plans";
import { useBillingFeatures, usePlan, usePlans, useSimulate } from "@/services/plans-api";
import { Field, MarginCell, PlansSectionError, SELECT_CLASS, StatusPill } from "./shared";
import { InstitutePicker } from "./InstitutePicker";

/**
 * Replays an institute's recent AI usage (ai_usage_event history) through a plan version — any
 * status, drafts included — and shows per feature what would be included, paid from the allowance
 * or charged, the real vendor cost and the margin. Read-only: nothing is reserved or billed.
 */
export function SimulatePanel({
  initialPlanId = "",
  initialVersionId = "",
  initialInstituteId = "",
  inrPerUsd,
}: {
  initialPlanId?: string;
  initialVersionId?: string;
  initialInstituteId?: string;
  inrPerUsd: number;
}) {
  const plans = usePlans();
  const [planId, setPlanId] = useState(initialPlanId);
  const plan = usePlan(planId || null);
  const [versionId, setVersionId] = useState(initialVersionId);
  const [instituteId, setInstituteId] = useState(initialInstituteId);
  const [instituteName, setInstituteName] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const sim = useSimulate();
  const features = useBillingFeatures();
  const labels = useMemo(() => new Map((features.data ?? []).map((f) => [f.feature_key, f.label])), [features.data]);

  const versions = sortVersions(plan.data?.versions ?? []);
  const version = versions.find((v) => v.id === versionId) ?? null;
  const result = sim.data ?? null;
  const totals = result ? simulationTotals(result.rows) : null;
  const canRun = !!version && instituteId.trim() !== "";

  const run = () => {
    if (!version) return;
    sim.mutate({
      plan_version_id: version.id,
      institute_id: instituteId.trim(),
      days,
      price_minor: version.price_minor,
      period_months: version.period_months,
      inr_per_usd: inrPerUsd,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulate a plan on real usage</CardTitle>
          <CardDescription>
            Replays the institute's AI usage events from the chosen window through the version's rules, as if the
            subscription had been Live. Nothing is reserved, charged or written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {plans.isError ? (
            <PlansSectionError error={plans.error} what="plans" onRetry={() => plans.refetch()} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Plan" htmlFor="sim-plan">
                <select
                  id="sim-plan"
                  className={SELECT_CLASS}
                  value={planId}
                  onChange={(e) => {
                    setPlanId(e.target.value);
                    setVersionId("");
                  }}
                >
                  <option value="">— pick a plan —</option>
                  {(plans.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.plan_key})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Version" htmlFor="sim-version" hint={version ? `${formatInrMinor(version.price_minor)} · ${periodText(version.period_months)} · ${version.allowance_credits.toLocaleString("en-IN")} credits allowance` : undefined}>
                <select id="sim-version" className={SELECT_CLASS} value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!planId || plan.isLoading}>
                  <option value="">{plan.isLoading ? "Loading…" : "— pick a version —"}</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_no} · {v.status.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Institute">
                <InstitutePicker
                  value={instituteId}
                  label={instituteName}
                  onChange={(id, name) => {
                    setInstituteId(id);
                    setInstituteName(name);
                  }}
                />
              </Field>
              <Field label="Window">
                <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Days of history">
                  {SIMULATE_DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={days === d}
                      onClick={() => setDays(d)}
                      className={cn("rounded px-3 py-1 text-xs font-medium transition-colors", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={!canRun || sim.isPending}>
              {sim.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1 h-4 w-4" />}
              Run simulation
            </Button>
            {version && <StatusPill status={version.status} />}
          </div>
          {sim.isError && <p className="text-sm text-destructive">{errorDetail(sim.error, "The simulation failed")}</p>}
        </CardContent>
      </Card>

      {sim.isPending && <Skeleton className="h-64 w-full" />}

      {result && totals && !sim.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Result · {result.days} days · {instituteName ?? result.institute_id}
            </CardTitle>
            <CardDescription>
              Revenue is the plan price over the window{result.server_totals ? "" : " (price × days ÷ period days, computed here)"}. Cost is the real
              vendor cost of the work the plan absorbs (included + allowance), at ₹{result.inr_per_usd}/$. Charged credits
              stay wallet revenue as today and are not counted in the margin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {result.truncated && (
              <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                The replay stopped at the server's event limit, so it covers only part of the window. Try a shorter window.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Summary label="Plan revenue (window)" value={formatInr(result.revenue_inr)} />
              <Summary label="Cost the plan absorbs" value={formatInr(result.absorbed_cost_inr)} hint={`All usage real cost ${formatInr(result.real_cost_inr_total)}`} />
              <Summary label="Margin" value={<MarginCell margin={result.margin_inr} revenue={result.revenue_inr} />} />
              <Summary
                label="Credits"
                value={`${formatCredits(totals.included_credits)} incl · ${formatCredits(totals.allowance_credits)} allow`}
                hint={`${formatCredits(totals.charged_credits)} still charged of ${formatCredits(totals.list_credits)} list`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="px-2 py-2 text-right font-medium">Uses</th>
                    <th className="px-2 py-2 text-right font-medium">List credits</th>
                    <th className="px-2 py-2 text-right font-medium">Included</th>
                    <th className="px-2 py-2 text-right font-medium">From allowance</th>
                    <th className="px-2 py-2 text-right font-medium">Charged</th>
                    <th className="px-2 py-2 text-right font-medium" title="Uses charged because a fair-use cap was full">Cap hits</th>
                    <th className="py-2 pl-2 text-right font-medium">Real cost</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.feature_key} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{r.label ?? labels.get(r.feature_key) ?? r.feature_key}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.feature_key}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.events.toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.list_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{formatCredits(r.included_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-violet-700 dark:text-violet-300">{formatCredits(r.allowance_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatCredits(r.charged_credits)}
                        {r.not_covered_events > 0 && <span className="block text-[11px] text-muted-foreground">{r.not_covered_events} model/role not covered</span>}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", r.over_cap_events > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>{r.over_cap_events.toLocaleString("en-IN")}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {formatUsd(r.real_cost_usd, 3)}
                        {r.plan_cost_usd !== null && r.plan_cost_usd > 0 && <span className="block text-[11px] text-muted-foreground">plan {formatUsd(r.plan_cost_usd, 3)}</span>}
                      </td>
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                        No AI usage in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
                {result.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t font-medium">
                      <td className="py-2 pr-3">Total</td>
                      <td className="px-2 py-2 text-right tabular-nums">{totals.events.toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCredits(totals.list_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCredits(totals.included_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCredits(totals.allowance_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCredits(totals.charged_credits)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{totals.over_cap_events.toLocaleString("en-IN")}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{formatUsd(totals.real_cost_usd, 3)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
