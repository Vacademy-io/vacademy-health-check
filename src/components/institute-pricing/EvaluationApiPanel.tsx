import { useState } from "react";
import { AlertCircle, Copy, KeyRound, Loader2, Plus, ShieldOff, Webhook } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/shared/Toggle";
import {
  useInstituteApiAccess,
  useIssueApiKey,
  useRevokeAllApiKeys,
  useRevokeApiKey,
  useUpdateApiAccess,
} from "@/services/api-access-api";
import {
  DEFAULT_DAILY_COPY_QUOTA,
  DEFAULT_SCOPES,
  PHASE1_SCOPES,
  errorDetail,
  formatCount,
  parseOptionalInt,
  presetQuota,
} from "@/lib/eval-api-pricing";
import type { ApiAccessProduct, ApiKeySummary, ApiSegment, InstituteApiAccess, IssuedApiKey } from "@/types/eval-api";

const PRODUCT = "evaluation";
const NO_SEGMENT = "__none__";

interface AccessForm {
  enabled: boolean;
  segment: ApiSegment | null;
  rate_tier: string;
  daily_copy_quota: string;
  daily_identify_pages: string;
  daily_rubric_generations: string;
  copy_lane_cap: string;
  typed_lane_cap: string;
  credit_limit: string;
  fire_workflow_events: boolean;
  notes: string;
  reason: string;
}

function formFrom(p: ApiAccessProduct | undefined): AccessForm {
  return {
    enabled: p?.enabled ?? false,
    segment: p?.segment ?? null,
    rate_tier: p?.rate_tier ?? "standard",
    daily_copy_quota: String(p?.daily_copy_quota ?? DEFAULT_DAILY_COPY_QUOTA),
    daily_identify_pages: String(p?.daily_identify_pages ?? 5000),
    daily_rubric_generations: String(p?.daily_rubric_generations ?? 200),
    copy_lane_cap: p?.copy_lane_cap != null ? String(p.copy_lane_cap) : "",
    typed_lane_cap: p?.typed_lane_cap != null ? String(p.typed_lane_cap) : "",
    credit_limit: String(p?.credit_limit ?? 0),
    fire_workflow_events: p?.fire_workflow_events ?? false,
    notes: p?.notes ?? "",
    reason: "",
  };
}

function when(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function EvaluationApiPanel({ instituteId, onNotify }: { instituteId: string; onNotify: (text: string) => void }) {
  const { data, isLoading, isError, error } = useInstituteApiAccess(instituteId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evaluation API</CardTitle>
        <CardDescription>
          Partner access to the AI Evaluation API (api.evalezy.com). Keys are institute-wide; API exams also show on
          the institute's dashboard tagged Source: API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        {isLoading && <Skeleton className="h-48 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Could not load API access: {errorDetail(error)}
          </p>
        )}
        {data && (
          <>
            <AccessSettings
              key={JSON.stringify(data.products.find((p) => p.product === PRODUCT) ?? null)}
              instituteId={instituteId}
              product={data.products.find((p) => p.product === PRODUCT)}
              onNotify={onNotify}
            />
            <UsageRow data={data} />
            <KeysSection
              instituteId={instituteId}
              keys={data.keys}
              enabled={data.products.find((p) => p.product === PRODUCT)?.enabled ?? false}
              onNotify={onNotify}
            />
            <WebhookHealth data={data} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  step = "1",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="number" min={0} step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AccessSettings({
  instituteId,
  product,
  onNotify,
}: {
  instituteId: string;
  product: ApiAccessProduct | undefined;
  onNotify: (text: string) => void;
}) {
  const update = useUpdateApiAccess(instituteId);
  const [form, setForm] = useState<AccessForm>(() => formFrom(product));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<AccessForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    setError(null);
    const reason = form.reason.trim();
    if (!reason) {
      setError("A reason is required");
      return;
    }
    const ints = {
      daily_copy_quota: parseOptionalInt(form.daily_copy_quota),
      daily_identify_pages: parseOptionalInt(form.daily_identify_pages),
      daily_rubric_generations: parseOptionalInt(form.daily_rubric_generations),
      copy_lane_cap: parseOptionalInt(form.copy_lane_cap),
      typed_lane_cap: parseOptionalInt(form.typed_lane_cap),
    };
    for (const [k, v] of Object.entries(ints)) {
      if (Number.isNaN(v)) {
        setError(`${k.replace(/_/g, " ")} must be a whole number of 0 or more`);
        return;
      }
    }
    if (ints.daily_copy_quota === null || ints.daily_identify_pages === null || ints.daily_rubric_generations === null) {
      setError("Daily quotas are required");
      return;
    }
    const creditLimit = Number(form.credit_limit || 0);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      setError("Credit limit must be 0 or more");
      return;
    }
    update.mutate(
      {
        product: PRODUCT,
        body: {
          enabled: form.enabled,
          segment: form.segment,
          rate_tier: form.rate_tier,
          daily_copy_quota: ints.daily_copy_quota,
          daily_identify_pages: ints.daily_identify_pages,
          daily_rubric_generations: ints.daily_rubric_generations,
          copy_lane_cap: ints.copy_lane_cap,
          typed_lane_cap: ints.typed_lane_cap,
          credit_limit: creditLimit,
          fire_workflow_events: form.fire_workflow_events,
          notes: form.notes.trim() || null,
          reason,
        },
      },
      {
        onSuccess: () => {
          set({ reason: "" });
          onNotify(form.enabled ? "Evaluation API settings saved" : "Evaluation API settings saved (disabled)");
        },
        onError: (err) => setError(errorDetail(err, "Failed to save")),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">API enabled</p>
          <p className="text-xs text-muted-foreground">
            Off: the institute's API keys card stays disabled and every key is refused. Saved with the button below.
          </p>
        </div>
        <Toggle checked={form.enabled} onChange={(next) => set({ enabled: next })} label="API enabled" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Segment preset</Label>
          <Select
            value={form.segment ?? NO_SEGMENT}
            onValueChange={(v) => {
              const segment = v === NO_SEGMENT ? null : (v as ApiSegment);
              // The preset fills the daily copy quota; it can still be edited after.
              set({ segment, daily_copy_quota: String(presetQuota(segment)) });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SEGMENT}>None (2,000 copies/day)</SelectItem>
              <SelectItem value="school">School (3,000/day)</SelectItem>
              <SelectItem value="university">University (6,000/day)</SelectItem>
              <SelectItem value="upsc">UPSC (10,000/day)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Rate tier</Label>
          <Select value={form.rate_tier} onValueChange={(v) => set({ rate_tier: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="high">High (2.5× reads, 4× writes)</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumberField
          id="api-credit-limit"
          label="Credit limit (overdraft)"
          value={form.credit_limit}
          step="0.01"
          onChange={(v) => set({ credit_limit: v })}
          hint="Postpaid contracts only; 0 = prepaid"
        />
        <div className="flex items-end justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-xs font-medium">Workflow events</p>
            <p className="text-[11px] text-muted-foreground">Fire the institute's workflows on API results</p>
          </div>
          <Toggle
            checked={form.fire_workflow_events}
            onChange={(next) => set({ fire_workflow_events: next })}
            label="Workflow events"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField id="api-q-copies" label="Copies / day" value={form.daily_copy_quota} onChange={(v) => set({ daily_copy_quota: v })} />
        <NumberField
          id="api-q-identify"
          label="Identify pages / day"
          value={form.daily_identify_pages}
          onChange={(v) => set({ daily_identify_pages: v })}
        />
        <NumberField
          id="api-q-rubrics"
          label="Rubric generations / day"
          value={form.daily_rubric_generations}
          onChange={(v) => set({ daily_rubric_generations: v })}
        />
        <NumberField
          id="api-lane-copy"
          label="Copy lane cap"
          value={form.copy_lane_cap}
          placeholder="platform default"
          onChange={(v) => set({ copy_lane_cap: v })}
        />
        <NumberField
          id="api-lane-typed"
          label="Typed lane cap"
          value={form.typed_lane_cap}
          placeholder="platform default"
          onChange={(v) => set({ typed_lane_cap: v })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="api-notes" className="text-xs">
            Notes
          </Label>
          <Textarea id="api-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="api-reason" className="text-xs">
            Reason (required)
          </Label>
          <Input
            id="api-reason"
            value={form.reason}
            placeholder="Signed pilot, ticket #123"
            onChange={(e) => set({ reason: e.target.value })}
          />
          <div className="flex items-center justify-end gap-3 pt-1">
            {error && <span className="text-xs text-destructive">{error}</span>}
            <Button size="sm" onClick={save} disabled={update.isPending || !form.reason.trim()}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save API settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageRow({ data }: { data: InstituteApiAccess }) {
  const u = data.usage_30d;
  const items: Array<[string, string]> = [
    ["Copies (30d)", formatCount(u?.copies)],
    ["Typed (30d)", formatCount(u?.typed)],
    ["Identify pages (30d)", formatCount(u?.identify_pages)],
    ["Credits (30d)", formatCount(u?.credits, 2)],
  ];
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {data.last_error && (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" /> Last API error: <span className="font-mono">{data.last_error}</span>
        </p>
      )}
    </div>
  );
}

function KeysSection({
  instituteId,
  keys,
  enabled,
  onNotify,
}: {
  instituteId: string;
  keys: ApiKeySummary[];
  enabled: boolean;
  onNotify: (text: string) => void;
}) {
  const revoke = useRevokeApiKey(instituteId);
  const [issueOpen, setIssueOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [confirmKey, setConfirmKey] = useState<ApiKeySummary | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const activeCount = keys.filter((k) => k.status === "ACTIVE").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">API keys</p>
          <p className="text-xs text-muted-foreground">
            {activeCount} active of 50 allowed. A key is shown once, when it is issued.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIssueOpen(true)} disabled={!enabled} title={enabled ? undefined : "Enable the API first"}>
            <Plus className="mr-1 h-4 w-4" /> Issue key
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setRevokeAllOpen(true)} disabled={activeCount === 0}>
            <ShieldOff className="mr-1 h-4 w-4" /> Revoke all
          </Button>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No keys yet.
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {s.replace("evaluation:", "")}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {when(k.created_at)}
                  {k.created_by && <div className="text-muted-foreground">by {k.created_by}</div>}
                </TableCell>
                <TableCell className="text-xs">{when(k.last_used_at)}</TableCell>
                <TableCell>
                  <Badge variant={k.status === "ACTIVE" ? "success" : "secondary"}>{k.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {k.status === "ACTIVE" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setRevokeError(null);
                        setConfirmKey(k);
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {issueOpen && (
        <IssueKeyDialog
          instituteId={instituteId}
          onClose={() => setIssueOpen(false)}
          onIssued={(name) => onNotify(`Key "${name}" issued`)}
        />
      )}
      {revokeAllOpen && (
        <RevokeAllDialog
          instituteId={instituteId}
          activeCount={activeCount}
          onClose={() => setRevokeAllOpen(false)}
          onDone={() => {
            setRevokeAllOpen(false);
            onNotify("Every key of this institute is revoked");
          }}
        />
      )}
      <Dialog open={!!confirmKey} onOpenChange={(open) => !open && setConfirmKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke key</DialogTitle>
            <DialogDescription>
              Revoke "{confirmKey?.name}" ({confirmKey?.prefix}…)? Calls with it fail with 401 at once. This cannot be
              undone; issue a new key instead.
            </DialogDescription>
          </DialogHeader>
          {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKey(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() =>
                confirmKey &&
                revoke.mutate(confirmKey.id, {
                  onSuccess: () => {
                    onNotify(`Key "${confirmKey.name}" revoked`);
                    setConfirmKey(null);
                  },
                  onError: (err) => setRevokeError(errorDetail(err, "Failed to revoke")),
                })
              }
            >
              {revoke.isPending ? "Revoking..." : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IssueKeyDialog({
  instituteId,
  onClose,
  onIssued,
}: {
  instituteId: string;
  onClose: () => void;
  onIssued: (name: string) => void;
}) {
  const issue = useIssueApiKey(instituteId);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [expiresOn, setExpiresOn] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleScope = (scope: string) =>
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));

  const submit = () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Name is required");
    if (scopes.length === 0) return setError("Pick at least one scope");
    const cap = parseOptionalInt(dailyCap);
    if (Number.isNaN(cap) || (cap !== null && cap < 1)) return setError("Daily copy cap must be a whole number of at least 1");
    issue.mutate(
      {
        name: trimmed,
        scopes,
        // End of the chosen day, in the browser's zone.
        expires_at: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null,
        daily_copy_cap: cap,
      },
      {
        onSuccess: (key) => {
          setIssued(key);
          onIssued(key.name);
        },
        onError: (err) => setError(errorDetail(err, "Failed to issue key")),
      }
    );
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    // While the one-time key is on screen only "I have stored it" closes the dialog:
    // no overlay click, Escape or corner X (the key cannot be shown again).
    <Dialog open onOpenChange={(open) => !open && !issued && onClose()}>
      <DialogContent
        className={issued ? "max-w-lg [&>button:last-child]:hidden" : "max-w-lg"}
        onInteractOutside={(e) => issued && e.preventDefault()}
        onEscapeKeyDown={(e) => issued && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{issued ? "Store this key now" : "Issue an API key"}</DialogTitle>
          <DialogDescription>
            {issued
              ? "This is the only time the key is shown. Vacademy stores only its hash and cannot show it again."
              : "For vendor-led onboarding. The institute's admins see the key in their list (prefix only)."}
          </DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="flex-1 break-all text-xs">{issued.key}</code>
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy className="mr-1 h-3 w-3" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Send it to the partner over a private channel. Header: <span className="font-mono">X-API-Key</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" value={name} maxLength={120} placeholder="OSM vendor — production" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="space-y-1">
                {PHASE1_SCOPES.map(({ scope, hint }) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span className="font-mono text-xs">{scope}</span>
                    <span className="text-xs text-muted-foreground">— {hint}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="key-expiry">Expires (optional)</Label>
                <Input id="key-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-cap">Daily copy cap (optional)</Label>
                <Input
                  id="key-cap"
                  type="number"
                  min={1}
                  step="1"
                  value={dailyCap}
                  placeholder="institute quota only"
                  onChange={(e) => setDailyCap(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          {issued ? (
            <Button onClick={onClose}>I have stored it</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={issue.isPending}>
                {issue.isPending ? "Issuing..." : "Issue key"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeAllDialog({
  instituteId,
  activeCount,
  onClose,
  onDone,
}: {
  instituteId: string;
  activeCount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const revokeAll = useRevokeAllApiKeys(instituteId);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim() !== "" && confirmText.trim().toUpperCase() === "REVOKE";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke every key</DialogTitle>
          <DialogDescription>
            Kill switch: all {activeCount} active key{activeCount === 1 ? "" : "s"} stop working at once. Copies already
            accepted keep grading. Type REVOKE to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="revoke-all-reason">Reason (required)</Label>
            <Input id="revoke-all-reason" value={reason} placeholder="Key leaked in a public repo" onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revoke-all-confirm">Type REVOKE</Label>
            <Input id="revoke-all-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || revokeAll.isPending}
            onClick={() =>
              revokeAll.mutate(reason.trim(), {
                onSuccess: onDone,
                onError: (err) => setError(errorDetail(err, "Failed to revoke keys")),
              })
            }
          >
            {revokeAll.isPending ? "Revoking..." : "Revoke all keys"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookHealth({ data }: { data: InstituteApiAccess }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Webhook className="h-4 w-4" /> Webhook health
      </p>
      {data.webhook_endpoints.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Webhooks arrive in Phase 2; until then partners poll for results. No endpoints registered.
        </p>
      ) : (
        <ul className="space-y-1">
          {data.webhook_endpoints.map((w) => (
            <li key={w.url} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono">{w.url}</span>
              <Badge variant={w.failing_since ? "destructive" : "secondary"}>{w.status}</Badge>
              {w.failing_since && <span className="text-destructive">failing since {when(w.failing_since)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
