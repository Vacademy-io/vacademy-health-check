import { useState } from "react";
import { AlertCircle, Loader2, RotateCcw, ServerOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/shared/Toggle";
import { ActorName } from "@/components/shared/ActorName";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { useAiVideoPolicy, useResetAiVideoPolicy, useUpdateAiVideoPolicy } from "@/services/ai-video-policy-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { formatWhen, isNotFound } from "@/lib/model-defaults";
import {
  AI_VIDEO_LIMITS,
  AI_VIDEO_QUALITIES,
  capProgress,
  formFromPolicy,
  formatCredits,
  policyChanged,
  validatePolicyForm,
  type AiVideoPolicyForm,
} from "@/lib/ai-video-policy";
import type { AiVideoPolicyResponse, AiVideoQuality } from "@/types/ai-video-policy";
import { cn } from "@/lib/utils";

/** InstituteDetailPage → "AI Video": the LMS AI video policy (limits) and this month's usage. */
export function AiVideoTab({ instituteId }: { instituteId: string }) {
  const { toasts, push, dismiss } = useToasts();
  return (
    <div className="space-y-6">
      <SectionErrorBoundary title="AI Video policy">
        <AiVideoPolicyPanel instituteId={instituteId} onNotify={(text) => push("success", text)} />
      </SectionErrorBoundary>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function AiVideoPolicyPanel({ instituteId, onNotify }: { instituteId: string; onNotify: (text: string) => void }) {
  const query = useAiVideoPolicy(instituteId);

  if (query.isError && isNotFound(query.error)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ServerOff className="h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-lg font-medium">Backend not deployed yet</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            ai-service doesn't serve <span className="font-mono">/super-admin/v1/institutes/…/ai-video-policy</span> yet
            (404). This tab will work once that release is live. Until then AI Video runs on the platform defaults.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => query.refetch()}>
            Check again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">AI Video</CardTitle>
          {query.data &&
            (query.data.is_default ? (
              <Badge variant="secondary">Using platform defaults</Badge>
            ) : (
              <Badge variant="outline">Custom policy</Badge>
            ))}
        </div>
        <CardDescription>
          Limits for AI videos teachers generate from the course slides (Add Slide → AI Video). Credits are billed to
          the institute's balance; these limits are checked before every video starts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        {query.isLoading && <Skeleton className="h-64 w-full" />}
        {query.isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Could not load the AI Video policy: {errorDetail(query.error)}
          </p>
        )}
        {query.data && (
          <PolicyEditor
            key={JSON.stringify([query.data.policy, query.data.is_default])}
            instituteId={instituteId}
            data={query.data}
            onNotify={onNotify}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PolicyEditor({
  instituteId,
  data,
  onNotify,
}: {
  instituteId: string;
  data: AiVideoPolicyResponse;
  onNotify: (text: string) => void;
}) {
  const update = useUpdateAiVideoPolicy(instituteId);
  const reset = useResetAiVideoPolicy(instituteId);
  const [form, setForm] = useState<AiVideoPolicyForm>(() => formFromPolicy(data.policy));
  const [dialog, setDialog] = useState<"save" | "reset" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const set = (patch: Partial<AiVideoPolicyForm>) => setForm((f) => ({ ...f, ...patch }));

  const validation = validatePolicyForm(form);
  const dirty = validation.ok ? policyChanged(validation.body, data.policy) : true;
  const { policy } = data;

  const toggleQuality = (q: AiVideoQuality) =>
    set({
      allowed_qualities: form.allowed_qualities.includes(q)
        ? form.allowed_qualities.filter((x) => x !== q)
        : [...form.allowed_qualities, q],
    });

  const openDialog = (kind: "save" | "reset") => {
    setDialogError(null);
    setDialog(kind);
  };

  // mutateAsync, not mutate callbacks: a successful write changes the query data, which remounts this
  // editor (its key), and per-call mutate callbacks don't fire once the component is gone.
  const confirm = async (reason: string) => {
    setDialogError(null);
    try {
      if (dialog === "save") {
        if (!validation.ok) {
          setDialogError(validation.error);
          return;
        }
        await update.mutateAsync({ ...validation.body, reason });
        onNotify("AI Video policy saved");
      } else if (dialog === "reset") {
        await reset.mutateAsync(reason);
        onNotify("AI Video policy reset to platform defaults");
      }
      setDialog(null);
    } catch (err) {
      setDialogError(errorDetail(err, dialog === "reset" ? "Failed to reset" : "Failed to save"));
    }
  };

  return (
    <div className="space-y-6">
      <UsageRow data={data} />

      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">AI Video enabled</p>
          <p className="text-xs text-muted-foreground">
            Off: teachers can't start new AI videos. Videos already generating finish. Saved with the button below.
          </p>
        </div>
        <Toggle checked={form.enabled} onChange={(next) => set({ enabled: next })} label="AI Video enabled" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Allowed qualities</p>
          <div className="space-y-1.5">
            {AI_VIDEO_QUALITIES.map(({ value, label, hint }) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={form.allowed_qualities.includes(value)}
                  onChange={() => toggleQuality(value)}
                />
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">— {hint}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Teacher avatar allowed</p>
            <p className="text-xs text-muted-foreground">
              Lets teachers put an on-screen presenter in the video ("Lesson with a teacher" and solved problems).
            </p>
          </div>
          <Toggle
            checked={form.teacher_allowed}
            onChange={(next) => set({ teacher_allowed: next })}
            label="Teacher avatar allowed"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="aiv-max-minutes"
          label="Max minutes per video"
          value={form.max_minutes_per_video}
          min={AI_VIDEO_LIMITS.maxMinutes.min}
          max={AI_VIDEO_LIMITS.maxMinutes.max}
          onChange={(v) => set({ max_minutes_per_video: v })}
          hint={`${AI_VIDEO_LIMITS.maxMinutes.min}–${AI_VIDEO_LIMITS.maxMinutes.max}; longer videos are refused before they start`}
        />
        <NumberField
          id="aiv-monthly-cap"
          label="Monthly credit cap"
          value={form.monthly_credit_cap}
          min={0}
          step="any"
          placeholder="No cap"
          onChange={(v) => set({ monthly_credit_cap: v })}
          hint={`Blank = no cap. Used this month: ${formatCredits(data.usage.month_credits_used)} credits`}
        />
        <NumberField
          id="aiv-max-concurrent"
          label="Max videos generating at once"
          value={form.max_concurrent}
          min={AI_VIDEO_LIMITS.maxConcurrent.min}
          max={AI_VIDEO_LIMITS.maxConcurrent.max}
          onChange={(v) => set({ max_concurrent: v })}
          hint={`${AI_VIDEO_LIMITS.maxConcurrent.min}–${AI_VIDEO_LIMITS.maxConcurrent.max}; running now: ${data.usage.running_now}`}
        />
      </div>

      {!data.is_default && (policy.updated_at || policy.updated_by || policy.reason) && (
        <p className="text-xs text-muted-foreground">
          Last changed {formatWhen(policy.updated_at)}
          {policy.updated_by && (
            <>
              {" "}
              by <ActorName id={policy.updated_by} />
            </>
          )}
          {policy.reason && <> — “{policy.reason}”</>}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!validation.ok && <span className="text-xs text-destructive">{validation.error}</span>}
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDialog("reset")}
          disabled={data.is_default || reset.isPending}
          title={data.is_default ? "Already on the platform defaults" : undefined}
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Reset to defaults
        </Button>
        <Button size="sm" onClick={() => openDialog("save")} disabled={!validation.ok || !dirty || update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save AI Video policy"}
        </Button>
      </div>

      {dialog && (
        <ReasonDialog
          title={dialog === "save" ? "Save AI Video policy" : "Reset to platform defaults"}
          description={
            dialog === "save"
              ? "Applies to the next video a teacher starts. Videos already generating are not affected."
              : "Removes this institute's own AI Video policy; the platform defaults apply from the next video."
          }
          confirmLabel={dialog === "save" ? "Save" : "Reset to defaults"}
          destructive={dialog === "reset"}
          pending={dialog === "save" ? update.isPending : reset.isPending}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function UsageRow({ data }: { data: AiVideoPolicyResponse }) {
  const { usage, policy } = data;
  const cap = capProgress(usage.month_credits_used, policy.monthly_credit_cap);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Credits used this month (UTC)</p>
        <p className="text-lg font-semibold">
          {formatCredits(usage.month_credits_used)}
          <span className="text-sm font-normal text-muted-foreground">
            {policy.monthly_credit_cap === null ? " · no cap" : ` of ${formatCredits(policy.monthly_credit_cap)} cap`}
          </span>
        </p>
        {cap && (
          <Progress
            value={cap.percent}
            className={cn("h-1.5", cap.reached && "[&>div]:bg-destructive")}
            aria-label="Monthly credit cap used"
          />
        )}
        {cap?.reached && <p className="text-[11px] text-destructive">Cap reached: new videos are blocked until next month.</p>}
      </div>
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Videos this month</p>
        <p className="text-lg font-semibold">{usage.videos_this_month.toLocaleString()}</p>
      </div>
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Generating now</p>
        <p className="text-lg font-semibold">
          {usage.running_now}
          <span className="text-sm font-normal text-muted-foreground"> of {policy.max_concurrent} allowed</span>
        </p>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = "1",
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReasonDialog({
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="aiv-reason">Reason (required)</Label>
          <Input
            id="aiv-reason"
            value={reason}
            maxLength={500}
            placeholder="Pilot limit agreed with the institute, ticket #123"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !pending) void onConfirm(trimmed);
            }}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!trimmed || pending}
            onClick={() => void onConfirm(trimmed)}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
