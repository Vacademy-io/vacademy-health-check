import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ChevronDown, ChevronRight, FlaskConical, Loader2, Lock, Rocket, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toggle } from "@/components/shared/Toggle";
import { ActorName } from "@/components/shared/ActorName";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen } from "@/lib/model-defaults";
import {
  BASIS_LABEL,
  CAP_BASES,
  GRACE_BEHAVIOURS,
  GRACE_LABEL,
  MODEL_POLICIES,
  MODE_HINT,
  MODE_LABEL,
  PERIOD_MONTH_OPTIONS,
  PLAN_ROLE_CLASSES,
  POLICY_HINT,
  POLICY_LABEL,
  VIOLATION_ACTIONS,
  VIOLATION_LABEL,
  allowedModes,
  buildItemsPut,
  buildTermsPatch,
  describeCaps,
  diffVersions,
  formatInrMinor,
  formatUsd,
  itemDraftsFor,
  liveVersion,
  modeCounts,
  normalizeItem,
  periodText,
  sameItems,
  stripItemId,
  termsDraft,
  type ItemDraft,
  type TermsDraft,
} from "@/lib/plans";
import { usePatchVersion, usePutItems, useVersionTransition } from "@/services/plans-api";
import type { BillingFeature, CapBasis, GraceBehaviour, ItemMode, ModelPolicy, Plan, PlanVersion, ViolationAction } from "@/types/plans";
import { EligibilityBadge, Field, ModeBadge, ReasonField, SELECT_CLASS, StatusPill } from "./shared";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/**
 * One plan version: its commercial terms and the per-feature items. A DRAFT is editable; a
 * PUBLISHED or RETIRED version is frozen (a DB trigger refuses edits), so it renders read-only.
 */
export function VersionEditor({
  plan,
  version,
  features,
  inrPerUsd,
  notify,
}: {
  plan: Plan;
  version: PlanVersion;
  features: BillingFeature[];
  inrPerUsd: number;
  notify: Notify;
}) {
  const editable = version.status === "DRAFT";
  // Remount the forms when the stored version changes, so a save shows the server's values.
  const termsKey = `${version.id}|${version.updated_at}|${version.price_minor}|${version.allowance_credits}|${version.status}`;
  const itemsKey = `${version.id}|${version.updated_at}|${version.status}|${JSON.stringify(version.items)}`;
  const [transition, setTransition] = useState<"publish" | "retire" | null>(null);
  const [dirty, setDirty] = useState<{ terms: boolean; items: boolean }>({ terms: false, items: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {plan.name} · v{version.version_no}
              </CardTitle>
              <StatusPill status={version.status} />
              {version.subscriber_count !== null && (
                <span className="text-xs text-muted-foreground">{version.subscriber_count} subscription(s)</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/ai-plans/simulate?plan=${encodeURIComponent(plan.id)}&version=${encodeURIComponent(version.id)}`}>
                  <FlaskConical className="mr-1 h-4 w-4" /> Simulate
                </Link>
              </Button>
              {version.status === "DRAFT" && (
                <Button size="sm" onClick={() => setTransition("publish")} disabled={dirty.terms || dirty.items} title={dirty.terms || dirty.items ? "Save your changes first" : undefined}>
                  <Rocket className="mr-1 h-4 w-4" /> Publish
                </Button>
              )}
              {version.status === "PUBLISHED" && (
                <Button size="sm" variant="outline" onClick={() => setTransition("retire")}>
                  <Archive className="mr-1 h-4 w-4" /> Retire
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            {editable
              ? "A draft is inert: nothing bills against it and it cannot be assigned until it is published. Publishing freezes it."
              : version.status === "PUBLISHED"
                ? "Published and frozen. To change terms or items, create a new version from this one; existing subscribers move only at renewal, and only if the new version says so."
                : "Retired: no new subscriptions; existing subscribers keep it until they move."}
            {version.published_at && (
              <>
                {" "}
                Published {formatWhen(version.published_at)} by <ActorName id={version.published_by} />.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <TermsForm
            key={termsKey}
            plan={plan}
            version={version}
            editable={editable}
            inrPerUsd={inrPerUsd}
            notify={notify}
            onDirty={(d) => setDirty((x) => (x.terms === d ? x : { ...x, terms: d }))}
          />
        </CardContent>
      </Card>

      <ItemsCard
        key={itemsKey}
        version={version}
        features={features}
        editable={editable}
        notify={notify}
        onDirty={(d) => setDirty((x) => (x.items === d ? x : { ...x, items: d }))}
      />

      {transition && (
        <TransitionDialog plan={plan} version={version} features={features} action={transition} onClose={() => setTransition(null)} notify={notify} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- terms

function TermsForm({
  plan,
  version,
  editable,
  inrPerUsd,
  notify,
  onDirty,
}: {
  plan: Plan;
  version: PlanVersion;
  editable: boolean;
  inrPerUsd: number;
  notify: Notify;
  onDirty: (dirty: boolean) => void;
}) {
  const patch = usePatchVersion();
  const [draft, setDraft] = useState<TermsDraft>(() => termsDraft(version));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TermsDraft>(k: K, v: TermsDraft[K]) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    const built = buildTermsPatch(version, next, "x");
    onDirty("error" in built ? true : built.changed);
  };
  const others = plan.versions.filter((v) => v.id !== version.id);
  const capUsd = Number(draft.internal_cost_cap_usd);

  if (!editable) {
    return (
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Term label="Price" value={`${formatInrMinor(version.price_minor)} ${version.is_tax_inclusive ? "incl. tax" : "+ GST"}`} />
        <Term label="Period" value={periodText(version.period_months)} />
        <Term label="Allowance" value={`${version.allowance_credits.toLocaleString("en-IN")} credits / period`} />
        <Term
          label="Internal cost cap"
          value={version.internal_cost_cap_usd === null ? "None" : `${formatUsd(version.internal_cost_cap_usd)} ≈ ₹${Math.round(version.internal_cost_cap_usd * inrPerUsd).toLocaleString("en-IN")}`}
        />
        <Term label="Grace" value={`${version.grace_days} days · ${GRACE_LABEL[version.grace_behaviour]}`} />
        <Term label="SAC code" value={version.sac_code ?? "—"} />
        <Term label="Supersedes" value={others.find((v) => v.id === version.supersedes_version_id) ? `v${others.find((v) => v.id === version.supersedes_version_id)!.version_no}` : "—"} />
        <Term label="Move existing subscribers at renewal" value={version.migrate_existing_at_renewal ? "Yes" : "No"} />
      </dl>
    );
  }

  const save = () => {
    setError(null);
    const built = buildTermsPatch(version, draft, reason);
    if ("error" in built) return setError(built.error);
    if (!built.changed) return setError("Nothing changed");
    patch.mutate(
      { versionId: version.id, ...built.body },
      {
        onSuccess: () => {
          setReason("");
          onDirty(false);
          notify("success", `Terms of v${version.version_no} saved.`);
        },
        onError: (err) => setError(errorDetail(err, "Could not save the terms")),
      }
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Price per period (₹)" htmlFor="t-price" hint="Stored in paise. 0 = free plan.">
          <Input id="t-price" value={draft.price_rupees} onChange={(e) => set("price_rupees", e.target.value)} inputMode="decimal" className="h-9" />
        </Field>
        <Field label="Period" htmlFor="t-period">
          <select id="t-period" className={SELECT_CLASS} value={draft.period_months} onChange={(e) => set("period_months", Number(e.target.value))}>
            {PERIOD_MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {periodText(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Allowance credits per period" htmlFor="t-allow" hint="Pays allowance features, then the wallet. No rollover.">
          <Input id="t-allow" value={draft.allowance_credits} onChange={(e) => set("allowance_credits", e.target.value)} inputMode="decimal" className="h-9" />
        </Field>
        <Field
          label="Internal cost cap (USD / period)"
          htmlFor="t-cap"
          hint={
            draft.internal_cost_cap_usd.trim() !== "" && Number.isFinite(capUsd)
              ? `≈ ₹${Math.round(capUsd * inrPerUsd).toLocaleString("en-IN")} at ₹${inrPerUsd}/$. Past it, included features are charged. Never shown to tenants.`
              : "Blank = no cap. Real vendor cost of included use; past it, included features are charged."
          }
        >
          <Input id="t-cap" value={draft.internal_cost_cap_usd} onChange={(e) => set("internal_cost_cap_usd", e.target.value)} inputMode="decimal" className="h-9" />
        </Field>
        <Field label="Grace days" htmlFor="t-grace">
          <Input id="t-grace" value={draft.grace_days} onChange={(e) => set("grace_days", e.target.value)} inputMode="numeric" className="h-9" />
        </Field>
        <Field label="During grace" htmlFor="t-gb">
          <select id="t-gb" className={SELECT_CLASS} value={draft.grace_behaviour} onChange={(e) => set("grace_behaviour", e.target.value as GraceBehaviour)}>
            {GRACE_BEHAVIOURS.map((g) => (
              <option key={g} value={g}>
                {GRACE_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="SAC code" htmlFor="t-sac" hint="Printed on the invoice (phase 2).">
          <Input id="t-sac" value={draft.sac_code} onChange={(e) => set("sac_code", e.target.value)} maxLength={16} className="h-9" />
        </Field>
        <Field label="Supersedes" htmlFor="t-sup">
          <select id="t-sup" className={SELECT_CLASS} value={draft.supersedes_version_id} onChange={(e) => set("supersedes_version_id", e.target.value)}>
            <option value="">— none —</option>
            {others.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no} ({v.status.toLowerCase()})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SwitchRow label="Price includes tax" hint="Off: GST at 18% is added on the invoice, like credit packs." checked={draft.is_tax_inclusive} onChange={(v) => set("is_tax_inclusive", v)} />
        <SwitchRow
          label="Move existing subscribers at renewal"
          hint="On: subscribers of the superseded version switch to this one at their next renewal."
          checked={draft.migrate_existing_at_renewal}
          onChange={(v) => set("migrate_existing_at_renewal", v)}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <ReasonField id="t-reason" value={reason} onChange={setReason} className="min-w-[260px] flex-1" />
        <Button type="submit" disabled={patch.isPending}>
          {patch.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save terms
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// ---------------------------------------------------------------- items

function ItemsCard({
  version,
  features,
  editable,
  notify,
  onDirty,
}: {
  version: PlanVersion;
  features: BillingFeature[];
  editable: boolean;
  notify: Notify;
  onDirty: (dirty: boolean) => void;
}) {
  const put = usePutItems();
  const byKey = useMemo(() => new Map(features.map((f) => [f.feature_key, f])), [features]);
  const [drafts, setDrafts] = useState<ItemDraft[]>(() => itemDraftsFor(features, version.items));
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stored = useMemo(() => {
    // The stored list, completed with CHARGED rows for features without an item, for change detection.
    const built = buildItemsPut(itemDraftsFor(features, version.items), features);
    return "items" in built ? built.items : version.items.map(stripItemId);
  }, [features, version.items]);

  const update = (key: string, patch: Partial<ItemDraft>) => {
    const next = drafts.map((d) => (d.feature_key === key ? { ...d, ...patch } : d));
    setDrafts(next);
    const built = buildItemsPut(next, features);
    onDirty("error" in built ? true : !sameItems(built.items, stored));
  };

  const counts = modeCounts(drafts);

  const save = () => {
    setError(null);
    const built = buildItemsPut(drafts, features);
    if ("error" in built) return setError(built.error);
    if (sameItems(built.items, stored)) return setError("Nothing changed");
    if (reason.trim() === "") return setError("Give a reason (it lands in the change log)");
    put.mutate(
      { versionId: version.id, items: built.items, reason: reason.trim() },
      {
        onSuccess: () => {
          setReason("");
          onDirty(false);
          notify("success", `Items of v${version.version_no} saved.`);
        },
        onError: (err) => setError(errorDetail(err, "Could not save the items")),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Features</CardTitle>
        <CardDescription>
          {counts.INCLUDED} included · {counts.ALLOWANCE} from allowance · {counts.CHARGED} charged. The mode list follows
          each feature's eligibility. Included uses need a matching role and model and must fit every fair-use cap; past a
          cap the use is charged. Caps are internal; tenants see the fair-use text and a % bar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-6 py-2" />
                <th className="py-2 pr-3 font-medium">Feature</th>
                <th className="px-2 py-2 font-medium">Eligibility</th>
                <th className="px-2 py-2 font-medium">Mode</th>
                <th className="px-2 py-2 font-medium">Model policy</th>
                <th className="px-2 py-2 font-medium">Fair-use caps</th>
                <th className="px-2 py-2 font-medium">Tenant text</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const f = byKey.get(d.feature_key);
                const eligibility = f?.eligibility ?? "ALWAYS_CHARGED";
                const modes = allowedModes(eligibility);
                const included = d.mode === "INCLUDED";
                const isOpen = open === d.feature_key;
                const preview = normalizeItem(d);
                return (
                  <Fragment key={d.feature_key}>
                    <tr className={cn("border-b", isOpen && "bg-muted/40")}>
                      <td className="py-2 align-top">
                        {included && (
                          <button type="button" onClick={() => setOpen(isOpen ? null : d.feature_key)} className="rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label={isOpen ? "Hide details" : "Show details"} aria-expanded={isOpen}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <p className="font-medium">{f?.label ?? d.feature_key}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{d.feature_key}</p>
                        {!f && <p className="text-[11px] text-destructive">Not in the catalogue</p>}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <EligibilityBadge eligibility={eligibility} locked={f?.locked} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        {editable && modes.length > 1 ? (
                          <select
                            className={cn(SELECT_CLASS, "h-8 w-40")}
                            value={d.mode}
                            onChange={(e) => update(d.feature_key, { mode: e.target.value as ItemMode })}
                            aria-label={`Mode for ${f?.label ?? d.feature_key}`}
                            title={MODE_HINT[d.mode]}
                          >
                            {modes.map((m) => (
                              <option key={m} value={m}>
                                {MODE_LABEL[m]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {modes.length === 1 && <Lock className="h-3 w-3 text-muted-foreground" />}
                            <ModeBadge mode={d.mode} />
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {included ? (
                          editable ? (
                            <select className={cn(SELECT_CLASS, "h-8 w-44")} value={d.model_policy} onChange={(e) => update(d.feature_key, { model_policy: e.target.value as ModelPolicy })} aria-label="Model policy" title={POLICY_HINT[d.model_policy]}>
                              {MODEL_POLICIES.map((p) => (
                                <option key={p} value={p}>
                                  {POLICY_LABEL[p]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span title={POLICY_HINT[d.model_policy]}>{POLICY_LABEL[d.model_policy]}</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {included ? (
                          <button type="button" className="text-left hover:underline" onClick={() => setOpen(isOpen ? null : d.feature_key)}>
                            {describeCaps(preview)}
                            {d.roles_included.length > 0 && <span className="block text-muted-foreground">Roles: {d.roles_included.join(", ")}</span>}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {editable && d.mode !== "CHARGED" ? (
                          <Input value={d.display_cap_text} onChange={(e) => update(d.feature_key, { display_cap_text: e.target.value })} maxLength={255} placeholder="e.g. Fair use: 300 messages per learner" className="h-8 text-xs" aria-label="Tenant-facing fair-use text" />
                        ) : (
                          <span className={d.display_cap_text ? "" : "text-muted-foreground"}>{d.display_cap_text || "—"}</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && included && (
                      <tr className="border-b bg-muted/40">
                        <td />
                        <td colSpan={6} className="pb-4 pr-3 pt-1">
                          <ItemDetails draft={d} editable={editable} onChange={(p) => update(d.feature_key, p)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <ReasonField id="items-reason" value={reason} onChange={setReason} className="min-w-[260px] flex-1" />
              <Button onClick={save} disabled={put.isPending}>
                {put.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Save features
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ItemDetails({ draft, editable, onChange }: { draft: ItemDraft; editable: boolean; onChange: (p: Partial<ItemDraft>) => void }) {
  const cap = (k: keyof ItemDraft, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input value={String(draft[k])} onChange={(e) => onChange({ [k]: e.target.value } as Partial<ItemDraft>)} disabled={!editable} inputMode="decimal" placeholder="No cap" className="h-8 text-xs" aria-label={label} />
    </Field>
  );
  const toggleRole = (r: string) =>
    onChange({ roles_included: draft.roles_included.includes(r) ? draft.roles_included.filter((x) => x !== r) : [...draft.roles_included, r] });

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{POLICY_HINT[draft.model_policy]}</p>
      {draft.model_policy === "ALLOWLIST" && (
        <Field label="Included model ids" hint="Comma or space separated, e.g. z-ai/glm-5.3-flash, google/gemini-2.5-flash">
          <Input value={draft.model_allowlist} onChange={(e) => onChange({ model_allowlist: e.target.value })} disabled={!editable} className="h-8 font-mono text-xs" aria-label="Included model ids" />
        </Field>
      )}
      {draft.model_policy === "MAX_PRICE" && (
        <Field label="Highest output price (USD per 1M tokens)" hint="Compared with ai_models.output_price_per_1m.">
          <Input value={draft.max_output_price_per_1m} onChange={(e) => onChange({ max_output_price_per_1m: e.target.value })} disabled={!editable} inputMode="decimal" className="h-8 w-40 text-xs" aria-label="Highest output price" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cap("inst_units_cap", "Institute uses / period")}
        {cap("inst_credits_cap", "Institute list credits / period")}
        {cap("inst_cost_usd_cap", "Institute real cost USD / period")}
        {cap("user_units_cap", "Uses per user / period")}
        {cap("user_credits_cap", "List credits per user / period")}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Per-user caps count" hint={draft.user_cap_basis === "SUBJECT" ? "The learner the work is about (analytics runs on each learner's activity)." : "The person who triggered the use."}>
          <select className={cn(SELECT_CLASS, "h-8")} value={draft.user_cap_basis} onChange={(e) => onChange({ user_cap_basis: e.target.value as CapBasis })} disabled={!editable} aria-label="Per-user caps count">
            {CAP_BASES.map((b) => (
              <option key={b} value={b}>
                {BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Past a cap" hint="Charge = the use is charged from credits. Block applies only at the pre-check.">
          <select className={cn(SELECT_CLASS, "h-8")} value={draft.over_cap_action} onChange={(e) => onChange({ over_cap_action: e.target.value as ViolationAction })} disabled={!editable} aria-label="Past a cap">
            {VIOLATION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {VIOLATION_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model not covered" hint="Charge = labelled “Premium model, charged”.">
          <select className={cn(SELECT_CLASS, "h-8")} value={draft.on_model_violation} onChange={(e) => onChange({ on_model_violation: e.target.value as ViolationAction })} disabled={!editable} aria-label="Model not covered">
            {VIOLATION_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {VIOLATION_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Roles included</p>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_ROLE_CLASSES.map((r) => {
            const on = draft.roles_included.includes(r);
            return (
              <button
                key={r}
                type="button"
                disabled={!editable}
                aria-pressed={on}
                onClick={() => toggleRole(r)}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              >
                {r}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {draft.roles_included.length === 0 ? "None picked = every role is included." : "Uses by other roles are charged."} API_KEY is the partner API.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- publish / retire

function TransitionDialog({
  plan,
  version,
  features,
  action,
  onClose,
  notify,
}: {
  plan: Plan;
  version: PlanVersion;
  features: BillingFeature[];
  action: "publish" | "retire";
  onClose: () => void;
  notify: Notify;
}) {
  const mutate = useVersionTransition();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prev = useMemo(() => {
    if (action !== "publish") return null;
    const sup = plan.versions.find((v) => v.id === version.supersedes_version_id);
    return sup ?? liveVersion({ versions: plan.versions.filter((v) => v.id !== version.id) });
  }, [action, plan.versions, version]);
  const diff = action === "publish" ? diffVersions(prev, version, features) : [];
  const word = `v${version.version_no}`;

  const go = () => {
    setError(null);
    if (reason.trim() === "") return setError("Give a reason (it lands in the change log)");
    if (action === "publish" && confirm.trim() !== word) return setError(`Type ${word} to confirm`);
    mutate.mutate(
      { versionId: version.id, action, reason: reason.trim() },
      {
        onSuccess: () => {
          notify("success", `${plan.name} ${word} ${action === "publish" ? "published" : "retired"}.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, `Could not ${action} the version`)),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {action === "publish" ? "Publish" : "Retire"} {plan.name} {word}?
          </DialogTitle>
          <DialogDescription>
            {action === "publish"
              ? "Publishing freezes the terms and items for good (the database refuses later edits) and lets super admins assign it. Nobody's billing changes until a subscription on it is set to Live and billing.plans.enabled is on."
              : "Retiring stops new assignments. Existing subscriptions keep this version until they renew onto another one; their billing does not change now."}
          </DialogDescription>
        </DialogHeader>
        {action === "publish" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{prev ? `Changes against v${prev.version_no}` : "First published version"}</p>
            {diff.length === 0 ? (
              <p className="text-xs text-muted-foreground">No differences.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">What</th>
                      {prev && <th className="px-2 py-1.5 font-medium">Was</th>}
                      <th className="px-2 py-1.5 font-medium">Becomes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d) => (
                      <tr key={d.what} className="border-b last:border-0 align-top">
                        <td className="px-2 py-1.5 font-medium">{d.what}</td>
                        {prev && <td className="px-2 py-1.5 text-muted-foreground">{d.from}</td>}
                        <td className="px-2 py-1.5">{d.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="space-y-3">
          <ReasonField id="tr-reason" value={reason} onChange={setReason} />
          {action === "publish" && (
            <Field label={`Type ${word} to confirm`} htmlFor="tr-confirm">
              <Input id="tr-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 w-32 font-mono" />
            </Field>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={action === "retire" ? "destructive" : "default"} onClick={go} disabled={mutate.isPending}>
            {mutate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {action === "publish" ? "Publish" : "Retire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
