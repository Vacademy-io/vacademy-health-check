import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronRight, FileText, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/apps/StatusBadge";
import { newId } from "@/services/app-registry-api";
import {
  PLATFORM_LABELS,
  STORE_STATUSES,
  activePlatforms,
  type AppRecord,
  type OtaStatus,
  type Platform,
  type StoreStatus,
  type VersionRecord,
} from "@/types/app-registry";

const OTA_OPTIONS: OtaStatus[] = ["AVAILABLE", "PENDING", "NONE", "FAILED"];

function emptyVersion(platform: Platform): VersionRecord {
  return {
    id: newId("ver"),
    platform,
    version: "",
    build: "",
    status: "BUILD_PROCESSING",
    releaseNotes: "",
    submittedAt: "",
    reviewedAt: "",
    releasedAt: "",
    rejectionReason: "",
    buildLogUrl: "",
    otaStatus: "NONE",
    createdAt: new Date().toISOString(),
  };
}

/**
 * App version history (§13). Each row expands into the full story of that build — when it was
 * submitted, when it was reviewed, what the store said if it was rejected, and where the logs are.
 */
export function VersionsPanel({
  app,
  onChange,
  notify,
}: {
  app: AppRecord;
  onChange: (next: AppRecord) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const platforms = useMemo(() => {
    const active = activePlatforms(app);
    return active.length > 0 ? active : (["ANDROID"] as Platform[]);
  }, [app]);

  const [editing, setEditing] = useState<VersionRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const versions = [...app.versions].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  function save(record: VersionRecord) {
    const exists = app.versions.some((v) => v.id === record.id);
    const versions = exists ? app.versions.map((v) => (v.id === record.id ? record : v)) : [...app.versions, record];

    // The platform card should track its newest build without anyone retyping the same numbers.
    const config = app.platforms[record.platform];
    const isNewest = !app.versions.some(
      (v) => v.platform === record.platform && v.id !== record.id && v.createdAt > record.createdAt
    );

    onChange({
      ...app,
      versions,
      platforms: isNewest
        ? {
            ...app.platforms,
            [record.platform]: {
              ...config,
              currentVersion: record.version || config.currentVersion,
              currentBuild: record.build || config.currentBuild,
              status: record.status,
              releasedAt: record.releasedAt || config.releasedAt,
            },
          }
        : app.platforms,
    });
    setEditing(null);
    notify("success", `Version ${record.version || "—"} saved.`);
  }

  function remove(id: string) {
    onChange({ ...app, versions: app.versions.filter((v) => v.id !== id) });
  }

  function logSubmission(version: VersionRecord) {
    onChange({
      ...app,
      submissions: [
        ...app.submissions,
        {
          id: newId("sub"),
          platform: version.platform,
          version: version.version,
          build: version.build,
          status: version.status,
          submittedAt: version.submittedAt || new Date().toISOString().slice(0, 10),
          decidedAt: version.reviewedAt,
          reason: version.rejectionReason,
          notes: "",
        },
      ],
    });
    notify("success", "Logged in submission history.");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {versions.length} version{versions.length === 1 ? "" : "s"} recorded
        </p>
        <Button size="sm" onClick={() => setEditing(emptyVersion(platforms[0]))}>
          <Plus className="mr-1 h-4 w-4" />
          Add version
        </Button>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No versions yet. Record each production build here so status, OTA and submission history line up.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => (
            <Card key={version.id}>
              <button
                type="button"
                onClick={() => setExpanded((current) => (current === version.id ? null : version.id))}
                className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
              >
                {expanded === version.id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-semibold">Version {version.version || "—"}</span>
                <Badge variant="outline">{PLATFORM_LABELS[version.platform]}</Badge>
                <span className="text-sm text-muted-foreground">Build {version.build || "—"}</span>
                <StatusBadge status={version.status} />
                {version.otaStatus !== "NONE" && (
                  <Badge variant={version.otaStatus === "AVAILABLE" ? "success" : "secondary"} className="text-[10px]">
                    OTA {version.otaStatus.toLowerCase()}
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {version.releasedAt ? `Released ${version.releasedAt}` : version.submittedAt ? `Submitted ${version.submittedAt}` : ""}
                </span>
              </button>

              {expanded === version.id && (
                <CardContent className="space-y-3 border-t pt-4">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Detail label="Submitted">{version.submittedAt || "—"}</Detail>
                    <Detail label="Reviewed">{version.reviewedAt || "—"}</Detail>
                    <Detail label="Released">{version.releasedAt || "—"}</Detail>
                    <Detail label="Store status">{version.status.replace(/_/g, " ").toLowerCase()}</Detail>
                  </dl>

                  {version.rejectionReason && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-xs font-semibold text-destructive">Rejection reason</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{version.rejectionReason}</p>
                    </div>
                  )}

                  {version.releaseNotes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Release notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{version.releaseNotes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(version)}>
                      Edit
                    </Button>
                    {version.buildLogUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={version.buildLogUrl} target="_blank" rel="noreferrer">
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          View build logs
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => logSubmission(version)}>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Log submission
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove(version.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Keyed so opening a different version remounts with fresh draft state. */}
      <VersionDialog
        key={editing?.id ?? "none"}
        value={editing}
        platforms={platforms}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function VersionDialog({
  value,
  platforms,
  onClose,
  onSave,
}: {
  value: VersionRecord | null;
  platforms: Platform[];
  onClose: () => void;
  onSave: (record: VersionRecord) => void;
}) {
  const [draft, setDraft] = useState<VersionRecord | null>(value);
  if (!value || !draft) return null;

  const set = (patch: Partial<VersionRecord>) => setDraft({ ...draft, ...patch });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.version ? `Edit version ${value.version}` : "Add version"}</DialogTitle>
          <DialogDescription>
            Record the build exactly as the store sees it, so status checks and OTA comparisons line up.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Platform">
            <Select value={draft.platform} onValueChange={(v) => set({ platform: v as Platform })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {PLATFORM_LABELS[platform]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={draft.status} onValueChange={(v) => set({ status: v as StoreStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Version">
            <Input value={draft.version} placeholder="2.4.1" onChange={(e) => set({ version: e.target.value })} />
          </Field>
          <Field label="Build number">
            <Input value={draft.build} placeholder="241" onChange={(e) => set({ build: e.target.value })} />
          </Field>
          <Field label="Submitted">
            <Input type="date" value={draft.submittedAt} onChange={(e) => set({ submittedAt: e.target.value })} />
          </Field>
          <Field label="Reviewed">
            <Input type="date" value={draft.reviewedAt} onChange={(e) => set({ reviewedAt: e.target.value })} />
          </Field>
          <Field label="Released">
            <Input type="date" value={draft.releasedAt} onChange={(e) => set({ releasedAt: e.target.value })} />
          </Field>
          <Field label="OTA status">
            <Select value={draft.otaStatus} onValueChange={(v) => set({ otaStatus: v as OtaStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OTA_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Build log URL" full>
            <Input value={draft.buildLogUrl} placeholder="https://…" onChange={(e) => set({ buildLogUrl: e.target.value })} />
          </Field>
          <Field label="Release notes" full>
            <Textarea value={draft.releaseNotes} className="min-h-24" onChange={(e) => set({ releaseNotes: e.target.value })} />
          </Field>
          <Field label="Rejection reason" full>
            <Textarea
              value={draft.rejectionReason}
              placeholder="e.g. Guideline 3.1.3(b) — Reader apps"
              className="min-h-20"
              onChange={(e) => set({ rejectionReason: e.target.value })}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>Save version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1.5", full && "md:col-span-2")}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

/** Submission history (§23) — every attempt at every store, with what the store said back. */
export function SubmissionHistory({
  app,
  onChange,
}: {
  app: AppRecord;
  onChange: (next: AppRecord) => void;
}) {
  const submissions = [...app.submissions].sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : -1));

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No submissions logged yet. Log one from a version on the Versions tab, and every attempt — including the
          rejections — stays on the record.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {submissions.map((submission) => (
        <Card key={submission.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">
                {PLATFORM_LABELS[submission.platform]} — Version {submission.version || "—"}
              </CardTitle>
              <StatusBadge status={submission.status} />
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                {submission.submittedAt || "—"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <p className="text-muted-foreground">
                Build <span className="text-foreground">{submission.build || "—"}</span>
              </p>
              <p className="text-muted-foreground">
                Decided <span className="text-foreground">{submission.decidedAt || "pending"}</span>
              </p>
            </div>
            {submission.reason && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="text-xs font-semibold text-destructive">Reason</p>
                <p className="mt-1 whitespace-pre-wrap">{submission.reason}</p>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange({ ...app, submissions: app.submissions.filter((s) => s.id !== submission.id) })}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
