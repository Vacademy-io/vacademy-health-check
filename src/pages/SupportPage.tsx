import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Send,
  Settings2,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  useAssignEngineer,
  useEngineers,
  useReplyTicket,
  useSupportTicket,
  useSupportTickets,
  useTicketCounts,
  useUpdateTicketStatus,
  type AttachmentDto,
  type SupportTicketDto,
  type TicketPriority,
  type TicketStatus,
} from "@/services/support-api";
import { InstituteSupportDialog } from "@/components/support/InstituteSupportDialog";

const STATUS_META: Record<TicketStatus, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: "Open", variant: "warning" },
  IN_PROGRESS: { label: "In progress", variant: "default" },
  WAITING_ON_CUSTOMER: { label: "Waiting on customer", variant: "secondary" },
  RESOLVED: { label: "Resolved", variant: "success" },
  CLOSED: { label: "Closed", variant: "outline" },
};
const PRIORITY_META: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
  MAJOR: { label: "Major", variant: "destructive" },
  MINOR: { label: "Minor", variant: "secondary" },
};
type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const STATUS_OPTIONS: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
];

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function SupportPage() {
  const [status, setStatus] = useState("ALL");
  const [engineerId, setEngineerId] = useState("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useTicketCounts();
  const engineers = useEngineers();
  const ticketsQuery = useSupportTickets({
    status: status === "ALL" ? undefined : status,
    engineerId: engineerId === "ALL" ? undefined : engineerId,
    overdue: overdueOnly,
    size: 50,
  });

  const tickets = ticketsQuery.data?.content ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Support"
        description="Triage, reply to and resolve institute issues — Intercom-style."
        actions={
          <div className="flex items-center gap-2">
            {counts.data?.overdue ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {counts.data.overdue} overdue
              </Badge>
            ) : null}
            <Badge variant="warning">{counts.data?.open ?? 0} open</Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/support/settings">
                <Settings2 className="mr-1 h-4 w-4" /> Settings
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={engineerId} onValueChange={setEngineerId}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Engineer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All engineers</SelectItem>
            {(engineers.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={overdueOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setOverdueOnly((v) => !v)}
        >
          <AlertTriangle className="mr-1 h-4 w-4" /> Overdue only
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Inbox list */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ticketsQuery.isLoading ? "Loading…" : `${tickets.length} conversation(s)`}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!ticketsQuery.isLoading && tickets.length === 0 ? (
              <EmptyState title="No conversations" description="Nothing matches these filters." />
            ) : (
              tickets.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  active={t.id === selectedId}
                  onClick={() => setSelectedId(t.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          {selectedId ? (
            <TicketThread
              ticketId={selectedId}
              engineers={engineers.data ?? []}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                title="Select a conversation"
                description="Pick an issue from the list to view and reply."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  active,
  onClick,
}: {
  ticket: SupportTicketDto;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{ticket.subject}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {timeAgo(ticket.lastMessageAt)}
        </span>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {ticket.instituteName || ticket.instituteId}
      </span>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge variant={STATUS_META[ticket.status].variant} className="text-[10px]">
          {STATUS_META[ticket.status].label}
        </Badge>
        <Badge variant={PRIORITY_META[ticket.priority].variant} className="text-[10px]">
          {PRIORITY_META[ticket.priority].label}
        </Badge>
        {ticket.planAtCreation ? (
          <Badge variant="outline" className="text-[10px]">
            {ticket.planAtCreation}
          </Badge>
        ) : null}
        {ticket.overdue ? (
          <Badge variant="destructive" className="gap-0.5 text-[10px]">
            <AlertTriangle className="h-2.5 w-2.5" /> overdue
          </Badge>
        ) : null}
        {ticket.assignedEngineerName ? (
          <span className="text-[10px] text-muted-foreground">· {ticket.assignedEngineerName}</span>
        ) : (
          <span className="text-[10px] text-amber-600">· unassigned</span>
        )}
      </div>
    </button>
  );
}

function TicketThread({
  ticketId,
  engineers,
}: {
  ticketId: string;
  engineers: { id: string; name: string }[];
}) {
  const { data: ticket, isLoading } = useSupportTicket(ticketId);
  const reply = useReplyTicket();
  const assign = useAssignEngineer();
  const updateStatus = useUpdateTicketStatus();
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  if (isLoading || !ticket) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const send = async () => {
    if (!draft.trim()) return;
    await reply.mutateAsync({ id: ticket.id, body: draft.trim(), internalNote: internal });
    setDraft("");
    setInternal(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{ticket.subject}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {ticket.instituteName || ticket.instituteId} · raised by{" "}
              {ticket.raisedByName || ticket.raisedByEmail || "unknown"} · {ticket.category}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            <UserCog className="mr-1 h-4 w-4" /> Manage institute
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={PRIORITY_META[ticket.priority].variant}>
            {PRIORITY_META[ticket.priority].label}
          </Badge>
          {ticket.planAtCreation ? <Badge variant="outline">{ticket.planAtCreation}</Badge> : null}

          {/* Assign */}
          <Select
            value={ticket.assignedEngineerId ?? "NONE"}
            onValueChange={(v) =>
              assign.mutate({ id: ticket.id, engineerId: v === "NONE" ? null : v })
            }
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Assign engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Unassigned</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select
            value={ticket.status}
            onValueChange={(v) => updateStatus.mutate({ id: ticket.id, status: v })}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority */}
          <Select
            value={ticket.priority}
            onValueChange={(v) => updateStatus.mutate({ id: ticket.id, priority: v })}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MAJOR">Major</SelectItem>
              <SelectItem value="MINOR">Minor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* SLA line */}
        <div className="mt-2 flex items-center gap-2 text-xs">
          {ticket.firstRespondedAt ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> First response {fmt(ticket.firstRespondedAt)}
            </span>
          ) : ticket.firstResponseDueAt ? (
            <span
              className={cn(
                "flex items-center gap-1",
                ticket.overdue ? "font-medium text-destructive" : "text-muted-foreground"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {ticket.overdue ? "Response overdue — due " : "First response due "}
              {fmt(ticket.firstResponseDueAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">No SLA for this plan</span>
          )}
        </div>

        {ticket.clientContext ? <DiagnosticsPanel context={ticket.clientContext} /> : null}
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
        {(ticket.messages ?? []).map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={internal ? "Write an internal note (not sent to the institute)…" : "Reply to the institute…"}
          rows={3}
          className={cn(
            "w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
            internal && "border-amber-300 bg-amber-50"
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal note
          </label>
          <div className="flex items-center gap-2">
            {ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatus.mutate({ id: ticket.id, status: "RESOLVED" })}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" /> Resolve
              </Button>
            ) : null}
            <Button size="sm" onClick={send} disabled={!draft.trim() || reply.isPending}>
              {reply.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              {internal ? "Add note" : "Send reply"}
            </Button>
          </div>
        </div>
      </div>

      <InstituteSupportDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        instituteId={ticket.instituteId}
        instituteName={ticket.instituteName}
      />
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: NonNullable<SupportTicketDto["messages"]>[number];
}) {
  if (message.senderType === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.body}
        </span>
      </div>
    );
  }
  const isSupport = message.senderType === "SUPPORT";
  return (
    <div className={cn("flex", isSupport ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          message.internalNote
            ? "border border-amber-300 bg-amber-50 text-amber-900"
            : isSupport
              ? "bg-primary text-primary-foreground"
              : "border bg-background"
        )}
      >
        <div className="mb-0.5 flex items-center gap-2 text-[11px] opacity-80">
          <span className="font-medium">
            {message.internalNote ? "Internal note" : message.senderName || message.senderType}
          </span>
          <span>{fmt(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        {message.attachments?.length ? (
          <div className="mt-2 flex flex-col gap-2">
            {message.attachments.map((a, i) => (
              <AttachmentPreview key={a.fileId || i} attachment={a} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: AttachmentDto }) {
  const name = attachment.fileName || "";
  // Only trust http(s) URLs — never render javascript:/data: into href/src.
  const url = /^https?:\/\//i.test(attachment.url || "") ? (attachment.url as string) : "";
  if (!url) return name ? <span className="text-xs text-muted-foreground">{name}</span> : null;
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i.test(name)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={name} className="max-h-48 rounded-md border" />
      </a>
    );
  }
  if (/\.(mp4|mov|webm|avi|mkv|m4v|ogv)$/i.test(name)) {
    return <video src={url} controls className="max-h-48 rounded-md border" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs underline"
    >
      <Inbox className="h-3 w-3" /> {name || "attachment"}
    </a>
  );
}

function DiagnosticsPanel({ context }: { context: Record<string, unknown> }) {
  const entries = Object.entries(context).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return null;
  const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return (
    <details className="mt-2 rounded-md border bg-background text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">
        Diagnostics ({entries.length})
      </summary>
      <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="text-muted-foreground">{label(k)}</span>
            <span className="break-all font-mono">{String(v)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
