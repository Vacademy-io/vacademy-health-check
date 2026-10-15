import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, Loader2, Lock, Pencil, Plus, ServerOff, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActorName } from "@/components/shared/ActorName";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Toggle } from "@/components/shared/Toggle";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen, isNotFound } from "@/lib/model-defaults";
import { FEATURE_GROUPS, formatCredits, type Tone } from "@/lib/metering";
import {
  DEFAULT_TIMEZONE,
  ENFORCE_SETTING_KEY,
  LIMITS_MODES,
  LIMIT_ROLE_CLASSES,
  METRICS,
  METRIC_LABEL,
  MODE_HINT,
  MODE_LABEL,
  ROW_PERIODS,
  SCOPE_KINDS,
  SCOPE_LABEL,
  SUBJECT_KINDS,
  SUBJECT_LABEL,
  USAGE_PERIODS,
  buildPolicyPut,
  buildRowCreate,
  buildRowPatch,
  describeScope,
  describeSubject,
  effectiveMode,
  emptyRowDraft,
  formatLimit,
  isLimitsMode,
  isValidTimeZone,
  meterPct,
  meterTone,
  periodLabel,
  policyDraft,
  rowDraftFromRow,
  softMarkPct,
  type PolicyDraft,
  type RowDraft,
} from "@/lib/limits";
import {
  useCreateLimitRow,
  useDeleteLimitRow,
  useGlobalEnforce,
  useInstituteLimits,
  useLimitsUsage,
  usePatchLimitRow,
  usePutLimitsPolicy,
} from "@/services/limits-api";
import { useRoleMap, useUseCaseCatalog } from "@/services/metering-api";
import type { InstituteLimits, LimitRow, LimitUsageMeter, LimitsPolicy } from "@/types/limits";
import type { UseCaseCatalogRow } from "@/types/metering";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

const httpStatus = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

const SELECT_CLASS = "h-9 w-full rounded-md border bg-background px-2 text-sm";

const MODE_PILL: Record<string, string> = {
  OFF: "border-border text-muted-foreground",
  SHADOW: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ENFORCE: "border-blue-500/40 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
};

const TONE_BAR: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-destructive",
  off: "bg-muted-foreground/40",
};

/** The policy mode as a coloured pill; ENFORCE while the global switch is off says it runs as Shadow. */
export function ModePill({ mode, globalEnforce = true }: { mode: string; globalEnforce?: boolean }) {
  const label = isLimitsMode(mode) ? MODE_LABEL[mode] : mode;
  const acting = effectiveMode(mode, globalEnforce);
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap px-2 py-0.5 text-[11px] font-medium", MODE_PILL[mode] ?? MODE_PILL.OFF)}
      title={acting !== mode ? "The global switch is off, so this runs as Shadow" : undefined}
    >
      {label}
      {acting !== mode && <span className="ml-1 font-normal">(acts as Shadow)</span>}
    </Badge>
  );
}

/** A section's error: 404 = backend not deployed, 403 = not a super admin, else the message and Retry. */
export function LimitsSectionError({ error, what, onRetry }: { error: unknown; what: string; onRetry: () => void }) {
  if (isNotFound(error)) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ServerOff className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Backend not deployed yet</p>
        <p className="max-w-lg text-xs text-muted-foreground">
          ai-service doesn't serve <span className="font-mono">/super-admin/v1/metering/limits/{what}</span> yet (404).
          Until it does, no institute has limits and AI calls run exactly as today.
        </p>
        <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
          Check again
        </Button>
      </div>
    );
  }
  if (httpStatus(error) === 403) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Super-admin access required</p>
        <p className="max-w-lg text-xs text-muted-foreground">ai-service refused this account (403).</p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
      <span className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" /> Could not load {what}: {errorDetail(error, "request failed")}
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** Read-only state of metering.limits.enforce, with a link to the AI settings page where it is edited. */
export function GlobalEnforceNote({ enabled, known }: { enabled: boolean; known: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 text-xs",
        enabled ? "text-muted-foreground" : "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      )}
    >
      {!enabled && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        Global switch <span className="font-mono">{ENFORCE_SETTING_KEY}</span> is{" "}
        <span className="font-semibold">{enabled ? "on" : "off"}</span>
        {!known && " (not set; the default is on)"}.{" "}
        {enabled
          ? "Institutes in Enforce mode refuse calls at their hard limits."
          : "Every institute in Enforce mode runs as Shadow: nothing is blocked, would-blocks are logged."}{" "}
        Change it on{" "}
        <Link to="/ai-settings" className="font-medium underline underline-offset-2">
          AI settings
        </Link>
        .
      </span>
    </div>
  );
}

/** InstituteDetailPage → "AI limits": policy, tenant + platform rows, and the current usage counters. */
export function LimitsTab({ instituteId }: { instituteId: string }) {
  const { toasts, push, dismiss } = useToasts();
  const query = useInstituteLimits(instituteId);
  const global = useGlobalEnforce(query.data?.enforce_globally_enabled);

  return (
    <div className="space-y-6">
      <GlobalEnforceNote enabled={global.enabled} known={global.known} />
      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <Card>
          <CardContent className="pt-6">
            <LimitsSectionError error={query.error} what={`${instituteId}/policy`} onRetry={() => query.refetch()} />
          </CardContent>
        </Card>
      ) : query.data ? (
        <>
          <SectionErrorBoundary title="Limits policy">
            <PolicyCard instituteId={instituteId} data={query.data} globalEnforce={global.enabled} notify={push} />
          </SectionErrorBoundary>
          <SectionErrorBoundary title="Limit rows">
            <RowsCard instituteId={instituteId} data={query.data} notify={push} fetching={query.isFetching} />
          </SectionErrorBoundary>
          <SectionErrorBoundary title="Usage">
            <UsageCard instituteId={instituteId} timezone={query.data.policy.timezone} />
          </SectionErrorBoundary>
        </>
      ) : null}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ---------------------------------------------------------------- policy

function PolicyCard({
  instituteId,
  data,
  globalEnforce,
  notify,
}: {
  instituteId: string;
  data: InstituteLimits;
  globalEnforce: boolean;
  notify: Notify;
}) {
  const p = data.policy;
  // Remount the form when the stored policy changes, so a save shows the server's values.
  const formKey = `${p.mode}|${p.tenant_may_enforce}|${p.timezone}|${p.notify_admins_on_soft}|${p.show_numbers_to_learners}|${p.updated_at}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Limits policy</CardTitle>
          <ModePill mode={p.mode} globalEnforce={globalEnforce} />
          {p.is_default && <Badge variant="secondary">No policy row</Badge>}
        </div>
        <CardDescription>
          {p.is_default
            ? "This institute has no limits policy, so AI calls are never counted against a cap or blocked (today's behaviour). Saving creates the policy row."
            : "Limits never change what a call is charged; the credit balance check runs first, unchanged. Windows start at local midnight in the time zone below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <PolicyForm key={formKey} instituteId={instituteId} policy={p} globalEnforce={globalEnforce} notify={notify} />
      </CardContent>
    </Card>
  );
}

function PolicyForm({
  instituteId,
  policy,
  globalEnforce,
  notify,
}: {
  instituteId: string;
  policy: LimitsPolicy;
  globalEnforce: boolean;
  notify: Notify;
}) {
  const put = usePutLimitsPolicy(instituteId);
  const [draft, setDraft] = useState<PolicyDraft>(() => policyDraft(policy));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PolicyDraft>(k: K, v: PolicyDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const tzOk = isValidTimeZone(draft.timezone.trim());
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [];
    }
  }, []);

  const save = () => {
    setError(null);
    const built = buildPolicyPut(policy, draft, reason);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    put.mutate(built.body, {
      onSuccess: () => {
        setReason("");
        notify("success", `Limits policy saved: ${MODE_LABEL[built.body.mode]}.`);
      },
      onError: (err) => setError(errorDetail(err, "Could not save the policy")),
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="space-y-1.5">
        <Label>Mode</Label>
        <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Limits mode">
          {LIMITS_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={draft.mode === m}
              onClick={() => set("mode", m)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                draft.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{MODE_HINT[draft.mode]}</p>
        {draft.mode === "ENFORCE" && !globalEnforce && (
          <p className="text-xs text-amber-700 dark:text-amber-300">The global switch is off, so Enforce runs as Shadow until it is turned on.</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SwitchRow
          label="Institute admins may choose Enforce"
          hint="Off: their own limits page offers Off and Shadow only. This page can set any mode either way."
          checked={draft.tenant_may_enforce}
          onChange={(v) => set("tenant_may_enforce", v)}
        />
        <SwitchRow
          label="Email admins at the soft limit"
          hint="One email per counter per window."
          checked={draft.notify_admins_on_soft}
          onChange={(v) => set("notify_admins_on_soft", v)}
        />
        <SwitchRow
          label="Show numbers to learners"
          hint="Off: learners only see that they reached the limit and when it resets."
          checked={draft.show_numbers_to_learners}
          onChange={(v) => set("show_numbers_to_learners", v)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="limits-tz">Time zone</Label>
          <Input
            id="limits-tz"
            value={draft.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            list="limits-tz-options"
            placeholder={DEFAULT_TIMEZONE}
            className={cn("h-9", !tzOk && "border-destructive")}
          />
          <datalist id="limits-tz-options">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">Day, week and month windows start at local midnight here.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1 space-y-1.5">
          <Label htmlFor="limits-policy-reason">Reason</Label>
          <Input id="limits-policy-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Required — lands in the change log" className="h-9" />
        </div>
        <Button type="submit" disabled={put.isPending}>
          {put.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {policy.is_default ? "Create policy" : "Save policy"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!policy.is_default && (
        <p className="text-xs text-muted-foreground">
          Last changed {formatWhen(policy.updated_at)} by <ActorName id={policy.updated_by} />
          {policy.reason && <> — “{policy.reason}”</>}
        </p>
      )}
    </form>
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

// ---------------------------------------------------------------- rows

function RowsCard({ instituteId, data, notify, fetching }: { instituteId: string; data: InstituteLimits; notify: Notify; fetching: boolean }) {
  const catalog = useUseCaseCatalog();
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LimitRow | null>(null);
  const [removing, setRemoving] = useState<LimitRow | null>(null);

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of catalog.data ?? []) m.set(r.use_case, r.label);
    return m;
  }, [catalog.data]);

  const visible = (rows: LimitRow[]) => (showRemoved ? rows : rows.filter((r) => r.is_active));
  const removedCount = [...data.rows, ...data.platform_rows].filter((r) => !r.is_active).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Limit rows</CardTitle>
            {fetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-3">
            {removedCount > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                Show removed ({removedCount})
              </label>
            )}
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add row
            </Button>
          </div>
        </div>
        <CardDescription>
          Every scope level (all AI, a feature group, a use case) is checked on its own and all must pass. Per level the
          most specific tenant row applies (user, then role, then role class); institute pools, pooled role rows and
          platform rows always apply on top. Locked platform rows cannot be edited or out-ranked by the institute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        <RowsTable
          title="Platform rows"
          empty="No platform caps. Add one to hold this institute to a fair-use or safety cap it cannot change."
          rows={visible(data.platform_rows)}
          labels={labels}
          onEdit={setEditing}
          onRemove={setRemoving}
        />
        <RowsTable
          title="Institute rows"
          empty="The institute has not set any limits of its own."
          rows={visible(data.rows)}
          labels={labels}
          onEdit={setEditing}
          onRemove={setRemoving}
        />
      </CardContent>

      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        {adding && (
          <RowForm
            instituteId={instituteId}
            existing={[...data.rows, ...data.platform_rows]}
            catalog={catalog.data ?? []}
            onCancel={() => setAdding(false)}
            onDone={(text) => {
              setAdding(false);
              notify("success", text);
            }}
          />
        )}
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <RowForm
            key={editing.id}
            instituteId={instituteId}
            row={editing}
            existing={[...data.rows, ...data.platform_rows]}
            catalog={catalog.data ?? []}
            labels={labels}
            onCancel={() => setEditing(null)}
            onDone={(text) => {
              setEditing(null);
              notify("success", text);
            }}
          />
        )}
      </Dialog>
      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        {removing && (
          <RemoveRowForm
            key={removing.id}
            instituteId={instituteId}
            row={removing}
            labels={labels}
            onCancel={() => setRemoving(null)}
            onDone={(text) => {
              setRemoving(null);
              notify("success", text);
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function RowsTable({
  title,
  empty,
  rows,
  labels,
  onEdit,
  onRemove,
}: {
  title: string;
  empty: string;
  rows: LimitRow[];
  labels: Map<string, string>;
  onEdit: (r: LimitRow) => void;
  onRemove: (r: LimitRow) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Applies to</th>
              <th className="px-2 py-2 font-medium">Counts</th>
              <th className="px-2 py-2 font-medium">Period</th>
              <th className="px-2 py-2 text-right font-medium">Soft</th>
              <th className="px-2 py-2 text-right font-medium">Hard</th>
              <th className="px-2 py-2 font-medium">Changed</th>
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-b align-top last:border-0", !r.is_active && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                <td className="py-2 pr-2">
                  <span className="font-medium">{describeSubject(r)}</span>
                  {r.locked && (
                    <Badge variant="outline" className="ml-1.5 gap-1 px-1.5 py-0 text-[10px]">
                      <Lock className="h-3 w-3" /> locked
                    </Badge>
                  )}
                  {r.subject_kind === "USER" && r.subject_label && r.subject_label !== r.subject_value && <p className="font-mono text-[11px] text-muted-foreground">{r.subject_value}</p>}
                </td>
                <td className="px-2 py-2">
                  {describeScope(r, labels)}
                  <span className="ml-1.5 text-xs text-muted-foreground">· {METRIC_LABEL[r.metric as keyof typeof METRIC_LABEL] ?? r.metric}</span>
                </td>
                <td className="px-2 py-2">{periodLabel(r.period)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatLimit(r.soft_limit, r.metric)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.hard_limit === 0 ? <span className="font-medium">0 (off)</span> : formatLimit(r.hard_limit, r.metric)}
                </td>
                <td className="px-2 py-2 text-xs text-muted-foreground">
                  {formatWhen(r.updated_at ?? r.created_at)}
                  <p>
                    <ActorName id={r.created_by} />
                  </p>
                  {r.reason && (
                    <p className="max-w-[220px] truncate" title={r.reason}>
                      “{r.reason}”
                    </p>
                  )}
                </td>
                <td className="py-2 pl-2 text-right">
                  {r.is_active && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(r)} aria-label={`Edit ${describeSubject(r)}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onRemove(r)} aria-label={`Remove ${describeSubject(r)}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Add (no `row`) or edit (`row`). Editing changes the numbers, per-member and lock only; re-add to change the rest. */
function RowForm({
  instituteId,
  row,
  existing,
  catalog,
  labels,
  onCancel,
  onDone,
}: {
  instituteId: string;
  row?: LimitRow;
  existing: LimitRow[];
  catalog: UseCaseCatalogRow[];
  labels?: Map<string, string>;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const create = useCreateLimitRow(instituteId);
  const patch = usePatchLimitRow(instituteId);
  const roleMap = useRoleMap();
  const [draft, setDraft] = useState<RowDraft>(() => (row ? rowDraftFromRow(row) : emptyRowDraft("PLATFORM")));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RowDraft>(k: K, v: RowDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const editing = row !== undefined;
  const pending = create.isPending || patch.isPending;
  const roleRow = draft.subject_kind === "ROLE" || draft.subject_kind === "ROLE_CLASS";

  const groups = useMemo(() => {
    const s = new Set<string>(FEATURE_GROUPS);
    for (const c of catalog) s.add(c.feature_group);
    return [...s].sort();
  }, [catalog]);
  const useCases = useMemo(() => [...catalog].filter((c) => c.is_active).sort((a, b) => a.label.localeCompare(b.label)), [catalog]);

  const save = () => {
    setError(null);
    if (row) {
      const built = buildRowPatch(row, draft, reason);
      if ("error" in built) {
        setError(built.error);
        return;
      }
      patch.mutate(
        { rowId: row.id, ...built.patch },
        { onSuccess: () => onDone(`Updated ${describeSubject(row)}.`), onError: (err) => setError(errorDetail(err, "Could not save the row")) }
      );
      return;
    }
    const built = buildRowCreate(draft, reason, { existing, catalog });
    if ("error" in built) {
      setError(built.error);
      return;
    }
    create.mutate(built.body, {
      onSuccess: () => onDone(`Added a ${built.body.origin === "PLATFORM" ? "platform" : "tenant"} limit.`),
      onError: (err) => setError(errorDetail(err, "Could not add the row")),
    });
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit limit" : "Add limit"}</DialogTitle>
        <DialogDescription>
          {editing
            ? `${describeSubject(row)} · ${describeScope(row, labels)} · ${periodLabel(row.period)}. To change who or what it counts, remove it and add a new one.`
            : "Blank soft or hard means no limit at that level. A hard limit of 0 turns the feature off for this subject."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!editing && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Origin" htmlFor="limit-origin" hint={draft.origin === "PLATFORM" ? "Set by the platform; the institute cannot out-rank it." : "Acts as if the institute admin had set it."}>
              <select
                id="limit-origin"
                className={SELECT_CLASS}
                value={draft.origin}
                onChange={(e) => {
                  const origin = e.target.value as RowDraft["origin"];
                  setDraft((d) => ({ ...d, origin, locked: origin === "PLATFORM" }));
                }}
              >
                <option value="PLATFORM">Platform</option>
                <option value="TENANT">Tenant (institute)</option>
              </select>
            </Field>
            <Field label="Applies to" htmlFor="limit-subject">
              <select
                id="limit-subject"
                className={SELECT_CLASS}
                value={draft.subject_kind}
                onChange={(e) => setDraft((d) => ({ ...d, subject_kind: e.target.value as RowDraft["subject_kind"], subject_value: "" }))}
              >
                {SUBJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SUBJECT_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            {draft.subject_kind === "ROLE_CLASS" && (
              <Field label="Role class" htmlFor="limit-role-class" hint={draft.subject_value === "SYSTEM" ? "Scheduled and on-behalf work: auto analytics, reports, AI calls." : undefined}>
                <select id="limit-role-class" className={SELECT_CLASS} value={draft.subject_value} onChange={(e) => set("subject_value", e.target.value)}>
                  <option value="">Pick a class</option>
                  {LIMIT_ROLE_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {draft.subject_kind === "ROLE" && (
              <Field label="Role name" htmlFor="limit-role" hint="The raw auth role, e.g. EVALUATOR.">
                <Input id="limit-role" value={draft.subject_value} onChange={(e) => set("subject_value", e.target.value)} list="limit-role-options" className="h-9" />
                <datalist id="limit-role-options">
                  {(roleMap.data?.roles ?? []).map((r) => (
                    <option key={r.role_name} value={r.role_name}>
                      {r.role_class}
                    </option>
                  ))}
                </datalist>
              </Field>
            )}
            {draft.subject_kind === "USER" && (
              <Field label="User id" htmlFor="limit-user" hint="Copy it from the Users tab.">
                <Input id="limit-user" value={draft.subject_value} onChange={(e) => set("subject_value", e.target.value)} className="h-9 font-mono text-xs" />
              </Field>
            )}
            <Field label="Counts" htmlFor="limit-scope">
              <select
                id="limit-scope"
                className={SELECT_CLASS}
                value={draft.scope_kind}
                onChange={(e) => setDraft((d) => ({ ...d, scope_kind: e.target.value as RowDraft["scope_kind"], scope_value: "" }))}
              >
                {SCOPE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SCOPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            {draft.scope_kind === "GROUP" && (
              <Field label="Feature group" htmlFor="limit-group">
                <select id="limit-group" className={SELECT_CLASS} value={draft.scope_value} onChange={(e) => set("scope_value", e.target.value)}>
                  <option value="">Pick a group</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {draft.scope_kind === "USE_CASE" && (
              <Field label="Use case" htmlFor="limit-use-case" hint={catalog.length === 0 ? "The catalog did not load; type the use-case key." : "Only limit-eligible use cases can be picked."}>
                {catalog.length === 0 ? (
                  <Input id="limit-use-case" value={draft.scope_value} onChange={(e) => set("scope_value", e.target.value)} className="h-9 font-mono text-xs" />
                ) : (
                  <select id="limit-use-case" className={SELECT_CLASS} value={draft.scope_value} onChange={(e) => set("scope_value", e.target.value)}>
                    <option value="">Pick a use case</option>
                    {useCases.map((c) => (
                      <option key={c.use_case} value={c.use_case} disabled={!c.limit_eligible}>
                        {c.label} ({c.use_case}){c.limit_eligible ? "" : " — not limit-eligible"}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label="Period" htmlFor="limit-period">
              <select id="limit-period" className={SELECT_CLASS} value={draft.period} onChange={(e) => set("period", e.target.value as RowDraft["period"])}>
                {ROW_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
                <option value="PLAN_PERIOD" disabled>
                  Plan period (with AI plans)
                </option>
              </select>
            </Field>
            <Field label="Metric" htmlFor="limit-metric" hint={draft.metric === "CREDITS" ? "List credits, before any plan discount." : draft.metric === "COST_USD" ? "Real vendor cost in US dollars." : "Requests (or the use case's count unit)."}>
              <select id="limit-metric" className={SELECT_CLASS} value={draft.metric} onChange={(e) => set("metric", e.target.value as RowDraft["metric"])}>
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Soft limit (warn)" htmlFor="limit-soft">
            <Input id="limit-soft" inputMode="decimal" value={draft.soft_limit} onChange={(e) => set("soft_limit", e.target.value)} placeholder="none" className="h-9" />
          </Field>
          <Field label="Hard limit (block)" htmlFor="limit-hard">
            <Input id="limit-hard" inputMode="decimal" value={draft.hard_limit} onChange={(e) => set("hard_limit", e.target.value)} placeholder="none" className="h-9" />
          </Field>
          {roleRow && !editing && (
            <SwitchRow
              label="Each member has this limit"
              hint="Off: one pool shared by everyone with the role."
              checked={draft.per_member}
              onChange={(v) => set("per_member", v)}
            />
          )}
          {(draft.origin === "PLATFORM" || editing || draft.locked) && (
            <SwitchRow
              label="Locked"
              hint={
                draft.origin === "PLATFORM"
                  ? "The institute cannot edit it and its own rows cannot lift it."
                  : "The institute admin cannot edit or remove this row."
              }
              checked={draft.locked}
              onChange={(v) => set("locked", v)}
            />
          )}
        </div>

        <Field label="Reason" htmlFor="limit-reason">
          <Input id="limit-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Required — lands in the change log" className="h-9" />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? "Save" : "Add limit"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RemoveRowForm({
  instituteId,
  row,
  labels,
  onCancel,
  onDone,
}: {
  instituteId: string;
  row: LimitRow;
  labels: Map<string, string>;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const del = useDeleteLimitRow(instituteId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Say why (it lands in the change log)");
      return;
    }
    del.mutate(
      { rowId: row.id, reason: reason.trim() },
      { onSuccess: () => onDone(`Removed ${describeSubject(row)}.`), onError: (err) => setError(errorDetail(err, "Could not remove the row")) }
    );
  };
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Remove this limit?</DialogTitle>
        <DialogDescription>
          {describeSubject(row)} · {describeScope(row, labels)} · {periodLabel(row.period)} (hard {formatLimit(row.hard_limit, row.metric)}). The row is
          ended, not erased; counters and history stay.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Reason" htmlFor="limit-remove-reason">
          <Input id="limit-remove-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} autoFocus />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={del.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={del.isPending}>
            {del.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------- usage

function UsageCard({ instituteId, timezone }: { instituteId: string; timezone: string }) {
  const [period, setPeriod] = useState<string>("DAY");
  const query = useLimitsUsage(instituteId, period);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Current usage</CardTitle>
            {query.isFetching && !query.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Window">
            {USAGE_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>
          Counters for the current {periodLabel(period).toLowerCase()} window ({timezone}). They only move while the institute has a policy; a nightly
          job rebuilds them from the usage events.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
          <LimitsSectionError error={query.error} what={`${instituteId}/usage`} onRetry={() => query.refetch()} />
        ) : (query.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No counters in this window.</p>
        ) : (
          <div className="space-y-3">
            {(query.data ?? []).map((m) => (
              <UsageMeterRow key={m.key} m={m} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageMeterRow({ m }: { m: LimitUsageMeter }) {
  const p = meterPct(m);
  const tone = meterTone(m);
  const soft = softMarkPct(m);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{m.label}</span>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{m.key}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatCredits(m.credits_used)} cr · {m.count_used.toLocaleString("en-IN", { maximumFractionDigits: 2 })} req
          {m.cost_usd !== null && <> · ${m.cost_usd.toFixed(m.cost_usd < 1 ? 4 : 2)}</>}
          {m.soft !== null && <> · soft {formatLimit(m.soft, m.metric ?? "CREDITS")}</>}
          {m.hard !== null && <> · hard {formatLimit(m.hard, m.metric ?? "CREDITS")}</>}
          {m.soft === null && m.hard === null && <> · no limit</>}
          {p !== null && <span className={cn("ml-1 font-semibold", tone === "error" && "text-destructive", tone === "warn" && "text-amber-700 dark:text-amber-300")}>{Math.round(p)}%</span>}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted" aria-hidden>
        <div className={cn("h-2 rounded-full", TONE_BAR[tone])} style={{ width: `${Math.min(100, p ?? 0)}%` }} />
        {soft !== null && <div className="absolute top-[-2px] h-3 w-0.5 bg-amber-600" style={{ left: `${soft}%` }} />}
      </div>
    </div>
  );
}
