import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Plus, Store, Tag, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { ActorName } from "@/components/shared/ActorName";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudienceEditor } from "@/components/plans/AudienceEditor";
import { InstitutePicker } from "@/components/plans/InstitutePicker";
import { Field, PlansSectionError, PlansSwitchNote, ReasonField, SELECT_CLASS, TonePill } from "@/components/plans/shared";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen } from "@/lib/model-defaults";
import {
  AUDIENCE_MODE_LABEL,
  BRAND_MODES,
  BRAND_MODE_HINT,
  BRAND_MODE_LABEL,
  STOREFRONT_MODES,
  STOREFRONT_MODE_HINT,
  STOREFRONT_MODE_LABEL,
  buildSegmentPut,
  buildStorefrontInstitutePut,
  parseSegmentKey,
  storefrontPriceLine,
  storefrontVerdict,
  triState,
  type InheritOnOff,
} from "@/lib/plan-billing";
import { liveVersion } from "@/lib/plans";
import { useBillingSwitches, usePutSegment, usePutStorefrontAudience, usePutStorefrontInstitute, useStorefront } from "@/services/plan-billing-api";
import { usePlanSettings, usePlans } from "@/services/plans-api";
import type { AudienceRule, BrandMode, StorefrontInstitute, StorefrontMode } from "@/types/plan-billing";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/** /ai-plans/storefront — who sees the self-serve plan storefront, and how each institute is branded. */
export default function PlanStorefrontPage() {
  const { toasts, push, dismiss } = useToasts();
  const plansSwitch = usePlanSettings();
  const switches = useBillingSwitches();
  const storefront = useStorefront();
  const putAudience = usePutStorefrontAudience();
  const [editing, setEditing] = useState<StorefrontInstitute | "new" | null>(null);

  // The setting is the source of truth; a server-reported mode only matters when it disagrees (a stale replica).
  const mode: StorefrontMode = switches.storefrontMode;
  const serverMode = storefront.data?.mode ?? null;
  const rules = storefront.data?.audience ?? [];
  const members = storefront.data?.segment_members ?? {};
  const ids = (kind: AudienceRule["rule"]) => new Set(rules.filter((r) => r.rule === kind && r.institute_id).map((r) => r.institute_id as string));
  const segs = (kind: AudienceRule["rule"]) => rules.filter((r) => r.rule === kind && r.segment_key).map((r) => r.segment_key as string);
  const allowlisted = ids("INCLUDE");
  const excludedIds = ids("EXCLUDE");
  const inAny = (iid: string, keys: string[]) => keys.some((k) => (members[k] ?? []).includes(iid));
  const includeSegs = segs("INCLUDE");
  const excludeSegs = segs("EXCLUDE");

  return (
    <div>
      <PageHeader
        title="AI plan storefront"
        description="Institute admins can buy listed AI plans themselves. Everything here is dark by default: the storefront stays hidden until its mode is changed on AI settings."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-plans">
              <ArrowLeft className="mr-1 h-4 w-4" /> All plans
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <PlansSwitchNote enabled={plansSwitch.enabled} loaded={plansSwitch.loaded} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" /> Rollout switches
            </CardTitle>
            <CardDescription>
              Read-only here; change them on{" "}
              <Link to="/ai-settings" className="font-medium underline underline-offset-2">
                AI settings
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {!switches.loaded ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <SwitchTile
                    label="billing.storefront.mode"
                    value={STOREFRONT_MODE_LABEL[mode]}
                    tone={mode === "OFF" ? "muted" : mode === "ALL" ? "ok" : "info"}
                    hint={switches.storefrontModeRegistered ? STOREFRONT_MODE_HINT[mode] : "Not registered on this ai-service yet: Off."}
                  />
                  <SwitchTile
                    label="billing.subscriptions.payments.enabled"
                    value={switches.paymentsEnabled === true ? "On" : "Off"}
                    tone={switches.paymentsEnabled === true ? "ok" : "muted"}
                    hint="Off: no subscription payment link or debit is created. Checkout is refused."
                  />
                  <SwitchTile
                    label="billing.autopay.enabled"
                    value={switches.autopayEnabled === true ? "On" : "Off"}
                    tone={switches.autopayEnabled === true ? "ok" : "muted"}
                    hint="Off: no UPI Autopay or card mandate is registered or charged; renewals use payment links."
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  {STOREFRONT_MODES.map((m) => (
                    <span key={m} className={m === mode ? "rounded border border-primary px-1.5 py-0.5 font-medium text-foreground" : "rounded border px-1.5 py-0.5"}>
                      {STOREFRONT_MODE_LABEL[m]}
                    </span>
                  ))}
                </div>
                {serverMode && serverMode !== mode && (
                  <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    The storefront endpoint reports mode {STOREFRONT_MODE_LABEL[serverMode]}, the setting says {STOREFRONT_MODE_LABEL[mode]}. A replica may
                    still hold the old value (settings are cached briefly).
                  </p>
                )}
                {mode !== "OFF" && switches.paymentsEnabled !== true && (
                  <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    The storefront is on but payments are off: admins see plans but checkout is refused.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <SectionErrorBoundary title="Listed plans">
          <ListedPlansCard />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Storefront access">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storefront allowlist and segments</CardTitle>
              <CardDescription>
                Included institutes count in Allowlist and Segments modes; included segments only in Segments mode. An exclusion (institute or
                segment) hides the storefront in every mode, even over a per-institute On switch. Sub-org institutes never see the
                storefront; their parent buys.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {storefront.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : storefront.isError ? (
                <PlansSectionError error={storefront.error} what="storefront" onRetry={() => storefront.refetch()} />
              ) : (
                <AudienceEditor
                  idPrefix="sf"
                  rules={storefront.data?.audience ?? []}
                  emptyText="Nobody on the allowlist yet."
                  saving={putAudience.isPending}
                  onSave={(body) => putAudience.mutateAsync(body)}
                  notify={push}
                  savedText="Storefront allowlist saved."
                />
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Segments">
          <SegmentsCard members={members} referenced={[...includeSegs, ...excludeSegs]} loading={storefront.isLoading} error={storefront.isError ? storefront.error : null} onRetry={() => storefront.refetch()} notify={push} />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Per-institute switches">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Per-institute switches</CardTitle>
                  <CardDescription>
                    Turn the storefront on or off for one institute whatever the mode (mode Off, payments off and exclusions still win), and override its brand. Brand
                    is automatic by default: an institute with its own admin domain is Neutral, every other one is Vacademy.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setEditing("new")} disabled={!storefront.isSuccess}>
                  <Plus className="mr-1 h-4 w-4" /> Add institute
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {storefront.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : storefront.isError ? (
                <PlansSectionError error={storefront.error} what="storefront" onRetry={() => storefront.refetch()} />
              ) : (storefront.data?.institutes ?? []).length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No per-institute switches. Every institute follows the mode and the allowlist.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Institute</th>
                        <th className="px-2 py-2 font-medium">Storefront</th>
                        <th className="px-2 py-2 font-medium">Brand</th>
                        <th className="px-2 py-2 font-medium">Result</th>
                        <th className="px-2 py-2 font-medium">Changed</th>
                        <th className="py-2 pl-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(storefront.data?.institutes ?? []).map((i) => {
                        const verdict = storefrontVerdict(mode, i.storefront_enabled, allowlisted.has(i.institute_id), {
                          paymentsEnabled: switches.paymentsEnabled,
                          excluded: excludedIds.has(i.institute_id) || inAny(i.institute_id, excludeSegs),
                          inListedSegment: storefront.data ? inAny(i.institute_id, includeSegs) : undefined,
                        });
                        const visible = i.storefront_visible ?? verdict.visible;
                        return (
                          <tr key={i.institute_id} className="border-b align-top last:border-0">
                            <td className="py-2 pr-3">
                              <Link to={`/institutes/${encodeURIComponent(i.institute_id)}?tab=ai-plan`} className="font-medium hover:underline">
                                {i.institute_name ?? i.institute_id}
                              </Link>
                              {i.institute_name && <p className="font-mono text-[11px] text-muted-foreground">{i.institute_id}</p>}
                            </td>
                            <td className="px-2 py-2 text-xs">{triLabel(triState(i.storefront_enabled))}</td>
                            <td className="px-2 py-2 text-xs">
                              {i.brand_mode_override ? `${BRAND_MODE_LABEL[i.brand_mode_override]} (override)` : "Automatic"}
                              {i.brand_mode && <p className="text-muted-foreground">now: {BRAND_MODE_LABEL[i.brand_mode]}</p>}
                            </td>
                            <td className="px-2 py-2 text-xs">
                              <TonePill tone={visible === true ? "ok" : visible === false ? "muted" : "warn"}>
                                {visible === true ? "Sees storefront" : visible === false ? "Hidden" : "Depends on segment"}
                              </TonePill>
                              <p className="mt-0.5 text-muted-foreground">{i.storefront_visible !== null ? "per server" : verdict.why}</p>
                            </td>
                            <td className="px-2 py-2 text-xs text-muted-foreground">
                              {formatWhen(i.updated_at)}
                              {i.updated_by && (
                                <span className="block">
                                  <ActorName id={i.updated_by} />
                                </span>
                              )}
                            </td>
                            <td className="py-2 pl-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Edit ${i.institute_name ?? i.institute_id}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>
      </div>
      {editing && <InstituteSwitchDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)} notify={push} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const triLabel = (v: InheritOnOff) => (v === "INHERIT" ? "Follows the mode" : v === "ON" ? "On" : "Off");

function SwitchTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "ok" | "info" | "muted" }) {
  return (
    <div className="space-y-1 rounded-md border p-3">
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
      <TonePill tone={tone}>{value}</TonePill>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ListedPlansCard() {
  const plans = usePlans();
  const rows = (plans.data ?? []).filter((p) => p.is_active).sort((a, b) => a.listing.sort_order - b.listing.sort_order || a.name.localeCompare(b.name));
  const listed = rows.filter((p) => p.listing.listed);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Listed plans</CardTitle>
        <CardDescription>What the storefront can offer, in display order. Edit a plan's listing and audience from its page.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {plans.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : plans.isError ? (
          <PlansSectionError error={plans.error} what="plans" onRetry={() => plans.refetch()} />
        ) : listed.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No plan is listed. Open a plan → Listing &amp; audience → Listed on the storefront.</p>
        ) : (
          <ul className="divide-y text-sm">
            {listed.map((p) => {
              const v = liveVersion(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link to={`/ai-plans/${encodeURIComponent(p.id)}?tab=listing`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.listing.badge && (
                      <span className="ml-2">
                        <TonePill tone="info">{p.listing.badge}</TonePill>
                      </span>
                    )}
                    {p.listing.tagline && <span className="block text-xs text-muted-foreground">{p.listing.tagline}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Audience: {AUDIENCE_MODE_LABEL[p.listing.audience_mode]}</span>
                    {v ? (
                      <span className="tabular-nums text-foreground">{storefrontPriceLine(v)}</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">No published version: not shown</span>
                    )}
                    {v && v.currency.toUpperCase() !== "INR" && <span className="text-destructive">{v.currency}: not sold (INR only)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > listed.length && listed.length > 0 && (
          <p className="pt-2 text-[11px] text-muted-foreground">{rows.length - listed.length} active plan(s) not listed: super admins can still assign them.</p>
        )}
      </CardContent>
    </Card>
  );
}

function InstituteSwitchDialog({ row, onClose, notify }: { row: StorefrontInstitute | null; onClose: () => void; notify: Notify }) {
  const put = usePutStorefrontInstitute();
  const [instituteId, setInstituteId] = useState(row?.institute_id ?? "");
  const [instituteName, setInstituteName] = useState<string | null>(row?.institute_name ?? null);
  const [storefront, setStorefront] = useState<InheritOnOff>(triState(row?.storefront_enabled ?? null));
  const [brand, setBrand] = useState<BrandMode | "AUTO">(row?.brand_mode_override ?? "AUTO");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    setError(null);
    if (instituteId.trim() === "") return setError("Pick an institute");
    const built = buildStorefrontInstitutePut({ storefront, brand, reason });
    if ("error" in built) return setError(built.error);
    put.mutate(
      { instituteId: instituteId.trim(), body: built.body },
      {
        onSuccess: () => {
          notify("success", `${instituteName ?? instituteId}: storefront switches saved.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? `Storefront for ${row.institute_name ?? row.institute_id}` : "Per-institute storefront switch"}</DialogTitle>
          <DialogDescription>Both settings apply from the institute's next page load (the server caches them for a few minutes).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Institute">
            <InstitutePicker
              value={instituteId}
              label={instituteName}
              disabled={!!row}
              onChange={(id, name) => {
                setInstituteId(id);
                setInstituteName(name);
              }}
            />
          </Field>
          <Field label="Storefront" htmlFor="sw-sf" hint="Off hides it whatever the mode. On shows it unless the mode is Off, payments are off, or it is excluded.">
            <select id="sw-sf" className={SELECT_CLASS} value={storefront} onChange={(e) => setStorefront(e.target.value as InheritOnOff)}>
              <option value="INHERIT">Follow the mode and allowlist</option>
              <option value="ON">On</option>
              <option value="OFF">Off</option>
            </select>
          </Field>
          <Field label="Brand" htmlFor="sw-brand" hint={brand === "AUTO" ? "Custom admin domain → Neutral, otherwise Vacademy." : BRAND_MODE_HINT[brand]}>
            <select id="sw-brand" className={SELECT_CLASS} value={brand} onChange={(e) => setBrand(e.target.value as BrandMode | "AUTO")}>
              <option value="AUTO">Automatic (from the admin domain)</option>
              {BRAND_MODES.map((b) => (
                <option key={b} value={b}>
                  {BRAND_MODE_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>
          {brand === "VACADEMY" && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Forcing Vacademy on a white-labelled institute shows the platform's name to its admins on invoices and emails. Their own admin site
              still never shows it.
            </p>
          )}
          <ReasonField id="sw-reason" value={reason} onChange={setReason} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={put.isPending}>
            {put.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ai_institute_segment: which institutes are in each segment (used by Segments mode and by SEGMENT plan audiences). */
function SegmentsCard({
  members,
  referenced,
  loading,
  error,
  onRetry,
  notify,
}: {
  members: Record<string, string[]>;
  referenced: string[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  notify: Notify;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const keys = [...new Set([...Object.keys(members), ...referenced])].sort();
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Segments</CardTitle>
            <CardDescription>Named groups of institutes. A segment can open the storefront (Segments mode) and be a plan's audience.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing("new")} disabled={loading || !!error}>
            <Plus className="mr-1 h-4 w-4" /> New segment
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : error ? (
          <PlansSectionError error={error} what="storefront/audience" onRetry={onRetry} />
        ) : keys.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No segments yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {keys.map((k) => {
              const n = (members[k] ?? []).length;
              return (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{k}</span>
                    <span className="text-xs text-muted-foreground">{n === 1 ? "1 institute" : `${n} institutes`}</span>
                    {n === 0 && referenced.includes(k) && <TonePill tone="warn">used but empty</TonePill>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(k)} aria-label={`Edit segment ${k}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing && <SegmentDialog segment={editing === "new" ? null : editing} members={editing === "new" ? [] : members[editing] ?? []} onClose={() => setEditing(null)} notify={notify} />}
    </Card>
  );
}

function SegmentDialog({ segment, members, onClose, notify }: { segment: string | null; members: string[]; onClose: () => void; notify: Notify }) {
  const put = usePutSegment();
  const [key, setKey] = useState(segment ?? "");
  const [draft, setDraft] = useState<{ id: string; name: string | null }[]>(() => members.map((id) => ({ id, name: null })));
  const [picker, setPicker] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    setError(null);
    const k = parseSegmentKey(key);
    if ("error" in k) return setError(k.error);
    const built = buildSegmentPut(
      draft.map((d) => d.id),
      reason
    );
    if ("error" in built) return setError(built.error);
    put.mutate(
      { segment: k.value, body: built.body },
      {
        onSuccess: () => {
          notify("success", `Segment ${k.value}: ${built.body.institute_ids.length} institute(s) saved.`);
          onClose();
        },
        onError: (err) => setError(errorDetail(err, "Could not save the segment")),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{segment ? `Segment ${segment}` : "New segment"}</DialogTitle>
          <DialogDescription>Saving replaces the whole member list. Storefront and plan audiences that use the segment follow on the next page load.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Segment key" htmlFor="seg-key" hint="Lowercase letters, digits, - or _, starting with a letter.">
            <Input id="seg-key" value={key} onChange={(e) => setKey(e.target.value)} disabled={!!segment} placeholder="e.g. pilot" className="h-9 font-mono" />
          </Field>
          {draft.length === 0 ? (
            <p className="text-xs text-muted-foreground">No institutes in this segment.</p>
          ) : (
            <ul className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {draft.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                  {d.name ?? <span className="font-mono">{d.id}</span>}
                  <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label={`Remove ${d.name ?? d.id}`} onClick={() => setDraft((x) => x.filter((y) => y.id !== d.id))}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Add an institute">
            <InstitutePicker
              value={picker}
              onChange={(id, name) => {
                if (!id) return setPicker("");
                setDraft((x) => (x.some((y) => y.id === id) ? x : [...x, { id, name }]));
                setPicker("");
              }}
            />
          </Field>
          <ReasonField id="seg-reason" value={reason} onChange={setReason} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={go} disabled={put.isPending}>
            {put.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
