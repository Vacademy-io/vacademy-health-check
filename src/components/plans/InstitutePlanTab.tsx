import { useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { formatRange, liveSubscription } from "@/lib/plans";
import { usePlanSettings, useSubscriptions } from "@/services/plans-api";
import { AssignDialog } from "./AssignDialog";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { EnforcementPill, PlansSectionError, PlansSwitchNote, StatusPill } from "./shared";

/** InstituteDetailPage → "AI plan": the live subscription (if any), past ones, and assignment. */
export function InstitutePlanTab({ instituteId, instituteName }: { instituteId: string; instituteName?: string | null }) {
  const { toasts, push, dismiss } = useToasts();
  const settings = usePlanSettings();
  const subs = useSubscriptions(instituteId);
  const [assigning, setAssigning] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = subs.data ?? [];
  const live = liveSubscription(all);
  const others = all.filter((s) => s.id !== live?.id);
  const opened = others.find((s) => s.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PlansSwitchNote enabled={settings.enabled} loaded={settings.loaded} />
      {subs.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : subs.isError ? (
        <Card>
          <CardContent className="pt-6">
            <PlansSectionError error={subs.error} what="subscriptions" onRetry={() => subs.refetch()} />
          </CardContent>
        </Card>
      ) : (
        <>
          {live ? (
            <SectionErrorBoundary title="Subscription">
              <SubscriptionPanel sub={live} plansEnabled={settings.enabled} notify={push} />
            </SectionErrorBoundary>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No AI plan</CardTitle>
                <CardDescription>
                  This institute pays for every AI use from its credits, exactly as today. Assigning a plan starts in Shadow
                  by default, which still charges as today and only records what the plan would have done.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Button size="sm" onClick={() => setAssigning(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Assign a plan
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/ai-plans/simulate?institute=${encodeURIComponent(instituteId)}`}>
                    <FlaskConical className="mr-1 h-4 w-4" /> Simulate a plan on its usage
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {others.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Other subscriptions</CardTitle>
                <CardDescription>Scheduled, expired and cancelled subscriptions of this institute.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y text-sm">
                  {others.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {s.plan_name ?? "Plan"} {s.version_no !== null && `v${s.version_no}`}
                        </span>
                        <StatusPill status={s.status} />
                        <EnforcementPill enforcement={s.enforcement} plansEnabled={settings.enabled} />
                        <span className="text-xs text-muted-foreground">{formatRange(s.start_at, s.end_at)}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                        {openId === s.id ? "Hide" : "Details"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {opened && (
            <SectionErrorBoundary title="Subscription">
              <SubscriptionPanel sub={opened} plansEnabled={settings.enabled} notify={push} />
            </SectionErrorBoundary>
          )}
        </>
      )}
      {assigning && <AssignDialog instituteId={instituteId} instituteName={instituteName ?? null} onClose={() => setAssigning(false)} notify={push} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
