import type { LucideIcon } from "lucide-react";
import { Apple, Bot, Laptop, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_LABELS, STATUS_META, type Platform, type StoreStatus } from "@/types/app-registry";

const TONE_CLASSES = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  good: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
} as const;

const DOT_CLASSES = {
  neutral: "bg-muted-foreground/50",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  good: "bg-green-500",
  bad: "bg-red-500",
} as const;

export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: StoreStatus;
  className?: string;
  showDot?: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.help}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[meta.tone],
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            DOT_CLASSES[meta.tone],
            // Anything actively moving through review deserves to look alive.
            (status === "IN_REVIEW" || status === "BUILD_PROCESSING") && "animate-pulse"
          )}
        />
      )}
      {meta.label}
    </span>
  );
}

/** Just the coloured dot — for dense table cells where the label would not fit. */
export function StatusDot({ status, className }: { status: StoreStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={`${meta.label} — ${meta.help}`}
      className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT_CLASSES[meta.tone], className)}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const PLATFORM_ICONS: Record<Platform, LucideIcon> = {
  ANDROID: Bot,
  IOS: Apple,
  WINDOWS: Monitor,
  MACOS: Laptop,
};

export function PlatformChip({
  platform,
  active = true,
  className,
}: {
  platform: Platform;
  active?: boolean;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[platform];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        active ? "border-border bg-secondary text-secondary-foreground" : "border-dashed text-muted-foreground/60",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {PLATFORM_LABELS[platform]}
    </span>
  );
}
