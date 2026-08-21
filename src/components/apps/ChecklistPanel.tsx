import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronRight, Circle, HelpCircle, MinusCircle, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { platformProgress, resolveChecklist, type CheckState, type ResolvedChecklistItem } from "@/lib/app-checklist";
import { CHECKLIST_SECTIONS, type ChecklistSection } from "@/lib/platform-requirements";
import { STORE_LABELS, type AppRecord, type ChecklistOverride, type Platform } from "@/types/app-registry";

/** Which detail tab holds the thing a checklist row is complaining about. */
// eslint-disable-next-line react-refresh/only-export-components
export const SECTION_TAB: Record<ChecklistSection, string> = {
  "Basic Information": "registration",
  "Platform Setup": "registration",
  "Store Listing": "content",
  "App Content": "registration",
  "Privacy & Security": "privacy",
  Assets: "assets",
  Build: "builds",
  Submission: "submission",
};

const STATE_ICON: Record<CheckState, typeof Check> = {
  COMPLETED: CheckCircle2,
  PENDING: AlertCircle,
  NOT_APPLICABLE: MinusCircle,
};

const STATE_CLASS: Record<CheckState, string> = {
  COMPLETED: "text-green-600",
  PENDING: "text-amber-600",
  NOT_APPLICABLE: "text-muted-foreground/50",
};

interface ChecklistPanelProps {
  app: AppRecord;
  platform: Platform;
  onOverride: (itemId: string, state: ChecklistOverride | null) => void;
  /** Jump the user straight to the tab that fixes the row (§26). */
  onNavigate: (tab: string) => void;
}

export function ChecklistPanel({ app, platform, onOverride, onNavigate }: ChecklistPanelProps) {
  const items = resolveChecklist(app, platform);
  const progress = platformProgress(app, platform);
  const [helpFor, setHelpFor] = useState<string | null>(null);

  const bySection = CHECKLIST_SECTIONS.map((section) => ({
    section,
    rows: items.filter((i) => i.section === section),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">{STORE_LABELS[platform]} — registration checklist</CardTitle>
            <span className="text-sm font-semibold tabular-nums">{progress.percent}% complete</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress.percent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress.done} of {progress.total} required items done
            {progress.blocking.length > 0 && ` — ${progress.blocking.length} still blocking submission`}
          </p>
        </CardContent>
      </Card>

      {bySection.map(({ section, rows }) => (
        <Card key={section}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{section}</CardTitle>
              <Badge variant={rows.every((r) => r.state !== "PENDING") ? "success" : "secondary"} className="text-[11px]">
                {rows.filter((r) => r.state === "COMPLETED").length}/{rows.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {rows.map((row) => (
                <ChecklistRow
                  key={row.id}
                  row={row}
                  showHelp={helpFor === row.id}
                  onToggleHelp={() => setHelpFor((current) => (current === row.id ? null : row.id))}
                  onOverride={(state) => onOverride(row.id, state)}
                  onEdit={() => onNavigate(SECTION_TAB[row.section])}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChecklistRow({
  row,
  showHelp,
  onToggleHelp,
  onOverride,
  onEdit,
}: {
  row: ResolvedChecklistItem;
  showHelp: boolean;
  onToggleHelp: () => void;
  onOverride: (state: ChecklistOverride | null) => void;
  onEdit: () => void;
}) {
  const Icon = STATE_ICON[row.state];

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", STATE_CLASS[row.state])} />
        <span className={cn("flex-1 text-sm", row.state === "NOT_APPLICABLE" && "text-muted-foreground line-through")}>
          {row.label}
          {!row.required && <span className="ml-2 text-[11px] text-muted-foreground">optional</span>}
          {row.overridden && <span className="ml-2 text-[11px] text-muted-foreground">(marked by hand)</span>}
        </span>

        <div className="flex items-center gap-1">
          {row.state === "COMPLETED" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onOverride(row.manual ? null : "PENDING")}
            >
              Undo
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOverride("COMPLETED")}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Complete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
            <PencilLine className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onToggleHelp}>
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onOverride(row.state === "NOT_APPLICABLE" ? null : "NOT_APPLICABLE")}
            title="Mark not applicable for this client"
          >
            N/A
          </Button>
        </div>
      </div>

      {showHelp && <p className="mt-2 pl-6 text-xs leading-relaxed text-muted-foreground">{row.help}</p>}
    </li>
  );
}

/**
 * The "App Registration — 72% Complete" summary (§26). Every row is clickable and lands on the
 * screen that fixes it, so nobody has to hunt for the missing field.
 */
export function RegistrationProgressCard({
  app,
  platform,
  onNavigate,
}: {
  app: AppRecord;
  platform: Platform;
  onNavigate: (tab: string) => void;
}) {
  const progress = platformProgress(app, platform);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">App Registration — {progress.percent}% Complete</CardTitle>
          <Badge variant={progress.percent === 100 ? "success" : "secondary"}>
            {progress.done}/{progress.total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress.percent} className="h-2" />
        <ul className="space-y-1">
          {progress.sections.map((section) => {
            const state: CheckState = section.done === section.total ? "COMPLETED" : section.done === 0 ? "PENDING" : "PENDING";
            const partial = section.done > 0 && section.done < section.total;
            return (
              <li key={section.section}>
                <button
                  type="button"
                  onClick={() => onNavigate(SECTION_TAB[section.section])}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  {state === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : partial ? (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  <span className="flex-1">{section.section}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {section.done}/{section.total}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
