import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  Fingerprint,
  Gauge,
  History,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  ServerOff,
  ShieldAlert,
  Tags,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Toggle } from "@/components/shared/Toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { isNotFound } from "@/lib/model-defaults";
import {
  COVERAGE_DAY_OPTIONS,
  DEFAULT_PRECEDENCE,
  FEATURE_GROUPS,
  HISTORY_V2_SETTING_KEY,
  ROLE_CLASSES,
  UNMAPPED_CLASS,
  UNMAPPED_PRECEDENCE,
  addInstitute,
  buildCatalogPatch,
  coverageStats,
  creditDiff,
  draftFromRow,
  formatCredits,
  formatPct,
  isMappableRoleClass,
  parityTone,
  parityTotals,
  parseInstituteList,
  parsePrecedence,
  removeInstitute,
  serializeInstituteList,
  sourceRows,
  validateInstituteId,
  type CatalogDraft,
  type Tone,
} from "@/lib/metering";
import {
  fetchHistoryV2Setting,
  useHistoryV2Setting,
  useMeteringCoverage,
  useMeteringParity,
  usePutHistoryV2Setting,
  usePutRoleMap,
  useRoleMap,
  useUpdateUseCase,
  useUseCaseCatalog,
} from "@/services/metering-api";
import type { CoverageResponse, MappableRoleClass, ParityRow, RoleMapRow, UnmappedRole, UseCaseCatalogRow } from "@/types/metering";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

const httpStatus = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

const TONE_CLASSES: Record<Tone, string> = {
  ok: "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-destructive/40 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  off: "text-muted-foreground",
};

const TONE_LABEL: Record<Tone, string> = { ok: "In step", warn: "Gaps", error: "Not metering", off: "No traffic" };

const ROW_HIGHLIGHT: Record<Tone, string> = {
  ok: "",
  off: "text-muted-foreground",
  warn: "bg-amber-50/70 dark:bg-amber-950/20",
  error: "bg-red-50/70 dark:bg-red-950/20",
};

const SELECT_CLASS = "h-8 rounded-md border bg-background px-2 text-xs";

export default function MeteringPage() {
  const [days, setDays] = useState<number>(7);
  const coverage = useMeteringCoverage(days);
  const parity = useMeteringParity(days);
  const catalog = useUseCaseCatalog();
  const roleMap = useRoleMap();
  const { toasts, push, dismiss } = useToasts();

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of catalog.data ?? []) m.set(r.use_case, r.label);
    return m;
  }, [catalog.data]);

  const refreshAll = () => {
    coverage.refetch();
    parity.refetch();
    catalog.refetch();
    roleMap.refetch();
  };

  return (
    <div>
      <PageHeader
        title="Metering"
        description="Every AI charge and every free AI call writes a usage event next to the credit ledger, tagged with what it was for and who caused it. This page checks that the events keep up with the ledger and edits the two lookup tables behind the labels. Nothing here changes what anyone is charged."
        actions={
          <>
            <DaysPicker value={days} onChange={setDays} />
            <Button variant="outline" size="sm" onClick={refreshAll}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <SectionErrorBoundary title="Coverage">
          <CoverageSection query={coverage} days={days} labels={labels} />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Parity">
          <ParitySection query={parity} days={days} />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Use-case catalog">
          <CatalogSection query={catalog} notify={push} />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Role map">
          <RoleMapSection query={roleMap} notify={push} />
        </SectionErrorBoundary>

        <SectionErrorBoundary title="History v2 rollout">
          <HistoryRolloutSection notify={push} />
        </SectionErrorBoundary>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function DaysPicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Window">
      {COVERAGE_DAY_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={value === d}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            value === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
          )}
        >
          {d} days
        </button>
      ))}
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/** One section's loading / error states, so a missing endpoint does not hide the others. */
function SectionState<T>({
  query,
  what,
  children,
}: {
  query: QueryLike<T>;
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <SectionError error={query.error} what={what} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

function SectionError({ error, what, onRetry }: { error: unknown; what: string; onRetry: () => void }) {
  if (isNotFound(error)) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ServerOff className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Backend not deployed yet</p>
        <p className="max-w-lg text-xs text-muted-foreground">
          ai-service doesn't serve <span className="font-mono">/super-admin/v1/metering/{what}</span> yet (404). It
          appears with the metering release; until then credits and the ledger work exactly as today.
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

function ToneBadge({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap px-2 py-0.5 text-[11px] font-medium", TONE_CLASSES[tone])}>
      {label ?? TONE_LABEL[tone]}
    </Badge>
  );
}

// ---------------------------------------------------------------- coverage

function CoverageSection({
  query,
  days,
  labels,
}: {
  query: QueryLike<CoverageResponse>;
  days: number;
  labels: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Coverage · last {days} days</CardTitle>
          {query.data && <ToneBadge tone={coverageStats(query.data).tone} />}
          {query.isFetching && !query.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <CardDescription>
          Usage events against credit ledger usage rows. A ledger row without an event is a charge the metering missed
          (or one from before the release; run the owner backfill to cover those). "Known use case" and "resolved role"
          are the shares of events the History view can label properly.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <SectionState query={query} what="coverage">
          {(c) => <CoverageBody c={c} labels={labels} />}
        </SectionState>
      </CardContent>
    </Card>
  );
}

function CoverageBody({ c, labels }: { c: CoverageResponse; labels: Map<string, string> }) {
  const s = coverageStats(c);
  if (c.events === 0 && c.ledger_rows === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No AI usage in this window.</p>;
  }
  const maxCredits = Math.max(1, ...c.by_use_case.map((r) => r.credits));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Events vs ledger rows"
          value={`${c.events.toLocaleString()} / ${c.ledger_rows.toLocaleString()}`}
          description="Events include free calls, so they can exceed the ledger"
          icon={Gauge}
        />
        <StatCard
          title="Ledger rows without an event"
          value={c.ledger_without_event.toLocaleString()}
          description={`${formatPct(s.ledgerCoveredPct)} of ledger usage rows have an event`}
          icon={Link2Off}
          className={c.ledger_without_event > 0 ? "border-amber-500/50" : undefined}
        />
        <StatCard
          title="Known use case"
          value={formatPct(s.knownUseCasePct)}
          description={`${c.unknown_use_case_events.toLocaleString()} events fell back to 'unknown'`}
          icon={Tags}
        />
        <StatCard
          title="Resolved role"
          value={formatPct(s.resolvedRolePct)}
          description={`${s.unresolvedRoles.toLocaleString()} unresolved · ${c.null_actor_events.toLocaleString()} with no actor`}
          icon={Fingerprint}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SourceBreakdown title="How the use case was decided" counts={c.use_case_source} />
        <SourceBreakdown title="How the role was decided" counts={c.role_source} warnKey="UNRESOLVED" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Use case</th>
              <th className="px-2 py-2 text-right font-medium">Events</th>
              <th className="px-2 py-2 text-right font-medium">Credits charged</th>
              <th className="py-2 pl-2 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {c.by_use_case.map((r) => (
              <tr key={r.use_case} className={cn("border-b last:border-0", r.use_case === "unknown" && ROW_HIGHLIGHT.warn)}>
                <td className="py-2 pr-3">
                  <span className="font-medium">{labels.get(r.use_case) ?? r.use_case}</span>
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.use_case}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.events.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.credits)}</td>
                <td className="py-2 pl-2">
                  <div className="h-1.5 w-32 rounded-full bg-muted" aria-hidden>
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(Math.max(0, r.credits) / maxCredits) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {c.by_use_case.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceBreakdown({ title, counts, warnKey }: { title: string; counts: Record<string, number>; warnKey?: string }) {
  const rows = sourceRows(counts);
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <Badge
              key={r.key}
              variant="outline"
              className={cn("px-2 py-0.5 text-[11px] font-normal", r.key === warnKey && r.count > 0 && TONE_CLASSES.warn)}
            >
              <span className="font-mono">{r.key}</span>
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {r.count.toLocaleString()} · {formatPct(r.share)}
              </span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- parity

function ParitySection({ query, days }: { query: QueryLike<ParityRow[]>; days: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parity by day (IST) · last {days} days</CardTitle>
        <CardDescription>
          Ledger USAGE_DEDUCTION rows against CHARGED events per day. Rows with missing events are highlighted; a credit
          difference with no missing events means an event recorded a different amount than the ledger row it links to.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <SectionState query={query} what="parity">
          {(rows) => <ParityTable rows={rows} />}
        </SectionState>
      </CardContent>
    </Card>
  );
}

function ParityTable({ rows }: { rows: ParityRow[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No days to compare yet.</p>;
  const t = parityTotals(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Day</th>
            <th className="px-2 py-2 text-right font-medium">Ledger rows</th>
            <th className="px-2 py-2 text-right font-medium">Ledger credits</th>
            <th className="px-2 py-2 text-right font-medium">Events</th>
            <th className="px-2 py-2 text-right font-medium">Event credits</th>
            <th className="px-2 py-2 text-right font-medium">Missing events</th>
            <th className="px-2 py-2 text-right font-medium">Credit diff</th>
            <th className="py-2 pl-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = parityTone(r);
            const diff = creditDiff(r);
            return (
              <tr key={r.day} className={cn("border-b last:border-0", ROW_HIGHLIGHT[tone])}>
                <td className="py-2 pr-3 font-mono text-xs">{r.day}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.ledger_rows.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.ledger_credits)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.event_rows.toLocaleString()}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatCredits(r.event_credits)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", r.missing_events > 0 && "font-semibold text-amber-700 dark:text-amber-300")}>
                  {r.missing_events.toLocaleString()}
                </td>
                <td className={cn("px-2 py-2 text-right tabular-nums", diff !== 0 && "font-semibold text-amber-700 dark:text-amber-300")}>
                  {diff === 0 ? "0" : formatCredits(diff)}
                </td>
                <td className="py-2 pl-2">
                  <ToneBadge tone={tone} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t text-xs font-medium">
            <td className="py-2 pr-3">Total</td>
            <td className="px-2 py-2 text-right tabular-nums">{t.ledger_rows.toLocaleString()}</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatCredits(t.ledger_credits)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{t.event_rows.toLocaleString()}</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatCredits(t.event_credits)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{t.missing_events.toLocaleString()}</td>
            <td className="px-2 py-2 text-right tabular-nums">{formatCredits(Math.round((t.ledger_credits - t.event_credits) * 10_000) / 10_000)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- catalog

function CatalogSection({ query, notify }: { query: QueryLike<UseCaseCatalogRow[]>; notify: Notify }) {
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<UseCaseCatalogRow | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Use-case catalog</CardTitle>
        <CardDescription>
          What each AI feature is called in usage history, which group it sums into, and the order tenants see it in.
          Request types and tool keys decide the use case when a caller does not name one. Every change needs a reason
          and lands in the change log; it applies to new events within 5 minutes (stored events keep their use case).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by key, label, group, request type or tool key"
            className="h-8 max-w-sm text-xs"
            aria-label="Filter use cases"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
        <SectionState query={query} what="catalog">
          {(rows) => {
            const q = filter.trim().toLowerCase();
            const visible = rows.filter(
              (r) =>
                (showInactive || r.is_active) &&
                (q === "" ||
                  [r.use_case, r.label, r.feature_group, ...r.legacy_request_types, ...r.tool_keys].some((s) =>
                    s.toLowerCase().includes(q)
                  ))
            );
            return (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Order</th>
                      <th className="px-2 py-2 font-medium">Use case</th>
                      <th className="px-2 py-2 font-medium">Group</th>
                      <th className="px-2 py-2 font-medium">Label</th>
                      <th className="px-2 py-2 font-medium">Mapped from</th>
                      <th className="px-2 py-2 font-medium">Active</th>
                      <th className="py-2 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) =>
                      editing === r.use_case ? (
                        <CatalogEditRow
                          key={r.use_case}
                          row={r}
                          onDone={(text) => {
                            setEditing(null);
                            notify("success", text);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <CatalogRow key={r.use_case} row={r} onEdit={() => setEditing(r.use_case)} onToggle={() => setToggling(r)} />
                      )
                    )}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">
                          {rows.length === 0 ? "The catalog is empty — has the metering migration run?" : "No use case matches."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          }}
        </SectionState>
      </CardContent>
      <ToggleUseCaseDialog
        target={toggling}
        onClose={() => setToggling(null)}
        onDone={(text) => {
          setToggling(null);
          notify("success", text);
        }}
      />
    </Card>
  );
}

function MappingChips({ row }: { row: UseCaseCatalogRow }) {
  const items = [
    ...row.legacy_request_types.map((v) => ({ v, kind: "request type" })),
    ...row.tool_keys.map((v) => ({ v, kind: "tool key" })),
  ];
  if (items.length === 0) return <span className="text-xs text-muted-foreground">explicit only</span>;
  return (
    <div className="flex max-w-[280px] flex-wrap gap-1">
      {items.map((i) => (
        <span
          key={`${i.kind}:${i.v}`}
          title={i.kind}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px]",
            i.kind === "tool key" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {i.v}
        </span>
      ))}
    </div>
  );
}

function CatalogRow({ row, onEdit, onToggle }: { row: UseCaseCatalogRow; onEdit: () => void; onToggle: () => void }) {
  return (
    <tr className={cn("border-b align-top last:border-0", !row.is_active && "text-muted-foreground")}>
      <td className="py-2 pr-2 tabular-nums">{row.display_order}</td>
      <td className="px-2 py-2">
        <span className="font-mono text-xs">{row.use_case}</span>
        {row.billing_policy !== "AS_TODAY" && (
          <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px]">
            {row.billing_policy}
          </Badge>
        )}
        {row.model_use_case && <p className="text-[11px] text-muted-foreground">model: {row.model_use_case}</p>}
      </td>
      <td className="px-2 py-2 text-xs">{row.feature_group}</td>
      <td className="px-2 py-2">
        <p className="font-medium">{row.label}</p>
        {row.label_template && <p className="font-mono text-[11px] text-muted-foreground">{row.label_template}</p>}
      </td>
      <td className="px-2 py-2">
        <MappingChips row={row} />
      </td>
      <td className="px-2 py-2">
        <Toggle checked={row.is_active} onChange={onToggle} label={`${row.is_active ? "Deactivate" : "Activate"} ${row.use_case}`} />
      </td>
      <td className="py-2 pl-2 text-right">
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
      </td>
    </tr>
  );
}

function CatalogEditRow({ row, onDone, onCancel }: { row: UseCaseCatalogRow; onDone: (text: string) => void; onCancel: () => void }) {
  const update = useUpdateUseCase();
  const [draft, setDraft] = useState<CatalogDraft>(() => draftFromRow(row));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CatalogDraft) => (e: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const listId = `feature-groups-${row.use_case}`;

  const save = () => {
    setError(null);
    const built = buildCatalogPatch(row, draft, reason);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    update.mutate(
      { useCase: row.use_case, ...built.patch },
      {
        onSuccess: () => onDone(`Saved ${row.use_case}. New events pick it up within 5 minutes.`),
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  return (
    <tr className="border-b bg-muted/30 align-top">
      <td className="py-2 pr-2">
        <Input value={draft.display_order} onChange={set("display_order")} className="h-8 w-16 text-xs" inputMode="numeric" aria-label="Display order" />
      </td>
      <td className="px-2 py-2 font-mono text-xs">{row.use_case}</td>
      <td className="px-2 py-2">
        <Input value={draft.feature_group} onChange={set("feature_group")} list={listId} className="h-8 w-28 text-xs" aria-label="Feature group" />
        <datalist id={listId}>
          {FEATURE_GROUPS.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </td>
      <td className="space-y-1.5 px-2 py-2" colSpan={2}>
        <Input value={draft.label} onChange={set("label")} maxLength={128} className="h-8 text-xs" aria-label="Label" autoFocus />
        <Input
          value={draft.label_template}
          onChange={set("label_template")}
          maxLength={255}
          placeholder="Label template, e.g. {label} — {actor_name} (optional)"
          className="h-8 font-mono text-[11px]"
          aria-label="Label template"
        />
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Reason (required)" className="h-8 text-xs" aria-label="Reason" />
          <Button type="submit" size="sm" className="h-8" disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            <span className="ml-1">Save</span>
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel} disabled={update.isPending}>
            Cancel
          </Button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-2 py-2" colSpan={2} />
    </tr>
  );
}

function ToggleUseCaseDialog({ target, onClose, onDone }: { target: UseCaseCatalogRow | null; onClose: () => void; onDone: (text: string) => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && <ToggleUseCaseForm key={target.use_case} target={target} onCancel={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function ToggleUseCaseForm({ target, onCancel, onDone }: { target: UseCaseCatalogRow; onCancel: () => void; onDone: (text: string) => void }) {
  const update = useUpdateUseCase();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activating = !target.is_active;

  const save = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Say why (it lands in the change log)");
      return;
    }
    update.mutate(
      { useCase: target.use_case, is_active: activating, reason: reason.trim() },
      {
        onSuccess: () => onDone(`${activating ? "Activated" : "Deactivated"} ${target.use_case}.`),
        onError: (err) => setError(errorDetail(err, "Could not change it")),
      }
    );
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>
          {activating ? "Activate" : "Deactivate"} {target.label}?
        </DialogTitle>
        <DialogDescription>
          {activating
            ? "Callers that name this use case are recorded under it again."
            : "New events that name this use case are recorded as 'unknown' instead. Stored events, charges and the ledger do not change."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="use-case-toggle-reason">Reason</Label>
          <Input id="use-case-toggle-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} autoFocus />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant={activating ? "default" : "destructive"} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {activating ? "Activate" : "Deactivate"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------- role map

function RoleMapSection({
  query,
  notify,
}: {
  query: QueryLike<{ roles: RoleMapRow[]; unmapped: UnmappedRole[] }>;
  notify: Notify;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Role map</CardTitle>
        <CardDescription>
          Turns a raw auth role into the role class shown in usage history. When a user holds several roles, the lowest
          precedence wins (ADMIN 10, TEACHER 20, STAFF 30, PARENT 40, LEARNER 50). A role with no row here counts as
          STAFF ({UNMAPPED_PRECEDENCE}). Changes apply to new events within 5 minutes; stored events keep their class.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <SectionState query={query} what="role-map">
          {(data) => (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <MappedRoles roles={data.roles} notify={notify} />
              <UnmappedRoles roles={data.unmapped} notify={notify} />
            </div>
          )}
        </SectionState>
      </CardContent>
    </Card>
  );
}

function ClassSelect({ value, onChange, label }: { value: string; onChange: (v: MappableRoleClass) => void; label: string }) {
  const known = isMappableRoleClass(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as MappableRoleClass)} className={SELECT_CLASS} aria-label={label}>
      {!known && <option value={value}>{value} (unknown)</option>}
      {ROLE_CLASSES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function MappedRoles({ roles, notify }: { roles: RoleMapRow[]; notify: Notify }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Mapped roles ({roles.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium">Class</th>
              <th className="px-2 py-2 font-medium">Precedence</th>
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <MappedRoleRow key={r.role_name} row={r} notify={notify} />
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                  No mapped roles — has the metering migration run?
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MappedRoleRow({ row, notify }: { row: RoleMapRow; notify: Notify }) {
  const put = usePutRoleMap();
  const [cls, setCls] = useState<string>(row.role_class);
  const [prec, setPrec] = useState(String(row.precedence));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dirty = cls !== row.role_class || prec.trim() !== String(row.precedence);

  const reset = () => {
    setCls(row.role_class);
    setPrec(String(row.precedence));
    setReason("");
    setError(null);
  };

  const save = () => {
    setError(null);
    if (!isMappableRoleClass(cls)) {
      setError("Pick a class");
      return;
    }
    const p = parsePrecedence(prec);
    if ("error" in p) {
      setError(p.error);
      return;
    }
    if (!reason.trim()) {
      setError("Say why (it lands in the change log)");
      return;
    }
    put.mutate(
      { roleName: row.role_name, role_class: cls, precedence: p.value, reason: reason.trim() },
      {
        onSuccess: () => {
          setReason("");
          notify("success", `${row.role_name} now counts as ${cls} (${p.value}).`);
        },
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  return (
    <>
      <tr className={cn("border-b last:border-0", dirty && "bg-muted/30")}>
        <td className="py-2 pr-2 font-mono text-xs">{row.role_name}</td>
        <td className="px-2 py-2">
          <ClassSelect
            value={cls}
            label={`Class for ${row.role_name}`}
            onChange={(v) => {
              setCls(v);
              // Follow the class's default precedence unless someone typed a custom one.
              if (prec.trim() === String(row.precedence)) setPrec(String(DEFAULT_PRECEDENCE[v]));
            }}
          />
        </td>
        <td className="px-2 py-2">
          <Input value={prec} onChange={(e) => setPrec(e.target.value)} inputMode="numeric" className="h-8 w-16 text-xs" aria-label={`Precedence for ${row.role_name}`} />
        </td>
        <td className="py-2 pl-2 text-right text-xs text-muted-foreground">{dirty ? "edited" : ""}</td>
      </tr>
      {dirty && (
        <tr className="border-b bg-muted/30">
          <td colSpan={4} className="pb-2 pt-0">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Reason (required)" className="h-8 max-w-xs text-xs" aria-label={`Reason for ${row.role_name}`} />
              <Button type="submit" size="sm" className="h-8" disabled={put.isPending}>
                {put.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={reset} disabled={put.isPending}>
                <X className="mr-1 h-3.5 w-3.5" /> Undo
              </Button>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function UnmappedRoles({ roles, notify }: { roles: UnmappedRole[]; notify: Notify }) {
  const put = usePutRoleMap();
  const [reason, setReason] = useState("");
  const [picks, setPicks] = useState<Record<string, MappableRoleClass>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const map = (role: UnmappedRole) => {
    setError(null);
    if (!reason.trim()) {
      setError("Enter a reason first — it is used for each role you map");
      return;
    }
    const cls = picks[role.role_name] ?? UNMAPPED_CLASS;
    setPending(role.role_name);
    put.mutate(
      { roleName: role.role_name, role_class: cls, precedence: DEFAULT_PRECEDENCE[cls], reason: reason.trim() },
      {
        onSuccess: () => notify("success", `Mapped ${role.role_name} → ${cls}.`),
        onError: (err) => setError(`${role.role_name}: ${errorDetail(err, "could not map")}`),
        onSettled: () => setPending(null),
      }
    );
  };

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" /> Unmapped roles seen on events ({roles.length})
      </p>
      {roles.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Every role seen on events has a mapping.
        </p>
      ) : (
        <div className="space-y-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="Reason for mapping (required)" className="h-8 text-xs" aria-label="Reason for mapping unmapped roles" />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ul className="divide-y rounded-md border">
            {roles.map((r) => {
              const cls = picks[r.role_name] ?? UNMAPPED_CLASS;
              return (
                <li key={r.role_name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.role_name}>
                    {r.role_name}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{r.events.toLocaleString()} events</span>
                  <ClassSelect value={cls} label={`Class for ${r.role_name}`} onChange={(v) => setPicks((p) => ({ ...p, [r.role_name]: v }))} />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => map(r)} disabled={pending !== null}>
                    {pending === r.role_name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Map"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- History v2 rollout

function HistoryRolloutSection({ notify }: { notify: Notify }) {
  const setting = useHistoryV2Setting();
  const put = usePutHistoryV2Setting();
  const [instituteId, setInstituteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entry = setting.data ?? null;
  const current = parseInstituteList(entry?.value);

  /** Read the value fresh, apply the change, write it back — so an edit made elsewhere is not lost. */
  const change = async (apply: (ids: string[]) => string[], done: string) => {
    setError(null);
    setBusy(true);
    try {
      const fresh = await fetchHistoryV2Setting();
      if (!fresh) {
        setError("ai-service does not know this setting yet. Deploy the metering release first.");
        return;
      }
      const parsed = parseInstituteList(fresh.value);
      if (parsed.error) {
        setError(`${parsed.error}; fix it on AI Settings instead of overwriting it here.`);
        return;
      }
      const next = apply(parsed.ids);
      await put.mutateAsync(serializeInstituteList(fresh.type, next));
      notify("success", done);
      setInstituteId("");
    } catch (err) {
      setError(errorDetail(err, "Could not save the setting"));
    } finally {
      setBusy(false);
    }
  };

  const enable = () => {
    const problem = validateInstituteId(instituteId);
    if (problem) {
      setError(problem);
      return;
    }
    const id = instituteId.trim();
    if (current.ids.includes(id)) {
      setError(id === "*" ? "Already on for every institute" : "That institute already has History v2");
      return;
    }
    void change(
      (ids) => addInstitute(ids, id),
      id === "*" ? "History v2 is now on for every institute." : `History v2 enabled for ${id}.`
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle>History v2 rollout</CardTitle>
        </div>
        <CardDescription>
          Which institutes' admin dashboard shows the new credit history (labels, who used it, filters, export). The list
          is the platform setting <span className="font-mono">{HISTORY_V2_SETTING_KEY}</span> on{" "}
          <Link to="/ai-settings" className="text-primary underline-offset-4 hover:underline">
            AI Settings
          </Link>{" "}
          — a JSON array of institute ids, or <span className="font-mono">["*"]</span> for everyone. It only switches the
          screen; the usage data and endpoints work either way, and learners only ever see their own usage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {setting.isLoading && <Skeleton className="h-16 w-full" />}
        {setting.isError && <SectionError error={setting.error} what="ai-settings" onRetry={() => setting.refetch()} />}
        {setting.data === null && (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            ai-service does not list <span className="font-mono">{HISTORY_V2_SETTING_KEY}</span> yet. It appears once the
            metering release is deployed; until then History v2 is off everywhere.
          </p>
        )}
        {entry && (
          <>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                Current value{entry.source === "portal" ? ` · set${entry.updated_by ? ` by ${entry.updated_by}` : ""}` : " · default"}
              </p>
              <pre className="whitespace-pre-wrap break-all font-mono text-xs">{typeof entry.value === "string" ? entry.value || "[]" : JSON.stringify(entry.value)}</pre>
              {current.error && <p className="mt-1 text-xs text-destructive">{current.error}</p>}
            </div>
            {current.all && <ToneBadge tone="ok" label="On for every institute" />}
            {current.ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {current.ids.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px]">
                    {id}
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      aria-label={`Remove ${id}`}
                      disabled={busy || current.error !== null}
                      onClick={() => void change((ids) => removeInstitute(ids, id), `History v2 removed for ${id}.`)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                enable();
              }}
            >
              <Input
                value={instituteId}
                onChange={(e) => setInstituteId(e.target.value)}
                placeholder="Institute id (or * for all)"
                className="h-8 max-w-xs font-mono text-xs"
                aria-label="Institute id"
              />
              <Button type="submit" size="sm" className="h-8" disabled={busy || current.error !== null}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Enable History v2
              </Button>
            </form>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-[11px] text-muted-foreground">
              Saves through the same endpoint as AI Settings after re-reading the current value, so a change made there in
              the meantime is kept. Takes effect within about 30 seconds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
