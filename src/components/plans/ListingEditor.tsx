import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Store, Trash2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/shared/Toggle";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import {
  AUDIENCE_MODES,
  AUDIENCE_MODE_HINT,
  AUDIENCE_MODE_LABEL,
  LISTING_LIMITS,
  STOREFRONT_MODE_LABEL,
  buildListingPatch,
  lintListing,
  listingDraft,
  storefrontPriceLine,
  type ListingDraft,
} from "@/lib/plan-billing";
import { liveVersion, MODE_LABEL } from "@/lib/plans";
import { useAudiencePreview, useBillingSwitches, usePatchListing, usePlanAudience, usePutPlanAudience } from "@/services/plan-billing-api";
import type { BillingFeature, Plan } from "@/types/plans";
import { AudienceEditor } from "./AudienceEditor";
import { InstitutePicker } from "./InstitutePicker";
import { Field, ModeBadge, PlansSectionError, ReasonField, SELECT_CLASS, TonePill } from "./shared";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/** PlanDetailPage → "Listing & audience": storefront marketing, who it is offered to, and a preview. */
export function ListingEditor({ plan, features, notify }: { plan: Plan; features: BillingFeature[]; notify: Notify }) {
  const switches = useBillingSwitches();
  const patch = usePatchListing();
  const [draft, setDraft] = useState<ListingDraft>(() => listingDraft(plan.listing));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const live = liveVersion(plan);
  const hasPublishedInr = plan.versions.some((v) => v.status === "PUBLISHED" && v.currency.toUpperCase() === "INR");
  const lint = useMemo(
    () => lintListing({ name: plan.name, description: plan.description, tagline: draft.tagline, badge: draft.badge, highlights: draft.highlights }),
    [plan.name, plan.description, draft.tagline, draft.badge, draft.highlights]
  );
  const lintFields = new Set(lint.map((l) => l.field));

  const save = () => {
    setError(null);
    const built = buildListingPatch(draft, { name: plan.name, description: plan.description, hasPublishedInr });
    if ("error" in built) return setError(built.error);
    patch.mutate(
      { planId: plan.id, body: built.body },
      {
        onSuccess: () => {
          notify("success", `${plan.name}: listing saved${built.body.listed ? " (listed)" : " (not listed)"}.`);
          set("reason", "");
        },
        onError: (err) => setError(errorDetail(err, "Could not save the listing")),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
        <Store className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Storefront mode is <span className="font-semibold">{STOREFRONT_MODE_LABEL[switches.storefrontMode]}</span>
          {!switches.storefrontModeRegistered && switches.loaded && " (not registered on this ai-service yet; off)"}. A listed plan is shown only to
          institutes that can see the storefront and match its audience. Rollout is managed on{" "}
          <Link to="/ai-plans/storefront" className="font-medium underline underline-offset-2">
            Storefront
          </Link>
          .
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listing</CardTitle>
            <CardDescription>
              What institute admins see on the storefront. Price, allowance and period always come from the published version. White-labelled
              institutes see this text too, so it must not name the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Listed on the storefront</p>
                <p className="text-xs text-muted-foreground">
                  {hasPublishedInr ? "Off: only super admins can assign it." : "Needs a published INR version first."}
                </p>
              </div>
              <Toggle checked={draft.listed} onChange={(v) => set("listed", v)} label="Listed on the storefront" />
            </div>
            <Field label="Tagline" htmlFor="ls-tagline" hint={`${draft.tagline.trim().length}/${LISTING_LIMITS.tagline}`}>
              <Input
                id="ls-tagline"
                value={draft.tagline}
                onChange={(e) => set("tagline", e.target.value)}
                maxLength={LISTING_LIMITS.tagline + 20}
                placeholder="e.g. Everyday AI for growing institutes"
                className={cn("h-9", lintFields.has("Tagline") && "border-destructive")}
              />
            </Field>
            <Field label={`Highlights (up to ${LISTING_LIMITS.highlights})`}>
              <div className="space-y-2">
                {draft.highlights.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={h}
                      onChange={(e) => set("highlights", draft.highlights.map((x, j) => (j === i ? e.target.value : x)))}
                      maxLength={LISTING_LIMITS.highlight + 20}
                      placeholder="e.g. Unlimited AI question papers"
                      aria-label={`Highlight ${i + 1}`}
                      className={cn("h-9", lintFields.has(`Highlight ${i + 1}`) && "border-destructive")}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove highlight ${i + 1}`}
                      onClick={() => set("highlights", draft.highlights.length > 1 ? draft.highlights.filter((_, j) => j !== i) : [""])}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {draft.highlights.length < LISTING_LIMITS.highlights && (
                  <Button type="button" size="sm" variant="outline" onClick={() => set("highlights", [...draft.highlights, ""])}>
                    <Plus className="mr-1 h-4 w-4" /> Add highlight
                  </Button>
                )}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Badge" htmlFor="ls-badge" hint="Short, e.g. Most popular">
                <Input
                  id="ls-badge"
                  value={draft.badge}
                  onChange={(e) => set("badge", e.target.value)}
                  maxLength={LISTING_LIMITS.badge + 10}
                  className={cn("h-9", lintFields.has("Badge") && "border-destructive")}
                />
              </Field>
              <Field label="Sort order" htmlFor="ls-sort" hint="Lower comes first">
                <Input id="ls-sort" value={draft.sort_order} onChange={(e) => set("sort_order", e.target.value)} inputMode="numeric" className="h-9" />
              </Field>
              <Field label="Audience" htmlFor="ls-aud" hint={AUDIENCE_MODE_HINT[draft.audience_mode]}>
                <select id="ls-aud" className={SELECT_CLASS} value={draft.audience_mode} onChange={(e) => set("audience_mode", e.target.value as ListingDraft["audience_mode"])}>
                  {AUDIENCE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {AUDIENCE_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {lint.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Brand words found: {lint.map((l) => `${l.field} (${l.words.join(", ")})`).join("; ")}. Tenant-facing text must stay neutral; the server
                  rejects it too.
                  {lint.some((l) => l.field.startsWith("Plan ")) && " Rename the plan or edit its description on the Plans page."}
                </span>
              </div>
            )}
            <ReasonField id="ls-reason" value={draft.reason} onChange={(v) => set("reason", v)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(listingDraft(plan.listing))} disabled={patch.isPending}>
                Reset
              </Button>
              <Button onClick={save} disabled={patch.isPending}>
                {patch.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Save listing
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Card preview</CardTitle>
            <CardDescription>Roughly how the storefront card reads (the institute's own styling applies there).</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold">{plan.name}</p>
                {draft.badge.trim() && <TonePill tone="info">{draft.badge.trim()}</TonePill>}
              </div>
              {draft.tagline.trim() && <p className="text-sm text-muted-foreground">{draft.tagline.trim()}</p>}
              {live ? (
                <div>
                  <p className="text-lg font-semibold tabular-nums">{storefrontPriceLine(live)}</p>
                  {live.allowance_credits > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {live.allowance_credits.toLocaleString("en-IN")} credits every period for allowance features. Unused credits don't carry over.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300">No published version: nothing to sell yet.</p>
              )}
              <ul className="space-y-1 text-sm">
                {draft.highlights
                  .filter((h) => h.trim() !== "")
                  .map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {h.trim()}
                    </li>
                  ))}
              </ul>
              {live && live.items.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  {live.items
                    .filter((i) => i.mode !== "CHARGED")
                    .map((i) => {
                      const f = features.find((x) => x.feature_key === i.feature_key);
                      return (
                        <div key={i.feature_key} className="flex items-center justify-between gap-2 text-xs">
                          <span>{f?.tenant_label ?? f?.label ?? i.feature_key}</span>
                          <span className="flex items-center gap-1">
                            {i.display_cap_text && <span className="text-muted-foreground">{i.display_cap_text}</span>}
                            <ModeBadge mode={i.mode} />
                          </span>
                        </div>
                      );
                    })}
                  <p className="pt-1 text-[11px] text-muted-foreground">Everything else: {MODE_LABEL.CHARGED.toLowerCase()} from credits. AI calling and telephony are always charged.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AudienceCard plan={plan} audienceMode={plan.listing.audience_mode} notify={notify} />
    </div>
  );
}

function AudienceCard({ plan, audienceMode, notify }: { plan: Plan; audienceMode: ListingDraft["audience_mode"]; notify: Notify }) {
  const audience = usePlanAudience(plan.id);
  const put = usePutPlanAudience(plan.id);
  const [previewId, setPreviewId] = useState("");
  const [previewName, setPreviewName] = useState<string | null>(null);
  const preview = useAudiencePreview(plan.id, previewId || null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audience</CardTitle>
        <CardDescription>
          Saved audience mode: <span className="font-medium">{AUDIENCE_MODE_LABEL[audienceMode]}</span>. {AUDIENCE_MODE_HINT[audienceMode]}
          {audienceMode === "ALL" && " The list below is kept but not used while the mode is Everyone."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        {audience.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : audience.isError ? (
          <PlansSectionError error={audience.error} what={`plans/${plan.id}/audience`} onRetry={() => audience.refetch()} />
        ) : (
          <AudienceEditor
            idPrefix="pa"
            rules={audience.data ?? []}
            emptyText="Nobody yet. Add institutes or segments."
            saving={put.isPending}
            onSave={(body) => put.mutateAsync(body)}
            notify={notify}
            savedText={`${plan.name}: audience saved.`}
          />
        )}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Preview as an institute</p>
          <p className="text-xs text-muted-foreground">Builds that institute's plans page on the server (saved listing and audience only) and checks whether this plan is on it.</p>
          <InstitutePicker
            value={previewId}
            label={previewName}
            onChange={(id, name) => {
              setPreviewId(id);
              setPreviewName(name);
            }}
          />
          {previewId &&
            (preview.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : preview.isError ? (
              <PlansSectionError error={preview.error} what="storefront/preview" onRetry={() => preview.refetch()} />
            ) : preview.data ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {preview.data.offered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  {preview.data.offered
                    ? "Offered"
                    : preview.data.in_catalogue
                      ? "In its catalogue, but the plans page is hidden"
                      : "Not offered"}
                </p>
                {preview.data.why.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {preview.data.why.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null)}
        </div>
      </CardContent>
    </Card>
  );
}
