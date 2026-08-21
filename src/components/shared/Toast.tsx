import { useCallback, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

/**
 * Minimal toast stack. The dashboard has no toast library and only one component ever needed one
 * before now (BbbPoolManager, with its own inline banner) — a hook plus a fixed-position list is
 * cheaper than adding a dependency for it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToasts(timeoutMs = 4000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, text: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, text }]);
      // Errors stay put — they usually carry something the user needs to read and act on.
      if (tone !== "error") setTimeout(() => dismiss(id), timeoutMs);
      return id;
    },
    [dismiss, timeoutMs]
  );

  return { toasts, push, dismiss };
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-green-500/40 bg-green-50 text-green-900 dark:bg-green-950/60 dark:text-green-100",
  error: "border-destructive/40 bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-100",
  info: "border-primary/40 bg-primary/5 text-foreground",
};

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = TONE_ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg",
              TONE_STYLES[toast.tone]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 leading-relaxed">{toast.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
