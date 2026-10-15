import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Power,
  Route,
  ServerOff,
  ShieldAlert,
  Trash2,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { StatCard } from "@/components/shared/StatCard";
import { ToastStack, useToasts } from "@/components/shared/Toast";
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
  DEFAULT_BUDGET_USD,
  DEFAULT_SOFT_LIMIT_PCT,
  DEFAULT_WEIGHT,
  TEST_COOLDOWN_MS,
  effectiveStatus,
  formatPeriod,
  formatUsd,
  formatWhen,
  looksLikeAnthropicKey,
  spendState,
  usableKeyCount,
  validateKeyForm,
  type KeyFormValues,
  type StatusTone,
} from "@/lib/llm-keys";
import {
  useCreateLlmKey,
  useDeleteLlmKey,
  useLlmKeys,
  useTestLlmKey,
  useUpdateLlmKey,
} from "@/services/llm-keys-api";
import type { AnthropicRoute, LlmKeyView, TestLlmKeyResponse, UpdateLlmKeyRequest } from "@/types/llm-keys";

const ROUTE_EXAMPLE = '{"anthropic/claude-sonnet-4.5": {"router": "anthropic"}}';

const httpStatus = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

type Notify = (tone: "success" | "error" | "info", text: string) => void;

export default function LlmKeysPage() {
  const keys = useLlmKeys("anthropic");
  const { toasts, push, dismiss } = useToasts();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LlmKeyView | null>(null);
  const [toggling, setToggling] = useState<LlmKeyView | null>(null);

  const data = keys.data;
  const stats = useMemo(() => {
    const list = data?.keys ?? [];
    return {
      total: list.length,
      usable: usableKeyCount(list),
      spent: list.reduce((s, k) => s + k.month.metered_usd, 0),
      budget: list.filter((k) => k.status !== "disabled").reduce((s, k) => s + k.monthly_budget_usd, 0),
      calls: list.reduce((s, k) => s + k.month.calls, 0),
    };
  }, [data]);

  const canAdd = data?.encryption_ready === true;

  return (
    <div>
      <PageHeader
        title="Claude keys"
        description="Anthropic API keys that serve models routed to Claude direct. Calls rotate across usable keys by remaining monthly budget; a key stops at its soft limit, and anything a key cannot serve fails over to OpenRouter. Institutes are charged the same credits whichever path served the call."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => keys.refetch()}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => setAdding(true)} disabled={!canAdd} title={canAdd ? undefined : "ai-service cannot store keys yet"}>
              <Plus className="mr-1 h-4 w-4" /> Add key
            </Button>
          </>
        }
      />

      {keys.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {keys.isError && <LoadError error={keys.error} onRetry={() => keys.refetch()} />}

      {data && (
        <div className="space-y-6">
          {!data.encryption_ready && (
            <Card className="border-destructive/50">
              <CardContent className="flex items-start gap-3 py-4 text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">ai-service cannot store keys yet</p>
                  <p className="text-muted-foreground">
                    Its key-encryption secret (LLM_KEY_ENCRYPTION_KEY, a value only ai-service holds) is not configured,
                    so keys cannot be saved or decrypted. Adding a key is
                    turned off, and every model keeps going through OpenRouter exactly as today. Set the secret on
                    ai-service and redeploy, then refresh this page.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Usable keys"
              value={`${stats.usable} of ${stats.total}`}
              description={stats.total === 0 ? "No key added yet" : "Active, under soft limit, not cooling down"}
              icon={KeyRound}
            />
            <StatCard
              title={`Spend · ${formatPeriod(data.period_month) || "this month"}`}
              value={formatUsd(stats.spent)}
              description={`of ${formatUsd(stats.budget)} budget on enabled keys · ${stats.calls.toLocaleString()} calls`}
              icon={Wallet}
            />
            <StatCard
              title="Models routed to Claude direct"
              value={data.anthropic_routes.length}
              description={data.anthropic_routes.length === 0 ? "None — all Claude traffic uses OpenRouter" : "From llm.model_routes"}
              icon={Route}
            />
          </div>

          <SectionErrorBoundary title="Keys">
            <Card>
              <CardHeader>
                <CardTitle>Keys</CardTitle>
                <CardDescription>
                  Month-to-date spend is metered by ai-service from each response's token usage (UTC month).
                  The marker on each bar is the soft limit where routing stops using that key; Anthropic's own workspace
                  spend limit remains the hard stop. Weight biases rotation between keys with similar headroom.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {data.keys.length === 0 ? (
                  <EmptyFlow canAdd={canAdd} onAdd={() => setAdding(true)} />
                ) : (
                  <KeysTable keys={data.keys} onEdit={setEditing} onToggle={setToggling} notify={push} />
                )}
              </CardContent>
            </Card>
          </SectionErrorBoundary>

          <SectionErrorBoundary title="Routed models">
            <RoutesPanel routes={data.anthropic_routes} usable={stats.usable} total={stats.total} />
          </SectionErrorBoundary>
        </div>
      )}

      <KeyFormDialog
        mode="create"
        open={adding}
        onOpenChange={setAdding}
        onDone={(text) => push("success", text)}
      />
      <KeyFormDialog
        mode="edit"
        target={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onDone={(text) => push("success", text)}
      />
      <ToggleStatusDialog
        target={toggling}
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        onDone={(text) => push("success", text)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isNotFound(error)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ServerOff className="h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-lg font-medium">Backend not deployed yet</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            ai-service doesn't serve <span className="font-mono">/super-admin/v1/llm/keys</span> yet (404). This page
            will work once that release is live. Until then every Claude model is served through OpenRouter as today.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
            Check again
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (httpStatus(error) === 403) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-lg font-medium">Super-admin access required</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            ai-service refused this account (403). Provider keys are visible to platform super admins only.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6 text-sm">
        <span className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" /> Could not load keys: {errorDetail(error, "request failed")}
        </span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyFlow({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Add a key",
      body: "One per Anthropic org or workspace, with that workspace's monthly budget (default $200) and a soft limit (default 95%).",
    },
    {
      title: "Test it",
      body: "Sends one 8-token message with the cheapest Claude model to prove the key works before any traffic uses it.",
    },
    {
      title: "Route a model",
      body: (
        <>
          Add <span className="font-mono text-[11px]">{'{"<model_id>": {"router": "anthropic"}}'}</span> to the route map on{" "}
          <Link to="/ai-settings" className="text-primary underline-offset-4 hover:underline">
            AI Settings
          </Link>
          . Until then no call uses the keys.
        </>
      ),
    },
  ];
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <KeyRound className="h-10 w-10 text-muted-foreground/50" />
      <div className="space-y-1">
        <h3 className="text-lg font-medium">No Claude keys yet</h3>
        <p className="max-w-xl text-sm text-muted-foreground">
          Without a key every Claude model goes through OpenRouter, as it does today. Three steps move a model to Claude
          direct:
        </p>
      </div>
      <ol className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-md border p-3">
            <p className="text-sm font-medium">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                {i + 1}
              </span>
              {s.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <Button size="sm" onClick={onAdd} disabled={!canAdd}>
        <Plus className="mr-1 h-4 w-4" /> Add the first key
      </Button>
    </div>
  );
}

const TONE_CLASSES: Record<StatusTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-destructive/40 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  off: "text-muted-foreground",
};

function StatusPill({ k }: { k: LlmKeyView }) {
  const s = effectiveStatus(k);
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap px-2 py-0.5 text-[11px] font-medium", TONE_CLASSES[s.tone])} title={s.detail ?? undefined}>
      {s.label}
    </Badge>
  );
}

function SpendBar({ k }: { k: LlmKeyView }) {
  const s = spendState(k);
  return (
    <div className="min-w-[160px] space-y-1">
      <div
        className="relative h-2 rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(s.barPct)}
        aria-label={`${Math.round(s.pct)}% of monthly budget used; soft limit ${s.softPct}%`}
      >
        <div
          className={cn(
            "h-2 rounded-full",
            s.level === "over" ? "bg-red-500" : s.level === "near" ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${s.barPct}%` }}
        />
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60"
          style={{ left: `calc(${s.softPct}% - 1px)` }}
          title={`Soft limit ${s.softPct}%`}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{formatUsd(s.spent)}</span> of {formatUsd(s.budget)} ·{" "}
        {Math.round(s.pct)}% · stops at {s.softPct}%
      </p>
    </div>
  );
}

type TestState = { at: number; result?: TestLlmKeyResponse; error?: string };

function KeysTable({
  keys,
  onEdit,
  onToggle,
  notify,
}: {
  keys: LlmKeyView[];
  onEdit: (k: LlmKeyView) => void;
  onToggle: (k: LlmKeyView) => void;
  notify: Notify;
}) {
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const sorted = useMemo(
    () => keys.slice().sort((a, b) => Number(a.status === "disabled") - Number(b.status === "disabled") || a.label.localeCompare(b.label)),
    [keys]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Key</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">This month</th>
            <th className="px-2 py-2 text-right font-medium">Calls</th>
            <th className="px-2 py-2 font-medium">Last used</th>
            <th className="px-2 py-2 font-medium">Last error</th>
            <th className="py-2 pl-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((k) => (
            <KeyRow
              key={k.id}
              k={k}
              test={tests[k.id]}
              onTested={(t) => setTests((prev) => ({ ...prev, [k.id]: t }))}
              deleting={deleting === k.id}
              onDeleteStart={() => setDeleting(k.id)}
              onDeleteCancel={() => setDeleting(null)}
              onEdit={() => onEdit(k)}
              onToggle={() => onToggle(k)}
              notify={notify}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyRow({
  k,
  test,
  onTested,
  deleting,
  onDeleteStart,
  onDeleteCancel,
  onEdit,
  onToggle,
  notify,
}: {
  k: LlmKeyView;
  test: TestState | undefined;
  onTested: (t: TestState) => void;
  deleting: boolean;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  onEdit: () => void;
  onToggle: () => void;
  notify: Notify;
}) {
  const tester = useTestLlmKey();
  const remover = useDeleteLlmKey();
  const [reason, setReason] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The backend allows one test per key per 10 s; the button waits the same.
  const [cooling, setCooling] = useState(false);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (coolTimer.current) clearTimeout(coolTimer.current);
  }, []);

  const runTest = () => {
    setCooling(true);
    if (coolTimer.current) clearTimeout(coolTimer.current);
    coolTimer.current = setTimeout(() => setCooling(false), TEST_COOLDOWN_MS);
    tester.mutate(k.id, {
      onSuccess: (result) => onTested({ at: Date.now(), result }),
      onError: (err) => onTested({ at: Date.now(), error: errorDetail(err, "Test request failed") }),
    });
  };

  const confirmDelete = () => {
    setDeleteError(null);
    if (!reason.trim()) {
      setDeleteError("Say why");
      return;
    }
    remover.mutate(
      { id: k.id, reason: reason.trim() },
      {
        onSuccess: () => {
          onDeleteCancel();
          notify("success", `Deleted key ${k.label} (${k.key_hint}). Calls it would have served use the other keys or OpenRouter.`);
        },
        onError: (err) => setDeleteError(errorDetail(err, "Could not delete")),
      }
    );
  };

  const enabled = k.status !== "disabled";
  const errorRate = k.month.calls > 0 ? (k.month.errors / k.month.calls) * 100 : 0;

  return (
    <>
      <tr className={cn("border-b align-top", !enabled && "opacity-70")}>
        <td className="py-3 pr-3">
          <p className="font-medium">{k.label || "Untitled key"}</p>
          <p className="text-xs text-muted-foreground">{k.org_label || "No org label"}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{k.key_hint || "····"}</span>
            <span>weight {k.weight}</span>
          </p>
        </td>
        <td className="px-2 py-3">
          <StatusPill k={k} />
          {effectiveStatus(k).detail && k.status === "active" && (
            <p className="mt-1 max-w-[180px] text-[11px] text-muted-foreground">{effectiveStatus(k).detail}</p>
          )}
        </td>
        <td className="px-2 py-3">
          <SpendBar k={k} />
        </td>
        <td className="px-2 py-3 text-right tabular-nums">
          <p>{k.month.calls.toLocaleString()}</p>
          {k.month.errors > 0 && (
            <p className={cn("text-[11px]", errorRate >= 5 ? "text-destructive" : "text-muted-foreground")}>
              {k.month.errors.toLocaleString()} errors
            </p>
          )}
        </td>
        <td className="px-2 py-3 text-xs text-muted-foreground">{formatWhen(k.last_used_at)}</td>
        <td className="max-w-[220px] px-2 py-3 text-xs">
          {k.last_error ? (
            <>
              <p className="line-clamp-2 break-words text-destructive" title={k.last_error}>
                {k.last_error}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatWhen(k.last_error_at)}</p>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pl-2">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={runTest}
              disabled={tester.isPending || cooling}
              title={cooling ? "One test per key every 10 seconds" : "Send one tiny message with this key"}
            >
              {tester.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1 h-3.5 w-3.5" />}
              Test
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${k.label}`} title="Edit label, budget, weight">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggle}
              aria-label={enabled ? `Disable ${k.label}` : `Enable ${k.label}`}
              title={enabled ? "Disable" : "Enable"}
            >
              <Power className={cn("h-3.5 w-3.5", enabled ? "text-emerald-600" : "text-muted-foreground")} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReason("");
                setDeleteError(null);
                onDeleteStart();
              }}
              aria-label={`Delete ${k.label}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
      {test && (
        <tr className="border-b bg-muted/30">
          <td colSpan={7} className="px-2 py-2 text-xs">
            <TestResult test={test} />
          </td>
        </tr>
      )}
      {deleting && (
        <tr className="border-b bg-red-50/60 dark:bg-red-950/20">
          <td colSpan={7} className="px-2 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm">
                Delete <span className="font-medium">{k.label}</span> ({k.key_hint})? Its month's spend history goes too.
              </p>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                aria-label="Reason for deleting"
                className="h-9 sm:w-64"
                maxLength={2000}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={confirmDelete} disabled={remover.isPending}>
                  {remover.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Delete
                </Button>
                <Button size="sm" variant="outline" onClick={onDeleteCancel} disabled={remover.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
            {deleteError && <p className="mt-1 text-xs text-destructive">{deleteError}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function TestResult({ test }: { test: TestState }) {
  const when = new Date(test.at).toLocaleTimeString();
  if (test.error) {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <XCircle className="h-3.5 w-3.5" /> Test failed at {when}: {test.error}
      </span>
    );
  }
  const r = test.result;
  if (!r) return null;
  return r.ok ? (
    <span className="flex flex-wrap items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> Key works · {r.latency_ms !== null ? `${Math.round(r.latency_ms)} ms` : "latency unknown"}
      {r.model && <span className="font-mono text-muted-foreground">· {r.model}</span>}
      <span className="text-muted-foreground">· {when}</span>
    </span>
  ) : (
    <span className="flex flex-wrap items-center gap-1.5 text-destructive">
      <XCircle className="h-3.5 w-3.5" /> Key failed{r.latency_ms !== null ? ` after ${Math.round(r.latency_ms)} ms` : ""}: {r.error || "no detail"}
      {r.model && <span className="font-mono text-muted-foreground">· {r.model}</span>}
      <span className="text-muted-foreground">· {when}</span>
    </span>
  );
}

function RoutesPanel({ routes, usable, total }: { routes: AnthropicRoute[]; usable: number; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Models routed to Claude direct</CardTitle>
        <CardDescription>
          Read-only. These come from the <span className="font-mono">llm.model_routes</span> map. To route a model, add{" "}
          <span className="font-mono text-[11px]">{'{"<model_id>": {"router": "anthropic"}}'}</span> to the route map on{" "}
          <Link to="/ai-settings" className="text-primary underline-offset-4 hover:underline">
            AI Settings
          </Link>
          , for example <span className="font-mono text-[11px]">{ROUTE_EXAMPLE}</span>. The Anthropic model id is derived
          from the registry id (dots become dashes) unless the entry sets <span className="font-mono">"model"</span>.
          Removing the entry sends the model back to OpenRouter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {routes.length > 0 && usable === 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {total === 0
              ? "No key is configured, so these models are served by OpenRouter until you add and test one."
              : "No key is usable right now (disabled, failed, cooling down or at its soft limit), so these models fail over to OpenRouter."}
          </p>
        )}
        {routes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No model is routed to Claude direct — every Claude model uses OpenRouter.
            {total > 0 && " The keys above stay idle until a route is added."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {routes.map((r) => (
              <li key={r.model_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-mono text-xs">{r.model_id}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowRight className="h-3.5 w-3.5" /> Anthropic API as <span className="font-mono text-foreground">{r.wire_model}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const blankForm = (k?: LlmKeyView | null): KeyFormValues => ({
  label: k?.label ?? "",
  org_label: k?.org_label ?? "",
  api_key: "",
  monthly_budget_usd: String(k?.monthly_budget_usd ?? DEFAULT_BUDGET_USD),
  soft_limit_pct: String(k?.soft_limit_pct ?? DEFAULT_SOFT_LIMIT_PCT),
  weight: String(k?.weight ?? DEFAULT_WEIGHT),
  reason: "",
});

function KeyFormDialog({
  mode,
  target,
  open,
  onOpenChange,
  onDone,
}: {
  mode: "create" | "edit";
  target?: LlmKeyView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so a closed dialog holds no typed secret. */}
      {open && (mode === "create" || target) && (
        <KeyForm
          key={target?.id ?? "new"}
          mode={mode}
          target={target ?? null}
          onCancel={() => onOpenChange(false)}
          onDone={(text) => {
            onOpenChange(false);
            onDone(text);
          }}
        />
      )}
    </Dialog>
  );
}

function KeyForm({
  mode,
  target,
  onCancel,
  onDone,
}: {
  mode: "create" | "edit";
  target: LlmKeyView | null;
  onCancel: () => void;
  onDone: (text: string) => void;
}) {
  const create = useCreateLlmKey();
  const update = useUpdateLlmKey();
  const [v, setV] = useState<KeyFormValues>(() => blankForm(target));
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof KeyFormValues) => (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [field]: e.target.value }));
  const pending = create.isPending || update.isPending;
  const isCreate = mode === "create";
  const keyWarning = isCreate && v.api_key.trim() !== "" && !looksLikeAnthropicKey(v.api_key);

  const save = () => {
    setError(null);
    const problem = validateKeyForm(v, isCreate);
    if (problem) {
      setError(problem);
      return;
    }
    const budget = Number(v.monthly_budget_usd);
    const soft = Number(v.soft_limit_pct);
    const weight = Number(v.weight);
    if (isCreate) {
      create.mutate(
        {
          provider: "anthropic",
          label: v.label.trim(),
          org_label: v.org_label.trim() || null,
          api_key: v.api_key.trim(),
          monthly_budget_usd: budget,
          soft_limit_pct: soft,
          weight,
          reason: v.reason.trim(),
        },
        {
          onSuccess: (saved) => {
            // Drop the secret from the mutation cache and the form.
            create.reset();
            setV((prev) => ({ ...prev, api_key: "" }));
            onDone(`Added ${saved.label || v.label.trim()} (${saved.key_hint}). Test it, then route a model on AI Settings.`);
          },
          onError: (err) => {
            setError(errorDetail(err, "Could not add the key"));
            create.reset();
          },
        }
      );
      return;
    }
    if (!target) return;
    const body: UpdateLlmKeyRequest = { reason: v.reason.trim() };
    if (v.label.trim() !== target.label) body.label = v.label.trim();
    if ((v.org_label.trim() || null) !== target.org_label) body.org_label = v.org_label.trim() || null;
    if (budget !== target.monthly_budget_usd) body.monthly_budget_usd = budget;
    if (soft !== target.soft_limit_pct) body.soft_limit_pct = soft;
    if (weight !== target.weight) body.weight = weight;
    if (Object.keys(body).length === 1) {
      setError("Nothing changed");
      return;
    }
    update.mutate(
      { id: target.id, ...body },
      {
        onSuccess: (saved) => onDone(`Saved ${saved.label || target.label}. Applies to the next call.`),
        onError: (err) => setError(errorDetail(err, "Could not save")),
      }
    );
  };

  const field = (id: string, label: string, input: ReactNode, hint?: ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isCreate ? "Add a Claude key" : `Edit ${target?.label ?? "key"}`}</DialogTitle>
        <DialogDescription>
          {isCreate
            ? "The key is encrypted by ai-service and never shown again — only its last 4 characters."
            : `Key ${target?.key_hint ?? ""}. The secret itself cannot be changed; add a new key and delete this one to rotate it.`}
        </DialogDescription>
      </DialogHeader>

      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("llm-key-label", "Label", <Input id="llm-key-label" value={v.label} onChange={set("label")} maxLength={120} placeholder="e.g. Org A · prod" />)}
          {field(
            "llm-key-org",
            "Org label (optional)",
            <Input id="llm-key-org" value={v.org_label} onChange={set("org_label")} maxLength={120} placeholder="Anthropic org / workspace" />,
            "Rate limits are per Anthropic org, so name it."
          )}
        </div>
        {isCreate &&
          field(
            "llm-key-secret",
            "API key",
            <Input
              id="llm-key-secret"
              type="password"
              value={v.api_key}
              onChange={set("api_key")}
              autoComplete="new-password"
              spellCheck={false}
              placeholder="sk-ant-…"
              className="font-mono"
            />,
            keyWarning ? (
              <span className="text-amber-700">Anthropic keys start with sk-ant-. Check you pasted the right value.</span>
            ) : (
              "From console.anthropic.com → API keys, in the workspace whose spend limit you want to use."
            )
          )}
        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            "llm-key-budget",
            "Monthly budget (USD)",
            <Input id="llm-key-budget" type="number" min={1} step="0.01" value={v.monthly_budget_usd} onChange={set("monthly_budget_usd")} />,
            "Match the workspace spend limit."
          )}
          {field(
            "llm-key-soft",
            "Soft limit %",
            <Input id="llm-key-soft" type="number" min={1} max={100} step={1} value={v.soft_limit_pct} onChange={set("soft_limit_pct")} />,
            "Routing stops here."
          )}
          {field(
            "llm-key-weight",
            "Weight",
            <Input id="llm-key-weight" type="number" min={1} max={1000} step={1} value={v.weight} onChange={set("weight")} />,
            "Higher = picked more often."
          )}
        </div>
        {field(
          "llm-key-reason",
          "Reason",
          <Input id="llm-key-reason" value={v.reason} onChange={set("reason")} maxLength={2000} placeholder="Why (lands in the change log)" />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isCreate ? "Add key" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ToggleStatusDialog({
  target,
  open,
  onOpenChange,
  onDone,
}: {
  target: LlmKeyView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && target && (
        <ToggleForm
          key={target.id}
          target={target}
          onCancel={() => onOpenChange(false)}
          onDone={(text) => {
            onOpenChange(false);
            onDone(text);
          }}
        />
      )}
    </Dialog>
  );
}

function ToggleForm({ target, onCancel, onDone }: { target: LlmKeyView; onCancel: () => void; onDone: (text: string) => void }) {
  const update = useUpdateLlmKey();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enabling = target.status !== "active";
  const next = enabling ? "active" : "disabled";

  const save = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Say why (it lands in the change log)");
      return;
    }
    update.mutate(
      { id: target.id, status: next, reason: reason.trim() },
      {
        onSuccess: () =>
          onDone(enabling ? `Enabled ${target.label}. Cooldowns and stops were cleared.` : `Disabled ${target.label}. Its calls move to other keys or OpenRouter.`),
        onError: (err) => setError(errorDetail(err, "Could not change the status")),
      }
    );
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{enabling ? "Enable" : "Disable"} {target.label}?</DialogTitle>
        <DialogDescription>
          {enabling
            ? target.status === "auth_failed"
              ? "Anthropic rejected this key earlier. Enable it only if you fixed it on the Anthropic side, then run Test."
              : "The key joins rotation again; any cooldown or budget stop is cleared."
            : "No call will use this key. Routed models keep working through the other keys or OpenRouter."}
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
          <Label htmlFor="llm-key-toggle-reason">Reason</Label>
          <Input
            id="llm-key-toggle-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant={enabling ? "default" : "destructive"} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {enabling ? "Enable" : "Disable"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
