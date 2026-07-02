import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import {
  useDeleteWidget,
  useWidgetInteractions,
  type DashboardWidgetDto,
  type WidgetTargetType,
} from "@/services/widgets-api";
import { WidgetEditorDialog } from "./WidgetEditorDialog";
import {
  formatEpoch,
  milestoneProgress,
  onboardingPayloadOf,
  WIDGET_TYPE_LABELS,
} from "./widget-helpers";

interface Props {
  widgets: DashboardWidgetDto[];
  isLoading: boolean;
  target: { type: WidgetTargetType; value: string };
  allowOnboarding: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

export function WidgetList({ widgets, isLoading, target, allowOnboarding }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardWidgetDto | undefined>(undefined);
  const del = useDeleteWidget();

  function openNew() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(widget: DashboardWidgetDto) {
    setEditing(widget);
    setEditorOpen(true);
  }

  function remove(widget: DashboardWidgetDto) {
    if (confirm(`Delete "${widget.title}"? This cannot be undone.`)) {
      del.mutate(widget.id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Add widget
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : widgets.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No widgets yet. Add an onboarding tracker or an info card.
        </p>
      ) : (
        widgets.map((w) => (
          <WidgetRow key={w.id} widget={w} onEdit={() => openEdit(w)} onDelete={() => remove(w)} />
        ))
      )}

      <WidgetEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        target={target}
        allowOnboarding={allowOnboarding}
        widget={editing}
      />
    </div>
  );
}

function WidgetRow({
  widget,
  onEdit,
  onDelete,
}: {
  widget: DashboardWidgetDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showInteractions, setShowInteractions] = useState(false);
  const isOnboarding = widget.widgetType === "ONBOARDING_TRACKER";
  const progress = isOnboarding ? milestoneProgress(onboardingPayloadOf(widget).milestones) : null;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{widget.title}</span>
              <Badge variant={STATUS_VARIANT[widget.status] ?? "secondary"}>{widget.status}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {WIDGET_TYPE_LABELS[widget.widgetType]} · roles: {widget.visibleRoles.join(", ")}
              {progress !== null && ` · ${progress}% complete`}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {isOnboarding && (
              <Button variant="ghost" size="icon" onClick={() => setShowInteractions((s) => !s)} title="Interactions">
                <MessageSquare className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {showInteractions && <Interactions widgetId={widget.id} />}
      </CardContent>
    </Card>
  );
}

function Interactions({ widgetId }: { widgetId: string }) {
  const { data, isLoading } = useWidgetInteractions(widgetId);

  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (!data || data.length === 0) {
    return <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">No comments or confirmations yet.</p>;
  }

  return (
    <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
      {data.map((i) => (
        <div key={i.id} className="text-xs">
          <span className="font-medium">{i.userName ?? "Institute admin"}</span>{" "}
          <span className="text-muted-foreground">
            {i.interactionType === "CONFIRM" ? "confirmed a milestone" : "commented"}
            {i.milestoneId ? ` (${i.milestoneId})` : ""} · {formatEpoch(i.createdAt)}
          </span>
          {i.message && <div className="text-foreground">{i.message}</div>}
        </div>
      ))}
    </div>
  );
}
