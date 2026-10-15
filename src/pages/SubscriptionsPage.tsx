import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Eye, Loader2, Plus, Radio } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignDialog } from "@/components/plans/AssignDialog";
import { SubscriptionPanel } from "@/components/plans/SubscriptionPanel";
import { EnforcementPill, MeterBar, PlansSectionError, PlansSwitchNote, StatusPill } from "@/components/plans/shared";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/metering";
import { allowanceMeter, formatDay, formatInrMinor, isLiveStatus } from "@/lib/plans";
import { usePlanSettings, useSubscriptions } from "@/services/plans-api";
import type { Subscription } from "@/types/plans";

const FILTERS = [
  { key: "LIVE_STATUS", label: "Live" },
  { key: "SHADOW", label: "Shadow" },
  { key: "LIVE", label: "Enforcing" },
  { key: "ENDED", label: "Ended" },
  { key: "ALL", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const matches = (s: Subscription, f: Filter) => {
  switch (f) {
    case "LIVE_STATUS":
      return isLiveStatus(s.status) || s.status === "SCHEDULED";
    case "SHADOW":
      return isLiveStatus(s.status) && s.enforcement === "SHADOW";
    case "LIVE":
      return isLiveStatus(s.status) && s.enforcement === "LIVE";
    case "ENDED":
      return s.status === "EXPIRED" || s.status === "CANCELLED";
    default:
      return true;
  }
};

/** Super admin: every institute AI subscription, assignment, and the per-subscription panel. */
export default function SubscriptionsPage() {
  const { toasts, push, dismiss } = useToasts();
  const settings = usePlanSettings();
  const subs = useSubscriptions();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("LIVE_STATUS");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const selectedId = params.get("id");
  const panelRef = useRef<HTMLDivElement>(null);

  const rows = subs.data ?? [];
  const q = search.trim().toLowerCase();
  const visible = rows.filter(
    (s) =>
      matches(s, filter) &&
      (q === "" || s.institute_id.toLowerCase().includes(q) || (s.institute_name ?? "").toLowerCase().includes(q) || (s.plan_name ?? "").toLowerCase().includes(q))
  );
  const selected = rows.find((s) => s.id === selectedId) ?? null;
  const liveRows = rows.filter((s) => isLiveStatus(s.status));

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="AI subscriptions"
        description="Which institutes are on an AI plan. Shadow subscriptions are charged exactly as today and only record what the plan would have done; Live ones follow the plan."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => subs.refetch()}>
              {subs.isFetching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => setAssigning(true)}>
              <Plus className="mr-1 h-4 w-4" /> Assign a plan
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <PlansSwitchNote enabled={settings.enabled} loaded={settings.loaded} />
        {subs.data && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Live subscriptions" value={liveRows.length} description="Trial, active or grace" icon={Building2} />
            <StatCard title="Shadow" value={liveRows.filter((s) => s.enforcement === "SHADOW").length} description="Charged as today; decisions logged" icon={Eye} />
            <StatCard title="Enforcing" value={liveRows.filter((s) => s.enforcement === "LIVE").length} description={settings.enabled === true ? "Billing follows the plan" : "No effect while the switch is off"} icon={Radio} />
          </div>
        )}
        <SectionErrorBoundary title="Subscriptions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscriptions</CardTitle>
              <CardDescription>Select a row to manage it: enforcement, renewal, overrides, cancellation and history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Filter">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      aria-pressed={filter === f.key}
                      className={cn("rounded px-3 py-1 text-xs font-medium transition-colors", filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by institute or plan" className="h-8 max-w-xs text-xs" aria-label="Filter subscriptions" />
              </div>
              {subs.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : subs.isError ? (
                <PlansSectionError error={subs.error} what="subscriptions" onRetry={() => subs.refetch()} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Institute</th>
                        <th className="px-2 py-2 font-medium">Plan</th>
                        <th className="px-2 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 font-medium">Enforcement</th>
                        <th className="px-2 py-2 font-medium">Period ends</th>
                        <th className="px-2 py-2 font-medium">Renews</th>
                        <th className="px-2 py-2 text-right font-medium">Price</th>
                        <th className="py-2 pl-2 font-medium">Allowance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((s) => {
                        const m = allowanceMeter(s.current_period);
                        return (
                          <tr
                            key={s.id}
                            onClick={() => setParams({ id: s.id }, { replace: true })}
                            className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/50", selectedId === s.id && "bg-primary/5")}
                          >
                            <td className="py-2 pr-3">
                              <Link to={`/institutes/${encodeURIComponent(s.institute_id)}?tab=ai-plan`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                                {s.institute_name ?? s.institute_id}
                              </Link>
                              {s.institute_name && <p className="font-mono text-[11px] text-muted-foreground">{s.institute_id}</p>}
                            </td>
                            <td className="px-2 py-2">
                              {s.plan_name ?? s.plan_key ?? "—"} {s.version_no !== null && <span className="text-xs text-muted-foreground">v{s.version_no}</span>}
                            </td>
                            <td className="px-2 py-2">
                              <StatusPill status={s.status} />
                            </td>
                            <td className="px-2 py-2">
                              <EnforcementPill enforcement={s.enforcement} plansEnabled={settings.enabled} />
                            </td>
                            <td className="px-2 py-2 text-xs">{formatDay(s.current_period?.period_end)}</td>
                            <td className="px-2 py-2 text-xs">
                              {s.cancel_at_period_end ? <span className="text-destructive">Cancels</span> : s.auto_renew ? "Auto" : "No"}
                              {s.pending_plan_version_id && <span className="block text-muted-foreground">Plan change</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{formatInrMinor(s.price_override_minor ?? s.current_period?.price_minor_snapshot ?? s.version_price_minor)}</td>
                            <td className="py-2 pl-2">
                              <div className="w-32 space-y-1">
                                <MeterBar pct={m.pct} />
                                <p className="text-[11px] tabular-nums text-muted-foreground">
                                  {formatCredits(m.used)} / {formatCredits(m.credits)}
                                </p>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                            {rows.length === 0 ? "No institute is on an AI plan, so everyone is charged exactly as today." : "No subscription matches."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>
        {selected && (
          <div ref={panelRef} className="scroll-mt-4">
            <SectionErrorBoundary title="Subscription">
              <SubscriptionPanel key={selected.id} sub={selected} plansEnabled={settings.enabled} notify={push} />
            </SectionErrorBoundary>
          </div>
        )}
      </div>
      {assigning && <AssignDialog onClose={() => setAssigning(false)} notify={push} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
