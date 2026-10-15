import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CopyPlus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VersionEditor } from "@/components/plans/VersionEditor";
import { Field, PlansSectionError, PlansSwitchNote, ReasonField, SELECT_CLASS, StatusPill } from "@/components/plans/shared";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { draftVersion, formatInrMinor, liveVersion, sortVersions } from "@/lib/plans";
import { useBillingFeatures, useCreateVersion, usePlan, usePlanSettings } from "@/services/plans-api";
import type { Plan } from "@/types/plans";

/** One plan: its versions (newest first) and the editor for the selected one. */
export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { toasts, push, dismiss } = useToasts();
  const settings = usePlanSettings();
  const plan = usePlan(id);
  const features = useBillingFeatures();
  const [newVersion, setNewVersion] = useState(false);

  const versions = sortVersions(plan.data?.versions ?? []);
  const wanted = params.get("version");
  const selected = versions.find((v) => v.id === wanted) ?? (plan.data ? draftVersion(plan.data) ?? liveVersion(plan.data) : null) ?? versions[0] ?? null;

  return (
    <div>
      <PageHeader
        title={plan.data?.name ?? "AI plan"}
        description={plan.data ? [plan.data.plan_key, plan.data.description].filter(Boolean).join(" · ") : undefined}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/ai-plans">
                <ArrowLeft className="mr-1 h-4 w-4" /> All plans
              </Link>
            </Button>
            {plan.data && (
              <Button size="sm" onClick={() => setNewVersion(true)} disabled={!!draftVersion(plan.data)} title={draftVersion(plan.data) ? "Publish or finish the open draft first" : undefined}>
                <CopyPlus className="mr-1 h-4 w-4" /> New version
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-6">
        <PlansSwitchNote enabled={settings.enabled} loaded={settings.loaded} />
        {plan.isLoading || features.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : plan.isError ? (
          <Card>
            <CardContent className="pt-6">
              <PlansSectionError error={plan.error} what={`plans/${id}`} onRetry={() => plan.refetch()} />
            </CardContent>
          </Card>
        ) : features.isError ? (
          <Card>
            <CardContent className="pt-6">
              <PlansSectionError error={features.error} what="features" onRetry={() => features.refetch()} />
            </CardContent>
          </Card>
        ) : plan.data ? (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Versions">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={selected?.id === v.id}
                  onClick={() => setParams({ version: v.id }, { replace: true })}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    selected?.id === v.id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  v{v.version_no}
                  <StatusPill status={v.status} />
                  <span className="text-xs tabular-nums">{formatInrMinor(v.price_minor)}</span>
                </button>
              ))}
              {versions.length === 0 && <p className="text-sm text-muted-foreground">No versions yet. Create the first one.</p>}
            </div>
            {selected && (
              <SectionErrorBoundary title="Version">
                <VersionEditor key={selected.id} plan={plan.data} version={selected} features={features.data ?? []} inrPerUsd={settings.inrPerUsd} notify={push} />
              </SectionErrorBoundary>
            )}
          </>
        ) : null}
      </div>
      {newVersion && plan.data && (
        <NewVersionDialog
          plan={plan.data}
          defaultFrom={selected?.id ?? ""}
          onClose={() => setNewVersion(false)}
          onCreated={(vid) => {
            push("success", "Draft version created.");
            if (vid) setParams({ version: vid }, { replace: true });
          }}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function NewVersionDialog({ plan, defaultFrom, onClose, onCreated }: { plan: Plan; defaultFrom: string; onClose: () => void; onCreated: (versionId: string) => void }) {
  const create = useCreateVersion();
  const [from, setFrom] = useState(defaultFrom);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the change log)");
    create.mutate(
      { planId: plan.id, copy_from_version_id: from || null, reason: reason.trim() },
      {
        onSuccess: (v) => {
          onClose();
          onCreated(v.id);
        },
        onError: (err) => setError(errorDetail(err, "Could not create the version")),
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New draft version of {plan.name}</DialogTitle>
          <DialogDescription>
            Published versions never change. Edit the draft, then publish it; subscribers of older versions move only at
            renewal, and only if the new version asks for it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Copy terms and items from" htmlFor="nv-from">
            <select id="nv-from" className={SELECT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Start empty (everything charged)</option>
              {sortVersions(plan.versions).map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_no} ({v.status.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <ReasonField id="nv-reason" value={reason} onChange={setReason} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
