import { useState } from "react";
import { Loader2, Lock, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActorName } from "@/components/shared/ActorName";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen } from "@/lib/model-defaults";
import { ELIGIBILITIES, ELIGIBILITY_HINT, ELIGIBILITY_LABEL, isVoiceFeature } from "@/lib/plans";
import { useBillingFeatures, usePatchFeature } from "@/services/plans-api";
import type { BillingFeature, FeatureEligibility, FeaturePatch } from "@/types/plans";
import { EligibilityBadge, Field, PlansSectionError, ReasonField, SELECT_CLASS } from "./shared";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/** Plans → "Feature catalogue": the billing features plan items reference, and which modes each allows. */
export function FeatureCatalog({ notify }: { notify: Notify }) {
  const features = useBillingFeatures();
  const [editing, setEditing] = useState<BillingFeature | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature catalogue</CardTitle>
        <CardDescription>
          Every AI use case bills under one of these features (ai_use_case_catalog.billing_feature_key; anything unmapped is
          “Other AI usage”, always charged). Eligibility is a platform guard the plan editor cannot get past: an
          “Always charged” feature is charged whatever a plan says. AI calling and telephony are locked.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {features.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : features.isError ? (
          <PlansSectionError error={features.error} what="features" onRetry={() => features.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="px-2 py-2 font-medium">Eligibility</th>
                  <th className="px-2 py-2 font-medium">Use cases</th>
                  <th className="px-2 py-2 text-right font-medium">Order</th>
                  <th className="px-2 py-2 font-medium">Last change</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {(features.data ?? []).map((f) => (
                  <tr key={f.feature_key} className={f.is_active ? "border-b last:border-0" : "border-b opacity-60 last:border-0"}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{f.label}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{f.feature_key}</p>
                      {f.description && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{f.description}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <EligibilityBadge eligibility={f.eligibility} locked={f.locked} />
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {f.use_cases.length > 0 ? (
                        <span title={f.use_cases.join(", ")}>
                          {f.use_cases.slice(0, 4).join(", ")}
                          {f.use_cases.length > 4 && ` +${f.use_cases.length - 4}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{f.display_order}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {f.updated_at ? (
                        <>
                          {formatWhen(f.updated_at)} · <ActorName id={f.updated_by} />
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f)} aria-label={`Edit ${f.label}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(features.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                      No billing features yet (migration V588 seeds them).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {editing && <FeatureDialog key={editing.feature_key} feature={editing} onClose={() => setEditing(null)} notify={notify} />}
    </Card>
  );
}

function FeatureDialog({ feature, onClose, notify }: { feature: BillingFeature; onClose: () => void; notify: Notify }) {
  const patch = usePatchFeature();
  const [label, setLabel] = useState(feature.label);
  const [description, setDescription] = useState(feature.description ?? "");
  const [order, setOrder] = useState(String(feature.display_order));
  const [eligibility, setEligibility] = useState<FeatureEligibility>(feature.eligibility);
  const [unlockReason, setUnlockReason] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eligibilityChanged = eligibility !== feature.eligibility;
  const voice = isVoiceFeature(feature.feature_key);

  const save = () => {
    setError(null);
    const body: FeaturePatch = { reason: reason.trim() };
    if (label.trim() === "") return setError("The label cannot be empty");
    if (label.trim() !== feature.label) body.label = label.trim();
    if (description.trim() !== (feature.description ?? "")) body.description = description.trim() === "" ? null : description.trim();
    const n = Number(order);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return setError("Order: a whole number from 0 to 10000");
    if (n !== feature.display_order) body.display_order = n;
    if (eligibilityChanged) {
      body.eligibility = eligibility;
      if (feature.locked) {
        if (unlockReason.trim().length < 10) return setError("A locked feature needs an unlock reason (at least 10 characters)");
        body.unlock_reason = unlockReason.trim();
      }
    }
    if (Object.keys(body).length === 1) return setError("Nothing changed");
    if (body.reason === "") return setError("Give a reason (it lands in the change log)");
    patch.mutate(
      { key: feature.feature_key, ...body },
      {
        onSuccess: () => {
          notify("success", `${label.trim()} saved.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not save the feature")),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feature.locked && <Lock className="h-4 w-4" />}
            {feature.label}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{feature.feature_key}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Label (tenants see this)" htmlFor="feat-label">
            <Input id="feat-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={128} className="h-9" />
          </Field>
          <Field label="Description" htmlFor="feat-desc">
            <Textarea id="feat-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eligibility" htmlFor="feat-elig" hint={ELIGIBILITY_HINT[eligibility]}>
              <select id="feat-elig" className={SELECT_CLASS} value={eligibility} onChange={(e) => setEligibility(e.target.value as FeatureEligibility)}>
                {ELIGIBILITIES.map((e) => (
                  <option key={e} value={e}>
                    {ELIGIBILITY_LABEL[e]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display order" htmlFor="feat-order">
              <Input id="feat-order" value={order} onChange={(e) => setOrder(e.target.value)} inputMode="numeric" className="h-9" />
            </Field>
          </div>
          {feature.locked && eligibilityChanged && (
            <div className="space-y-1.5 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-medium">This feature is locked{voice ? " (voice-bot billing)" : ""}.</p>
              <p>
                {voice
                  ? "AI calls and call minutes are billed by admin-core's call billing. Letting a plan absorb them changes what institutes pay for calls; the call pre-checks also need plan support first."
                  : "Changing its eligibility changes how every plan bills it."}{" "}
                Explain why it is being unlocked.
              </p>
              <Input value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Unlock reason" className="h-9 bg-background" aria-label="Unlock reason" />
            </div>
          )}
          {eligibilityChanged && !feature.locked && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Published plan versions keep their items, but the platform guard applies at billing time: a feature made
              “Always charged” is charged in every plan from the next use.
            </p>
          )}
          <ReasonField id="feat-reason" value={reason} onChange={setReason} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={patch.isPending}>
            {patch.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
