import { useState, type ReactNode } from "react";
import { AlertCircle, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage, isApiUnavailable } from "@/lib/modules-catalog";
import type { ModuleMode } from "@/types/modules";
import { cn } from "@/lib/utils";

/** Shown instead of a section while the backend for this feature is not deployed (404). */
export function ApiUnavailable({ what = "Modules API" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
      <PlugZap className="h-10 w-10 text-muted-foreground/50" />
      <h3 className="mt-3 font-medium">{what} not available yet</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        The backend for Institute Modules &amp; Configuration has not been deployed to this environment. This
        section starts working as soon as it is — nothing to configure here.
      </p>
    </div>
  );
}

/** Loading / unavailable / error states shared by every section. Returns null when `ready`. */
export function QueryState({
  isLoading,
  error,
  what,
  onRetry,
}: {
  isLoading: boolean;
  error: unknown;
  what: string;
  onRetry?: () => void;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error && isApiUnavailable(error)) return <ApiUnavailable />;
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-4 text-sm">
        <span className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" /> Could not load {what}: {errorMessage(error)}
        </span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  return null;
}

export function ModeBadge({ mode, className }: { mode: ModuleMode; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        mode === "MANAGED"
          ? "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
          : "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
        className
      )}
      title={mode === "MANAGED" ? "Modules are applied in the admin app" : "Every module on (today's behaviour)"}
    >
      {mode}
    </Badge>
  );
}

/**
 * Confirmation dialog with a required reason. Mounted only while open, so its
 * state starts fresh each time (callers render it conditionally).
 */
export function ReasonDialog({
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = "Saving...",
  destructive,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  destructive?: boolean;
  /** Extra gate besides the reason (e.g. nothing picked yet). */
  confirmDisabled?: boolean;
  /** Resolve to close; throw to show the error inline. */
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim() || confirmDisabled) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-2">
          <Label htmlFor="change-reason">Reason (required)</Label>
          <Textarea
            id="change-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Contract #2026-114: CRM + LMS, trial of AI until Dec"
            rows={3}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Recorded in the institute's history with your name.</p>
        </div>
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={submit} disabled={pending || !reason.trim() || confirmDisabled}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Right-hand drawer built on Dialog (same as PricingHistoryDrawer). */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "left-auto right-0 top-0 h-full translate-x-0 translate-y-0 content-start overflow-y-auto sm:rounded-none",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ModuleChip({ label, muted, title }: { label: string; muted?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        muted ? "border-dashed text-muted-foreground" : "bg-primary/5 text-foreground"
      )}
    >
      {label}
    </span>
  );
}
