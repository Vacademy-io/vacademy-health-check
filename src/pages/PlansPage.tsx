import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FlaskConical, Loader2, Plus, Receipt, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeatureCatalog } from "@/components/plans/FeatureCatalog";
import { Field, PlansSectionError, PlansSwitchNote, ReasonField, StatusPill } from "@/components/plans/shared";
import { errorDetail } from "@/lib/eval-api-pricing";
import { buildPlanCreate, draftVersion, formatInrMinor, liveVersion, modeCounts, periodText } from "@/lib/plans";
import { useCreatePlan, usePlanSettings, usePlans } from "@/services/plans-api";
import type { Plan } from "@/types/plans";

/** Super admin: AI subscription plans and the billing-feature catalogue they are built from. */
export default function PlansPage() {
  const { toasts, push, dismiss } = useToasts();
  const settings = usePlanSettings();
  const plans = usePlans();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "features" ? "features" : "plans";
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="AI plans"
        description="Monthly AI subscription plans. A plan never changes a price; it decides whether the institute's wallet, the plan's allowance or nobody pays for each AI use. Versions are frozen once published."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/ai-subscriptions">
                <Users className="mr-1 h-4 w-4" /> Subscriptions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/ai-plans/pnl">
                <Receipt className="mr-1 h-4 w-4" /> P&amp;L
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/ai-plans/simulate">
                <FlaskConical className="mr-1 h-4 w-4" /> Simulate
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <PlansSwitchNote enabled={settings.enabled} loaded={settings.loaded} />
        <Tabs value={tab} onValueChange={(v) => setParams(v === "features" ? { tab: "features" } : {}, { replace: true })}>
          <TabsList>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="features">Feature catalogue</TabsTrigger>
          </TabsList>
          <TabsContent value="plans" className="mt-4">
            <SectionErrorBoundary title="Plans">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Plans</CardTitle>
                      <CardDescription>Open a plan to edit its draft version, publish it, or start a new version.</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setCreating(true)}>
                      <Plus className="mr-1 h-4 w-4" /> New plan
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {plans.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : plans.isError ? (
                    <PlansSectionError error={plans.error} what="plans" onRetry={() => plans.refetch()} />
                  ) : (
                    <PlansTable plans={plans.data ?? []} />
                  )}
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </TabsContent>
          <TabsContent value="features" className="mt-4">
            <SectionErrorBoundary title="Feature catalogue">
              <FeatureCatalog notify={push} />
            </SectionErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
      {creating && <CreatePlanDialog onClose={() => setCreating(false)} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function PlansTable({ plans }: { plans: Plan[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Plan</th>
            <th className="px-2 py-2 font-medium">Live version</th>
            <th className="px-2 py-2 text-right font-medium">Price</th>
            <th className="px-2 py-2 font-medium">Period</th>
            <th className="px-2 py-2 text-right font-medium">Allowance</th>
            <th className="px-2 py-2 text-right font-medium">Included features</th>
            <th className="px-2 py-2 text-right font-medium">Subscriptions</th>
            <th className="py-2 pl-2 font-medium">Draft</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const v = liveVersion(p);
            const draft = draftVersion(p);
            const counts = v && v.items.length > 0 ? modeCounts(v.items) : null;
            return (
              <tr key={p.id} className={p.is_active ? "border-b last:border-0" : "border-b opacity-60 last:border-0"}>
                <td className="py-2 pr-3">
                  <Link to={`/ai-plans/${encodeURIComponent(p.id)}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.plan_key}</p>
                </td>
                <td className="px-2 py-2">{v ? <span className="inline-flex items-center gap-1.5">v{v.version_no} <StatusPill status={v.status} /></span> : <span className="text-xs text-muted-foreground">None published</span>}</td>
                <td className="px-2 py-2 text-right tabular-nums">{v ? formatInrMinor(v.price_minor) : "—"}</td>
                <td className="px-2 py-2 text-xs">{v ? periodText(v.period_months) : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{v ? v.allowance_credits.toLocaleString("en-IN") : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {counts ? `${counts.INCLUDED} incl · ${counts.ALLOWANCE} allow` : v?.included_count !== null && v?.included_count !== undefined ? `${v.included_count} incl` : "—"}
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  {p.live_subscriptions !== null || p.shadow_subscriptions !== null ? `${p.live_subscriptions ?? 0} live · ${p.shadow_subscriptions ?? 0} shadow` : "—"}
                </td>
                <td className="py-2 pl-2">
                  {draft ? (
                    <Link to={`/ai-plans/${encodeURIComponent(p.id)}?version=${encodeURIComponent(draft.id)}`} className="text-xs font-medium underline underline-offset-2">
                      v{draft.version_no} draft
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {plans.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">
                No plans yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [draft, setDraft] = useState({ plan_key: "", name: "", description: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const go = () => {
    setError(null);
    const built = buildPlanCreate(draft);
    if ("error" in built) return setError(built.error);
    create.mutate(built.body, {
      onSuccess: (plan) => {
        onClose();
        if (plan.id) navigate(`/ai-plans/${encodeURIComponent(plan.id)}`);
      },
      onError: (err) => setError(errorDetail(err, "Could not create the plan")),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Creates the plan. Add a version next; a draft version is inert until published and assigned.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan key" htmlFor="np-key" hint="Stable id, e.g. ai_starter. Cannot change later.">
              <Input id="np-key" value={draft.plan_key} onChange={(e) => set("plan_key", e.target.value.toLowerCase())} maxLength={48} className="h-9 font-mono" />
            </Field>
            <Field label="Name" htmlFor="np-name" hint="Tenants see this.">
              <Input id="np-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={128} className="h-9" />
            </Field>
          </div>
          <Field label="Description" htmlFor="np-desc">
            <Textarea id="np-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
          <ReasonField id="np-reason" value={draft.reason} onChange={(v) => set("reason", v)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
