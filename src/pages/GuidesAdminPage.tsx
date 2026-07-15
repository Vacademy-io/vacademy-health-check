import { useRef, useState } from "react";
import { BookOpen, Loader2, Plus, Trash2, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUploadFile } from "@/services/files-api";
import {
  useCreateGuide,
  useDeleteGuide,
  useGuides,
  useUpdateGuide,
  type GuideDto,
} from "@/services/guides-api";

export default function GuidesAdminPage() {
  const guides = useGuides();
  const deleteGuide = useDeleteGuide();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<GuideDto | null>(null);

  const rows = guides.data ?? [];

  return (
    <div>
      <PageHeader
        title="Guides"
        description="Upload an HTML walkthrough and say which pages it should appear on — no code change needed."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add guide
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {guides.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No guides yet"
              description="Add one so the team sees contextual help on the pages you pick."
            />
          ) : (
            <div className="divide-y">
              {rows.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setEditing(g)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{g.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.routes.join(", ")}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {!g.active ? <Badge variant="outline">Inactive</Badge> : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${g.title}"?`)) deleteGuide.mutate(g.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <GuideDialog open={createOpen} onOpenChange={setCreateOpen} />
      <GuideDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        guide={editing}
      />
    </div>
  );
}

function GuideDialog({
  open,
  onOpenChange,
  guide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guide?: GuideDto | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{guide ? "Edit guide" : "Add a guide"}</DialogTitle>
          <DialogDescription>
            {guide
              ? "Update the title, pages, or visibility."
              : "Upload the HTML walkthrough and fill in its details."}
          </DialogDescription>
        </DialogHeader>
        {/* Remount per open/target so the form always starts from fresh initial state. */}
        {open ? (
          <GuideForm key={guide?.id ?? "new"} guide={guide} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GuideForm({ guide, onClose }: { guide?: GuideDto | null; onClose: () => void }) {
  const upload = useUploadFile();
  const create = useCreateGuide();
  const update = useUpdateGuide();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(guide?.title ?? "");
  const [routes, setRoutes] = useState((guide?.routes ?? []).join(", "));
  const [active, setActive] = useState(guide?.active ?? true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(guide?.fileUrl ?? null);
  const [fileId, setFileId] = useState<string | null>(guide?.fileId ?? null);

  const saving = create.isPending || update.isPending;
  const canSubmit = title.trim().length > 0 && routes.trim().length > 0 && !!fileUrl;

  const onPickFile = (file: File) => {
    setFileName(file.name);
    upload.mutate(
      { file, visibility: "PUBLIC" },
      {
        onSuccess: (result) => {
          setFileUrl(result.url);
          setFileId(result.id);
        },
      }
    );
  };

  const submit = async () => {
    if (!canSubmit || !fileUrl) return;
    const payload = {
      title: title.trim(),
      fileUrl,
      fileId,
      routes: routes
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      active,
    };
    try {
      if (guide) {
        await update.mutateAsync({ id: guide.id, payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch {
      // surfaced via create/update.isError below; dialog stays open for a retry.
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* File */}
        <div className="space-y-1.5">
          <Label>Walkthrough (HTML file)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
          >
            <UploadCloud className="h-4 w-4 shrink-0" />
            {upload.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </span>
            ) : fileName ? (
              <span className="truncate">{fileName}</span>
            ) : fileUrl ? (
              <span className="truncate">Current file — click to replace</span>
            ) : (
              <span>Click to upload an HTML file</span>
            )}
          </button>
          {upload.isError ? (
            <p className="text-xs text-destructive">Upload failed. Try again.</p>
          ) : null}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Log a ticket for an institute" />
        </div>

        {/* Routes */}
        <div className="space-y-1.5">
          <Label>Pages it applies to</Label>
          <Input
            value={routes}
            onChange={(e) => setRoutes(e.target.value)}
            placeholder="/support, /onboarding"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated path prefixes. The guide shows whenever the current page starts with one
            of these.
          </p>
        </div>

        {/* Active */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>

      <DialogFooter>
        {create.isError || update.isError ? (
          <p className="mr-auto self-center text-xs text-destructive">Could not save. Try again.</p>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSubmit || saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {guide ? "Save" : "Add guide"}
        </Button>
      </DialogFooter>
    </>
  );
}
