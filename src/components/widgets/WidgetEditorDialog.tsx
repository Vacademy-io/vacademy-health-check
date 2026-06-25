import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateWidget,
  useOnboardingTemplate,
  useUpdateWidget,
  type DashboardWidgetDto,
  type InfoSeverity,
  type Milestone,
  type MilestoneStatus,
  type WidgetStatus,
  type WidgetTargetType,
  type WidgetType,
} from "@/services/widgets-api";
import { useUploadFile } from "@/services/files-api";
import {
  infoPayloadOf,
  MILESTONE_STATUSES,
  newMilestoneId,
  onboardingPayloadOf,
  ROLE_OPTIONS,
  SEVERITIES,
} from "./widget-helpers";

interface Props {
  open: boolean;
  onClose: () => void;
  target: { type: WidgetTargetType; value: string };
  allowOnboarding: boolean;
  widget?: DashboardWidgetDto;
}

export function WidgetEditorDialog(props: Props) {
  // Remount per target/widget so state seeds cleanly (matches InstituteSupportDialog convention).
  if (!props.open) return null;
  return <WidgetEditorForm key={props.widget?.id ?? "new"} {...props} />;
}

function WidgetEditorForm({ open, onClose, target, allowOnboarding, widget }: Props) {
  const editing = !!widget;
  const [widgetType, setWidgetType] = useState<WidgetType>(
    widget?.widgetType ?? (allowOnboarding ? "ONBOARDING_TRACKER" : "INFO_CARD")
  );
  const [title, setTitle] = useState(widget?.title ?? "");
  const [status, setStatus] = useState<WidgetStatus>(widget?.status ?? "DRAFT");
  const [visibleRoles, setVisibleRoles] = useState<string[]>(
    widget?.visibleRoles?.length ? widget.visibleRoles : ["ADMIN"]
  );

  // Onboarding state
  const onboardingSeed = widget ? onboardingPayloadOf(widget) : { milestones: [], overallNote: "" };
  const [milestones, setMilestones] = useState<Milestone[]>(onboardingSeed.milestones);
  const [overallNote, setOverallNote] = useState(onboardingSeed.overallNote ?? "");

  // Info-card state
  const infoSeed = widget ? infoPayloadOf(widget) : infoPayloadOf({ payload: {} } as DashboardWidgetDto);
  const [body, setBody] = useState(infoSeed.body ?? "");
  const [severity, setSeverity] = useState<InfoSeverity>(infoSeed.severity ?? "INFO");
  const [imageUrl, setImageUrl] = useState(infoSeed.imageUrl ?? "");
  const [ctaLabel, setCtaLabel] = useState(infoSeed.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(infoSeed.ctaUrl ?? "");

  const template = useOnboardingTemplate();
  const upload = useUploadFile();
  const create = useCreateWidget();
  const update = useUpdateWidget();
  const saving = create.isPending || update.isPending;
  const error = create.isError || update.isError;

  const isOnboarding = widgetType === "ONBOARDING_TRACKER";

  function loadTemplate() {
    const rows = (template.data ?? []).map<Milestone>((t) => ({
      id: t.key,
      label: t.label,
      status: "NOT_STARTED",
      estimatedDate: null,
      note: "",
      source: "TEMPLATE",
    }));
    setMilestones(rows);
  }

  function updateMilestone(idx: number, patch: Partial<Milestone>) {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function addMilestone() {
    setMilestones((prev) => [
      ...prev,
      { id: newMilestoneId(prev), label: "", status: "NOT_STARTED", estimatedDate: null, note: "", source: "CUSTOM" },
    ]);
  }

  function removeMilestone(idx: number) {
    setMilestones((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleRole(role: string) {
    setVisibleRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleImage(file: File | undefined) {
    if (!file) return;
    const result = await upload.mutateAsync({ file, visibility: "PUBLIC" });
    setImageUrl(result.url);
  }

  async function save() {
    const payload = isOnboarding
      ? { milestones, overallNote }
      : { body, severity, imageUrl: imageUrl || null, ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null };
    // Onboarding trackers are ADMIN-only by nature.
    const roles = isOnboarding ? ["ADMIN"] : visibleRoles;

    if (editing) {
      await update.mutateAsync({
        id: widget!.id,
        body: { title, status, visibleRoles: roles, payload },
      });
    } else {
      await create.mutateAsync({
        widgetType,
        targetType: target.type,
        targetValue: target.value,
        title,
        status,
        visibleRoles: roles,
        payload,
      });
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit widget" : "New widget"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type (only choosable on create when onboarding is allowed) */}
          {!editing && allowOnboarding && (
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={widgetType} onValueChange={(v) => setWidgetType(v as WidgetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONBOARDING_TRACKER">Onboarding tracker</SelectItem>
                  <SelectItem value="INFO_CARD">Info card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
          </div>

          {isOnboarding ? (
            <OnboardingEditor
              milestones={milestones}
              overallNote={overallNote}
              templateLoading={template.isLoading}
              onLoadTemplate={loadTemplate}
              onAdd={addMilestone}
              onRemove={removeMilestone}
              onChange={updateMilestone}
              onOverallNote={setOverallNote}
            />
          ) : (
            <InfoCardEditor
              body={body}
              severity={severity}
              imageUrl={imageUrl}
              ctaLabel={ctaLabel}
              ctaUrl={ctaUrl}
              uploading={upload.isPending}
              onBody={setBody}
              onSeverity={setSeverity}
              onImage={handleImage}
              onClearImage={() => setImageUrl("")}
              onCtaLabel={setCtaLabel}
              onCtaUrl={setCtaUrl}
            />
          )}

          {/* Visible roles — onboarding is forced ADMIN-only */}
          {!isOnboarding && (
            <div className="space-y-1">
              <Label>Visible to roles</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave only ADMIN for admin-only visibility.</p>
            </div>
          )}

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as WidgetStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft (hidden from institute)</SelectItem>
                <SelectItem value="PUBLISHED">Published (live on dashboard)</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2">
          {error && <span className="mr-auto text-sm text-destructive">Save failed. Try again.</span>}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !title.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnboardingEditor(props: {
  milestones: Milestone[];
  overallNote: string;
  templateLoading: boolean;
  onLoadTemplate: () => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onChange: (idx: number, patch: Partial<Milestone>) => void;
  onOverallNote: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>Milestones</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={props.onLoadTemplate} disabled={props.templateLoading}>
            Load template
          </Button>
          <Button variant="outline" size="sm" onClick={props.onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {props.milestones.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No milestones yet. Load the template or add rows.
        </p>
      )}

      <div className="space-y-2">
        {props.milestones.map((m, idx) => (
          <div key={m.id} className="grid grid-cols-12 items-center gap-2">
            <Input
              className="col-span-4"
              value={m.label}
              placeholder="Milestone"
              onChange={(e) => props.onChange(idx, { label: e.target.value })}
            />
            <div className="col-span-3">
              <Select value={m.status} onValueChange={(v) => props.onChange(idx, { status: v as MilestoneStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              type="date"
              className="col-span-3 rounded-md border bg-background p-2 text-sm"
              value={m.estimatedDate ?? ""}
              onChange={(e) => props.onChange(idx, { estimatedDate: e.target.value || null })}
            />
            <div className="col-span-2 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => props.onRemove(idx)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Input
              className="col-span-12"
              value={m.note ?? ""}
              placeholder="Note (optional)"
              onChange={(e) => props.onChange(idx, { note: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label>Overall note</Label>
        <textarea
          className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
          value={props.overallNote}
          onChange={(e) => props.onOverallNote(e.target.value)}
          placeholder="e.g. On track for July launch"
        />
      </div>
    </div>
  );
}

function InfoCardEditor(props: {
  body: string;
  severity: InfoSeverity;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  uploading: boolean;
  onBody: (v: string) => void;
  onSeverity: (v: InfoSeverity) => void;
  onImage: (file: File | undefined) => void;
  onClearImage: () => void;
  onCtaLabel: (v: string) => void;
  onCtaUrl: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label>Body (HTML allowed)</Label>
        <textarea
          className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          rows={4}
          value={props.body}
          onChange={(e) => props.onBody(e.target.value)}
          placeholder="<p>Scheduled maintenance Sat 2am–4am IST</p>"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Severity</Label>
          <Select value={props.severity} onValueChange={(v) => props.onSeverity(v as InfoSeverity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Image</Label>
          {props.imageUrl ? (
            <div className="flex items-center gap-2">
              <img src={props.imageUrl} alt="" className="h-9 w-9 rounded object-cover" />
              <Button variant="outline" size="sm" onClick={props.onClearImage}>
                Remove
              </Button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              disabled={props.uploading}
              onChange={(e) => props.onImage(e.target.files?.[0])}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>CTA label (optional)</Label>
          <Input value={props.ctaLabel} onChange={(e) => props.onCtaLabel(e.target.value)} placeholder="Learn more" />
        </div>
        <div className="space-y-1">
          <Label>CTA url (optional)</Label>
          <Input value={props.ctaUrl} onChange={(e) => props.onCtaUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
    </div>
  );
}
