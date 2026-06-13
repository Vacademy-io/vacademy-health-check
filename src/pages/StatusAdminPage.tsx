import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plus,
  MessageSquarePlus,
  CheckCircle2,
  Trash2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminIncidents,
  useCreateIncident,
  useUpdateIncident,
  useAddIncidentUpdate,
  useDeleteIncident,
} from "@/services/status-api";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type DateLike,
  type IncidentDTO,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/types/api";

const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  MINOR: "bg-yellow-100 text-yellow-800 border-yellow-300",
  MAJOR: "bg-orange-100 text-orange-800 border-orange-300",
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  MAINTENANCE: "bg-blue-100 text-blue-800 border-blue-300",
};

const STATUS_CLASS: Record<IncidentStatus, string> = {
  INVESTIGATING: "bg-red-50 text-red-700 border-red-200",
  IDENTIFIED: "bg-orange-50 text-orange-700 border-orange-200",
  MONITORING: "bg-blue-50 text-blue-700 border-blue-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
};

const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
  MAINTENANCE: "Maintenance",
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

function toDate(v: DateLike | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function CreateIncidentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateIncident();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("MINOR");
  const [status, setStatus] = useState<IncidentStatus>("INVESTIGATING");
  const [components, setComponents] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setTitle("");
    setMessage("");
    setSeverity("MINOR");
    setStatus("INVESTIGATING");
    setComponents("");
    setError("");
  }

  async function handleSubmit() {
    setError("");
    try {
      await create.mutateAsync({
        title: title.trim(),
        severity,
        status,
        message: message.trim() || undefined,
        affectedComponents: components
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create incident");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Report new incident</DialogTitle>
          <DialogDescription>
            This will appear on the public status page immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Increased login error rate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Initial update message</Label>
            <Textarea
              id="message"
              placeholder="What is happening? What's known so far?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Becomes the first entry in the incident timeline.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as IncidentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="components">Affected components (comma-separated)</Label>
            <Input
              id="components"
              placeholder="auth-service, media-service"
              value={components}
              onChange={(e) => setComponents(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={create.isPending || !title.trim()}
          >
            {create.isPending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddUpdateDialog({
  incident,
  onClose,
}: {
  incident: IncidentDTO | null;
  onClose: () => void;
}) {
  const open = !!incident;
  const addUpdate = useAddIncidentUpdate(incident?.id ?? "");
  const [status, setStatus] = useState<IncidentStatus>("MONITORING");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setStatus("MONITORING");
    setMessage("");
    setError("");
  }

  async function handleSubmit() {
    if (!incident) return;
    setError("");
    try {
      await addUpdate.mutateAsync({ status, message: message.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post update");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post update</DialogTitle>
          <DialogDescription className="truncate">
            {incident?.title}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as IncidentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCIDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg">Message</Label>
            <Textarea
              id="msg"
              rows={4}
              placeholder="Share what's changed since the last update."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={addUpdate.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={addUpdate.isPending || !message.trim()}
          >
            {addUpdate.isPending ? "Posting…" : "Post update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentRow({
  incident,
  onAddUpdate,
}: {
  incident: IncidentDTO;
  onAddUpdate: (i: IncidentDTO) => void;
}) {
  const update = useUpdateIncident(incident.id);
  const del = useDeleteIncident();
  const isResolved = incident.status === "RESOLVED";
  // Backend orders newest-first; first item is the latest.
  const lastUpdate = incident.updates?.[0];
  const startedAt = toDate(incident.startedAt);
  const lastUpdateAt = lastUpdate ? toDate(lastUpdate.createdAt) : null;

  function handleResolve() {
    update.mutate({ status: "RESOLVED" });
  }

  function handleDelete() {
    if (confirm(`Delete incident "${incident.title}"? This cannot be undone.`)) {
      del.mutate(incident.id);
    }
  }

  return (
    <Card className={isResolved ? "opacity-80" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className={SEVERITY_CLASS[incident.severity]}>
                {SEVERITY_LABEL[incident.severity]}
              </Badge>
              <Badge variant="outline" className={STATUS_CLASS[incident.status]}>
                {STATUS_LABEL[incident.status]}
              </Badge>
              {incident.affectedComponents?.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
            <h3 className="font-semibold">{incident.title}</h3>
            {lastUpdate && (
              <p className="mt-2 text-xs text-muted-foreground">
                Last update{" "}
                {lastUpdateAt
                  ? formatDistanceToNow(lastUpdateAt, { addSuffix: true })
                  : "recently"}
                : <span className="italic">{lastUpdate.message}</span>
              </p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            {startedAt && <div>{format(startedAt, "MMM d, HH:mm")}</div>}
            <div>
              {(incident.updates ?? []).length} update
              {(incident.updates ?? []).length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {!isResolved && (
            <>
              <Button size="sm" variant="outline" onClick={() => onAddUpdate(incident)}>
                <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> Post update
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResolve}
                disabled={update.isPending}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark resolved
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={del.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatusAdminPage() {
  const { data, isLoading, isError } = useAdminIncidents();
  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<IncidentDTO | null>(null);

  const incidents = data ?? [];
  const active = incidents.filter((i) => i.status !== "RESOLVED");
  const resolved = incidents
    .filter((i) => i.status === "RESOLVED")
    .sort((a, b) => {
      const aT = toDate(a.resolvedAt ?? a.updatedAt)?.getTime() ?? 0;
      const bT = toDate(b.resolvedAt ?? b.updatedAt)?.getTime() ?? 0;
      return bT - aT;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status & Incidents"
        description="Report and manage incidents shown on the public status page."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <a href="/status" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" /> View public page
              </a>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Report incident
            </Button>
          </div>
        }
      />

      {isError && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-destructive">
            <AlertCircle className="h-5 w-5" />
            Couldn't load incidents. Check that{" "}
            <code className="rounded bg-destructive/10 px-1">
              /community-service/admin/v1/status/incidents
            </code>{" "}
            is reachable and your user has the ADMIN authority.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active
        </h2>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : active.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No active incidents. The public page is showing "All Systems Operational".
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map((i) => (
              <IncidentRow key={i.id} incident={i} onAddUpdate={setUpdateTarget} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resolved
        </h2>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : resolved.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No resolved incidents yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resolved.map((i) => (
              <IncidentRow key={i.id} incident={i} onAddUpdate={setUpdateTarget} />
            ))}
          </div>
        )}
      </section>

      <CreateIncidentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AddUpdateDialog
        incident={updateTarget}
        onClose={() => setUpdateTarget(null)}
      />
    </div>
  );
}
