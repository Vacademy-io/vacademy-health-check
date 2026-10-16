import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, Lock, ServerOff, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { isNotFound } from "@/lib/model-defaults";
import {
  ELIGIBILITY_HINT,
  ELIGIBILITY_LABEL,
  ENFORCEMENT_LABEL,
  MODE_HINT,
  MODE_LABEL,
  PLANS_ENABLED_SETTING_KEY,
  STATUS_LABEL,
  formatInr,
  formatMarginPct,
  marginPct,
  marginTone,
} from "@/lib/plans";
import type { Enforcement, FeatureEligibility, ItemMode } from "@/types/plans";

export const SELECT_CLASS = "h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60";

const PILL = "whitespace-nowrap px-2 py-0.5 text-[11px] font-medium";
const GREY = "border-border text-muted-foreground";
const AMBER = "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
const BLUE = "border-blue-500/40 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
const GREEN = "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
const VIOLET = "border-violet-500/40 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
const RED = "border-destructive/40 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";

const STATUS_TONE: Record<string, string> = {
  PENDING: AMBER,
  DRAFT: AMBER,
  PUBLISHED: GREEN,
  RETIRED: GREY,
  SCHEDULED: BLUE,
  TRIAL: VIOLET,
  ACTIVE: GREEN,
  GRACE: AMBER,
  EXPIRED: GREY,
  CANCELLED: GREY,
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(PILL, STATUS_TONE[status] ?? GREY)}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const TONE_CLASS = { ok: GREEN, warn: AMBER, error: RED, info: BLUE, muted: GREY } as const;

/** A small status pill coloured by tone (charges, mandates, storefront verdicts). */
export function TonePill({ tone, children, title }: { tone: keyof typeof TONE_CLASS; children: ReactNode; title?: string }) {
  return (
    <Badge variant="outline" className={cn(PILL, TONE_CLASS[tone])} title={title}>
      {children}
    </Badge>
  );
}

export function EnforcementPill({ enforcement, plansEnabled = true }: { enforcement: Enforcement; plansEnabled?: boolean | null }) {
  const off = plansEnabled === false || plansEnabled === null;
  return (
    <Badge
      variant="outline"
      className={cn(PILL, enforcement === "LIVE" ? BLUE : AMBER)}
      title={off && enforcement === "LIVE" ? "billing.plans.enabled is off, so nothing changes until it is turned on" : undefined}
    >
      {ENFORCEMENT_LABEL[enforcement]}
      {off && enforcement === "LIVE" && <span className="ml-1 font-normal">(switch off)</span>}
    </Badge>
  );
}

const MODE_TONE: Record<ItemMode, string> = { INCLUDED: GREEN, ALLOWANCE: VIOLET, CHARGED: GREY };

export function ModeBadge({ mode }: { mode: ItemMode }) {
  return (
    <Badge variant="outline" className={cn(PILL, MODE_TONE[mode])} title={MODE_HINT[mode]}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}

const ELIG_TONE: Record<FeatureEligibility, string> = { INCLUDABLE: GREEN, ALLOWANCE_ONLY: VIOLET, ALWAYS_CHARGED: RED };

export function EligibilityBadge({ eligibility, locked }: { eligibility: FeatureEligibility; locked?: boolean }) {
  return (
    <Badge variant="outline" className={cn(PILL, ELIG_TONE[eligibility])} title={ELIGIBILITY_HINT[eligibility]}>
      {locked && <Lock className="mr-1 h-3 w-3" />}
      {ELIGIBILITY_LABEL[eligibility]}
    </Badge>
  );
}

/** Margin in rupees, coloured: red = loss, amber = under 50%, green otherwise. */
export function MarginCell({ margin, revenue }: { margin: number; revenue: number }) {
  const tone = marginTone(margin, revenue);
  return (
    <span
      className={cn(
        "tabular-nums",
        tone === "error" && "font-semibold text-destructive",
        tone === "warn" && "font-semibold text-amber-700 dark:text-amber-300",
        tone === "ok" && "text-emerald-700 dark:text-emerald-300"
      )}
    >
      {formatInr(margin)}
      <span className="ml-1 text-[11px] text-muted-foreground">{formatMarginPct(marginPct(margin, revenue))}</span>
    </span>
  );
}

/** A section's error: 404 = backend not deployed, 403 = not a super admin, else the message and Retry. */
export function PlansSectionError({
  error,
  what,
  onRetry,
  service = "ai-service",
  path,
}: {
  error: unknown;
  what: string;
  onRetry: () => void;
  /** Which backend the call went to (admin-core for money and documents). */
  service?: string;
  /** The full path when it is not under /super-admin/v1/plans. */
  path?: string;
}) {
  if (isNotFound(error)) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ServerOff className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Backend not deployed yet</p>
        <p className="max-w-lg text-xs text-muted-foreground">
          {service} doesn't serve <span className="font-mono">{path ?? `/super-admin/v1/plans/${what}`}</span> yet (404). Until it does, no
          institute has a plan and every AI use is charged exactly as today.
        </p>
        <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
          Check again
        </Button>
      </div>
    );
  }
  if ((error as { response?: { status?: number } } | null)?.response?.status === 403) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Super-admin access required</p>
        <p className="max-w-lg text-xs text-muted-foreground">{service} refused this account (403).</p>
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

/** Read-only state of billing.plans.enabled, with a link to the AI settings page where it is edited. */
export function PlansSwitchNote({ enabled, loaded }: { enabled: boolean | null; loaded: boolean }) {
  if (!loaded) return null;
  const on = enabled === true;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 text-xs",
        on ? "text-muted-foreground" : "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      )}
    >
      {!on && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        Global switch <span className="font-mono">{PLANS_ENABLED_SETTING_KEY}</span> is{" "}
        <span className="font-semibold">{on ? "on" : "off"}</span>
        {enabled === null && " (not registered on this ai-service yet; off)"}.{" "}
        {on
          ? "Live subscriptions decide who pays; Shadow subscriptions only record what they would have done."
          : "No plan logic runs: every institute is charged exactly as today, Live and Shadow subscriptions alike. Plans, versions and subscriptions can still be prepared."}{" "}
        Change it on{" "}
        <Link to="/ai-settings" className="font-medium underline underline-offset-2">
          AI settings
        </Link>
        .
      </span>
    </div>
  );
}

export function ReasonField({
  id,
  value,
  onChange,
  placeholder = "Required — lands in the change log",
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>Reason</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} placeholder={placeholder} className="h-9" />
    </div>
  );
}

/** A label + hint + control row used by the term and subscription forms. */
export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Thin progress bar (0-100); amber from 80%, red at 100%. */
export function MeterBar({ pct }: { pct: number | null }) {
  const p = pct ?? 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", p >= 100 ? "bg-destructive" : p >= 80 ? "bg-amber-500" : "bg-emerald-500")}
        style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
      />
    </div>
  );
}
