import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Inbox, Loader2, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  useEngineers,
  useSupportTickets,
  useUpdateTicketStatus,
  type SupportTicketDto,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "@/services/support-api";
import { CreateTicketDialog } from "@/components/support/CreateTicketDialog";

const COLUMNS: { status: TicketStatus; label: string; accent: string }[] = [
  { status: "OPEN", label: "Open", accent: "border-t-amber-400" },
  { status: "IN_PROGRESS", label: "In progress", accent: "border-t-blue-400" },
  { status: "WAITING_ON_CUSTOMER", label: "Waiting on customer", accent: "border-t-slate-400" },
  { status: "RESOLVED", label: "Resolved", accent: "border-t-green-400" },
  { status: "CLOSED", label: "Closed", accent: "border-t-zinc-400" },
];

const PRIORITY_META: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
  MAJOR: { label: "Major", variant: "destructive" },
  MINOR: { label: "Minor", variant: "secondary" },
};
type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const SOURCE_LABEL: Record<TicketSource, string> = {
  PORTAL: "Portal",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  MANUAL: "Manual",
  OTHER: "Other",
};

const PER_COLUMN = 50;

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportBoardPage() {
  const [engineerId, setEngineerId] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);

  const engineers = useEngineers();
  const updateStatus = useUpdateTicketStatus();
  const engineerParam = engineerId === "ALL" ? undefined : engineerId;

  // One query per column so each is complete up to PER_COLUMN. Fixed count → hook order is stable.
  const open = useSupportTickets({ status: "OPEN", engineerId: engineerParam, size: PER_COLUMN });
  const inProgress = useSupportTickets({ status: "IN_PROGRESS", engineerId: engineerParam, size: PER_COLUMN });
  const waiting = useSupportTickets({ status: "WAITING_ON_CUSTOMER", engineerId: engineerParam, size: PER_COLUMN });
  const resolved = useSupportTickets({ status: "RESOLVED", engineerId: engineerParam, size: PER_COLUMN });
  const closed = useSupportTickets({ status: "CLOSED", engineerId: engineerParam, size: PER_COLUMN });

  const byStatus: Record<TicketStatus, ReturnType<typeof useSupportTickets>> = {
    OPEN: open,
    IN_PROGRESS: inProgress,
    WAITING_ON_CUSTOMER: waiting,
    RESOLVED: resolved,
    CLOSED: closed,
  };

  const onDropTo = (target: TicketStatus, payload: string) => {
    setDragOverStatus(null);
    try {
      const { id, from } = JSON.parse(payload) as { id: string; from: TicketStatus };
      if (id && from !== target) updateStatus.mutate({ id, status: target });
    } catch {
      // malformed drag payload — ignore
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Support board"
        description="Drag tickets across columns to update status. Built for standups."
        actions={
          <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New ticket
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/support">
                <Inbox className="mr-1 h-4 w-4" /> Inbox
              </Link>
            </Button>
          </div>
        }
      />

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const q = byStatus[col.status];
          const tickets = q.data?.content ?? [];
          const isOver = dragOverStatus === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStatus !== col.status) setDragOverStatus(col.status);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer actually leaves the column, not a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null);
              }}
              onDrop={(e) => onDropTo(col.status, e.dataTransfer.getData("text/plain"))}
              className={cn(
                "flex min-h-0 flex-col rounded-lg border border-t-2 bg-muted/30",
                col.accent,
                isOver && "ring-2 ring-primary ring-offset-1"
              )}
            >
              <div className="flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>{col.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {q.isLoading ? "…" : tickets.length}
                  {tickets.length >= PER_COLUMN ? "+" : ""}
                </Badge>
              </div>
              <div className="min-h-[4rem] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {q.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : tickets.length === 0 ? (
                  <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Empty</p>
                ) : (
                  tickets.map((t) => <BoardCard key={t.id} ticket={t} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ ticket }: { ticket: SupportTicketDto }) {
  return (
    <Link
      to={`/support?ticket=${ticket.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ id: ticket.id, from: ticket.status })
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      className="block cursor-grab rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{ticket.subject}</span>
        <Badge variant={PRIORITY_META[ticket.priority].variant} className="shrink-0 text-[10px]">
          {PRIORITY_META[ticket.priority].label}
        </Badge>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {ticket.instituteName || ticket.instituteId}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {ticket.overdue ? (
          <Badge variant="destructive" className="gap-0.5 text-[10px]">
            <AlertTriangle className="h-2.5 w-2.5" /> overdue
          </Badge>
        ) : null}
        {ticket.source && ticket.source !== "PORTAL" ? (
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABEL[ticket.source]}
          </Badge>
        ) : null}
        {ticket.eta ? (
          <Badge variant="secondary" className="gap-0.5 text-[10px]">
            <CalendarClock className="h-2.5 w-2.5" /> {fmt(ticket.eta)}
          </Badge>
        ) : null}
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {ticket.assignedEngineerName ? (
          <span>{ticket.assignedEngineerName}</span>
        ) : (
          <span className="text-amber-600">Unassigned</span>
        )}
      </div>
    </Link>
  );
}
